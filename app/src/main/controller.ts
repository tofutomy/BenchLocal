import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  ArtifactRef,
  BenchLocalChatRequest,
  BenchLocalChatResponse,
  BenchLocalChatStreamEvent,
  BenchLocalAgentCreateModelRequest,
  BenchLocalAgentCreateProviderRequest,
  BenchLocalAgentEvent,
  BenchLocalAgentPatchModelRequest,
  BenchLocalAgentPatchProviderRequest,
  BenchLocalAgentSafeConfig,
  BenchLocalConfig,
  BenchLocalModelConfig,
  BenchLocalExecutionMode,
  BenchLocalProviderConfig,
  BenchLocalWorkspaceTabModelSelection,
  BenchPackRunSummary,
  GenerationRequest,
  ProgressEvent,
  ScenarioMeta,
  WebBenchPackHistoryPayload
} from "@core";
import {
  DEFAULT_BENCHLOCAL_GENERATION,
  expandHomePath,
  loadOrCreateConfig
} from "@core";
import {
  deleteConfiguredBenchPackVerifierImage,
  getConfiguredBenchPackVerifierStatus,
  inspectConfiguredBenchPacks,
  loadRunSummaryForBenchPack,
  resumeBenchPackRun,
  retryScenarioForBenchPackRun,
  runConfiguredBenchPack,
  startConfiguredBenchPackVerifiers,
  stopConfiguredBenchPackVerifiers,
} from "@benchpack-host";
import type { BenchLocalDiscoveredModel } from "@/shared/desktop-api";
import { AgentEventBus } from "./services/agent-event-bus";
import { ConfigService } from "./services/config-service";
import {
  BenchPackService,
  type BenchPackMutationProgress,
  type RuntimeCompatibility
} from "./services/benchpack-service";
import { HistoryService } from "./services/history-service";
import { ModelService } from "./services/model-service";
import { ProviderService } from "./services/provider-service";
import {
  fallbackProviderDisplayName,
  getProviderDisplayName
} from "./services/provider-model-utils";
import { WorkspaceService } from "./services/workspace-service";
import { loadAppMetadata } from "./app-metadata";

export type { BenchLocalControllerEventName } from "./services/agent-event-bus";


type ProgressCallback = (event: ProgressEvent) => void;

type RetryBatchKind = "provider_errors" | "failed_results";

type RetryScenarioCell = {
  modelId: string;
  scenarioId: string;
};

type RetryBatchPlan = {
  tabId: string;
  benchPackId: string;
  runId: string;
  kind: RetryBatchKind;
  executionMode: BenchLocalExecutionMode;
  cells: RetryScenarioCell[];
  groups: RetryScenarioCell[][];
};


type VerifierPreparationProgress = Extract<ProgressEvent, { type: "verifier_preparing" }>;

const RUN_RELEASE_TIMEOUT_MS = 5000;
const VERIFIER_RELEASE_TIMEOUT_MS = 15000;
function uniqueValues(values: string[]): string[] {
  return values.filter((value, index, all) => Boolean(value) && all.indexOf(value) === index);
}

function getRunModelOrder(summary: BenchPackRunSummary): string[] {
  const runStarted = summary.events.find(
    (event): event is Extract<ProgressEvent, { type: "run_started" }> => event.type === "run_started"
  );

  return uniqueValues([
    ...(runStarted?.models.map((model) => model.id) ?? []),
    ...Object.keys(summary.resultsByModel)
  ]);
}

function getRunScenarioOrder(summary: BenchPackRunSummary, scenarios: ScenarioMeta[]): string[] {
  return uniqueValues([
    ...scenarios.map((scenario) => scenario.id),
    ...Object.values(summary.resultsByModel).flatMap((results) => results.map((result) => result.scenarioId))
  ]);
}

function collectRetryCells(summary: BenchPackRunSummary, kind: RetryBatchKind): RetryScenarioCell[] {
  const cells: RetryScenarioCell[] = [];

  for (const [modelId, results] of Object.entries(summary.resultsByModel)) {
    for (const result of results) {
      if (result.status !== "fail") {
        continue;
      }

      const isProviderError = result.errorType === "provider_error";

      if (kind === "provider_errors" && !isProviderError) {
        continue;
      }

      if (kind === "failed_results" && isProviderError) {
        continue;
      }

      cells.push({
        modelId,
        scenarioId: result.scenarioId
      });
    }
  }

  return cells;
}

function groupRetryCellsForExecutionMode(
  cells: RetryScenarioCell[],
  executionMode: BenchLocalExecutionMode,
  scenarioOrder: string[],
  modelOrder: string[]
): RetryScenarioCell[][] {
  const cellSet = new Set(cells.map((cell) => `${cell.modelId}::${cell.scenarioId}`));
  const cellFor = (modelId: string, scenarioId: string): RetryScenarioCell | null =>
    cellSet.has(`${modelId}::${scenarioId}`) ? { modelId, scenarioId } : null;
  const singletonByScenarioThenModel = scenarioOrder.flatMap((scenarioId) =>
    modelOrder.flatMap((modelId) => {
      const cell = cellFor(modelId, scenarioId);
      return cell ? [[cell]] : [];
    })
  );

  switch (executionMode) {
    case "serial":
      return singletonByScenarioThenModel;
    case "serial_by_model":
      return modelOrder.flatMap((modelId) =>
        scenarioOrder.flatMap((scenarioId) => {
          const cell = cellFor(modelId, scenarioId);
          return cell ? [[cell]] : [];
        })
      );
    case "parallel_by_test_case":
      return scenarioOrder
        .map((scenarioId) => modelOrder.flatMap((modelId) => cellFor(modelId, scenarioId) ?? []))
        .filter((group) => group.length > 0);
    case "parallel_by_model":
      return modelOrder
        .map((modelId) => scenarioOrder.flatMap((scenarioId) => cellFor(modelId, scenarioId) ?? []))
        .filter((group) => group.length > 0);
    case "full_parallel":
      return [singletonByScenarioThenModel.flat()].filter((group) => group.length > 0);
    default:
      return singletonByScenarioThenModel;
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function chatCompletionsUrl(baseUrl: string): string {
  return new URL("chat/completions", normalizeBaseUrl(baseUrl)).toString();
}

function getProviderApiKey(provider: BenchLocalProviderConfig): string | undefined {
  return provider.api_key?.trim() || (provider.api_key_env ? process.env[provider.api_key_env]?.trim() : undefined);
}

function getWebInferenceTimeoutMs(generation?: GenerationRequest): number {
  const seconds = generation?.request_timeout_seconds ?? DEFAULT_BENCHLOCAL_GENERATION.request_timeout_seconds;
  return Number.isFinite(seconds) && seconds && seconds > 0 ? seconds * 1000 : 300000;
}

function createProviderHeaders(provider: BenchLocalProviderConfig): Headers {
  const headers = new Headers({
    accept: "application/json",
    "content-type": "application/json"
  });
  const apiKey = getProviderApiKey(provider);

  if (apiKey) {
    headers.set("authorization", `Bearer ${apiKey}`);
  }

  return headers;
}

function createWebInferenceRequestBody(input: BenchLocalChatRequest, model: BenchLocalModelConfig, stream: boolean): Record<string, unknown> {
  const generation = input.generation ?? {};
  const body: Record<string, unknown> = {
    model: model.model,
    messages: input.messages,
    stream,
    ...(input.tools ? { tools: input.tools } : {}),
    ...(input.toolChoice !== undefined ? { tool_choice: input.toolChoice } : {})
  };

  for (const key of [
    "temperature",
    "top_p",
    "top_k",
    "min_p",
    "max_tokens",
    "seed",
    "stop",
    "repetition_penalty",
    "presence_penalty",
    "frequency_penalty",
    "reasoning",
    "provider_options"
  ] as const) {
    const value = generation[key];
    if (value !== undefined) {
      body[key] = value;
    }
  }

  return {
    ...body,
    ...(generation.extra_body ?? {})
  };
}

function createAbortErrorMessage(timeoutMs: number): string {
  return `Provider did not respond within ${Math.ceil(timeoutMs / 1000)} seconds.`;
}

async function fetchWithAbortTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(createAbortErrorMessage(timeoutMs))), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function mapToolCalls(value: unknown): NonNullable<BenchLocalChatResponse["message"]>["tool_calls"] {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const record = entry as Record<string, unknown>;
    const fn = record.function && typeof record.function === "object" ? (record.function as Record<string, unknown>) : {};
    const id = typeof record.id === "string" && record.id.trim() ? record.id : `tool-${index}`;
    const name = typeof fn.name === "string" ? fn.name : typeof record.name === "string" ? record.name : "";
    const rawArguments =
      typeof fn.arguments === "string"
        ? fn.arguments
        : typeof record.arguments === "string"
          ? record.arguments
          : "";

    if (!name) {
      return [];
    }

    return [{ id, name, rawArguments }];
  });
}

function normalizeChatResponse(modelId: string, payload: unknown): BenchLocalChatResponse {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const firstChoice = choices[0] && typeof choices[0] === "object" ? (choices[0] as Record<string, unknown>) : {};
  const message = firstChoice.message && typeof firstChoice.message === "object"
    ? (firstChoice.message as Record<string, unknown>)
    : {};
  const content = typeof message.content === "string" ? message.content : "";

  return {
    id: typeof record.id === "string" ? record.id : undefined,
    modelId,
    message: {
      role: message.role === "system" || message.role === "user" || message.role === "tool" ? message.role : "assistant",
      content,
      tool_calls: mapToolCalls(message.tool_calls)
    },
    content,
    finishReason: typeof firstChoice.finish_reason === "string" ? firstChoice.finish_reason : undefined,
    usage: record.usage && typeof record.usage === "object" ? (record.usage as Record<string, unknown>) : undefined,
    raw: payload
  };
}

function normalizeStreamPayload(modelId: string, payload: unknown): BenchLocalChatStreamEvent[] {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const events: BenchLocalChatStreamEvent[] = [];

  for (const choice of choices) {
    const choiceRecord = choice && typeof choice === "object" ? (choice as Record<string, unknown>) : {};
    const delta = choiceRecord.delta && typeof choiceRecord.delta === "object"
      ? (choiceRecord.delta as Record<string, unknown>)
      : {};
    const content = typeof delta.content === "string" ? delta.content : "";

    if (content) {
      events.push({
        type: "delta",
        id: typeof record.id === "string" ? record.id : undefined,
        modelId,
        content,
        raw: payload
      });
    }

    for (const toolCall of mapToolCalls(delta.tool_calls) ?? []) {
      events.push({
        type: "tool_call",
        id: typeof record.id === "string" ? record.id : undefined,
        modelId,
        toolCall,
        raw: payload
      });
    }
  }

  return events.length > 0
    ? events
    : [{
        type: "delta",
        id: typeof record.id === "string" ? record.id : undefined,
        modelId,
        raw: payload
      }];
}

function getBenchPackRunRoot(config: BenchLocalConfig, benchPackId: string): string {
  return path.join(expandHomePath(config.run_storage_dir), benchPackId);
}

function createWebRunId(benchPackId: string): string {
  return `${benchPackId}-${new Date().toISOString().replaceAll(":", "-")}-${randomUUID().slice(0, 8)}`;
}

function getWebRunSummaryPath(config: BenchLocalConfig, benchPackId: string, runId: string): string {
  return path.join(getBenchPackRunRoot(config, benchPackId), runId, "summary.json");
}

function sanitizeArtifactRelativePath(input: string | undefined, fallbackLabel: string): string {
  const fallback = `${fallbackLabel.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "artifact"}.txt`;
  const raw = input?.trim() || fallback;
  const normalized = path.posix.normalize(raw.replaceAll("\\", "/")).replace(/^(\.\.\/)+/, "");
  const withoutRoot = normalized.replace(/^\/+/, "");
  return withoutRoot && withoutRoot !== "." ? withoutRoot : fallback;
}

function artifactContentToBuffer(content: unknown): Buffer {
  if (typeof content === "string") {
    return Buffer.from(content, "utf8");
  }

  if (content instanceof ArrayBuffer) {
    return Buffer.from(content);
  }

  if (ArrayBuffer.isView(content)) {
    return Buffer.from(content.buffer, content.byteOffset, content.byteLength);
  }

  return Buffer.from(JSON.stringify(content ?? null, null, 2), "utf8");
}

export class BenchLocalController {
  private readonly eventBus = new AgentEventBus();
  private readonly configService = new ConfigService(this.eventBus);
  private readonly workspaceService = new WorkspaceService(this.eventBus, this.configService);
  private readonly providerService = new ProviderService(this.configService, this.workspaceService);
  private readonly modelService = new ModelService(this.eventBus, this.configService, this.workspaceService);
  private readonly benchPackService = new BenchPackService(this.configService, () => this.getRuntimeCompatibility());
  private readonly historyService = new HistoryService(this.configService);
  private readonly activeBenchPackRuns = new Map<
    string,
    {
      benchPackId: string;
      controller: AbortController;
    }
  >();
  private readonly activeVerifierStarts = new Map<
    string,
    {
      controller: AbortController;
    }
  >();

  onAgentEvent(listener: (event: BenchLocalAgentEvent) => void): () => void {
    return this.eventBus.onAgentEvent(listener);
  }

  emitAgentEvent<TPayload>(
    type: BenchLocalAgentEvent["type"],
    payload: TPayload
  ): BenchLocalAgentEvent<TPayload> {
    return this.eventBus.emitAgentEvent(type, payload);
  }

  async getRuntimeCompatibility(): Promise<RuntimeCompatibility> {
    const metadata = await loadAppMetadata();

    return {
      benchLocalVersion: metadata.version
    };
  }

  loadConfig() {
    return this.configService.loadConfig();
  }

  saveConfig(config: BenchLocalConfig) {
    return this.configService.saveConfig(config);
  }

  loadWorkspaceState() {
    return this.workspaceService.loadWorkspaceState();
  }

  saveWorkspaceState(state: Parameters<WorkspaceService["saveWorkspaceState"]>[0]) {
    return this.workspaceService.saveWorkspaceState(state);
  }

  listProviders() {
    return this.providerService.listProviders();
  }

  createProvider(input: BenchLocalAgentCreateProviderRequest) {
    return this.providerService.createProvider(input);
  }

  updateProvider(providerId: string, input: BenchLocalAgentPatchProviderRequest) {
    return this.providerService.updateProvider(providerId, input);
  }

  deleteProvider(providerId: string) {
    return this.providerService.deleteProvider(providerId);
  }

  duplicateProvider(providerId: string) {
    return this.providerService.duplicateProvider(providerId);
  }

  discoverProviderModelsById(providerId: string): Promise<BenchLocalDiscoveredModel[]> {
    return this.providerService.discoverProviderModelsById(providerId);
  }

  createModel(input: BenchLocalAgentCreateModelRequest) {
    return this.modelService.createModel(input);
  }

  updateModel(modelId: string, input: BenchLocalAgentPatchModelRequest) {
    return this.modelService.updateModel(modelId, input);
  }

  deleteModel(modelId: string) {
    return this.modelService.deleteModel(modelId);
  }

  duplicateModel(modelId: string) {
    return this.modelService.duplicateModel(modelId);
  }

  discoverProviderModels(provider: BenchLocalProviderConfig): Promise<BenchLocalDiscoveredModel[]> {
    return this.providerService.discoverProviderModels(provider);
  }

  checkModelAvailability(input: { config: BenchLocalConfig; modelIds?: string[] }) {
    return this.modelService.checkModelAvailability(input);
  }
  listBenchPacks() {
    return this.benchPackService.listBenchPacks();
  }

  loadBenchPackRegistry() {
    return this.benchPackService.loadBenchPackRegistry();
  }

  installBenchPack(benchPackId: string, onProgress?: (progress: BenchPackMutationProgress) => void) {
    return this.benchPackService.installBenchPack(benchPackId, onProgress);
  }

  installBenchPackFromUrl(url: string, onProgress?: (progress: BenchPackMutationProgress) => void) {
    return this.benchPackService.installBenchPackFromUrl(url, onProgress);
  }

  updateBenchPack(benchPackId: string, onProgress?: (progress: BenchPackMutationProgress) => void) {
    return this.benchPackService.updateBenchPack(benchPackId, onProgress);
  }

  uninstallBenchPack(benchPackId: string, onProgress?: (progress: BenchPackMutationProgress) => void) {
    return this.benchPackService.uninstallBenchPack(benchPackId, onProgress);
  }
  async listActiveRuns() {
    return Array.from(this.activeBenchPackRuns.entries()).map(([tabId, run]) => ({
      tabId,
      benchPackId: run.benchPackId
    }));
  }

  listRunHistory(benchPackId: string) {
    return this.historyService.listRunHistory(benchPackId);
  }

  loadRunHistory(benchPackId: string, runId: string) {
    return this.historyService.loadRunHistory(benchPackId, runId);
  }

  clearRunHistory(benchPackId: string) {
    return this.historyService.clearRunHistory(benchPackId);
  }

  deleteRunHistory(benchPackId: string, runIds: string[]) {
    return this.historyService.deleteRunHistory(benchPackId, runIds);
  }
  private async getWebBenchPackManifest(config: BenchLocalConfig, benchPackId: string) {
    const inspections = await inspectConfiguredBenchPacks(config, await this.getRuntimeCompatibility());
    const inspection = inspections.find((candidate) => candidate.id === benchPackId);
    const manifest = inspection?.manifest;

    if (!manifest) {
      throw new Error(`Bench Pack "${benchPackId}" was not found.`);
    }

    if ((manifest.type ?? "table") !== "web") {
      throw new Error(`Bench Pack "${benchPackId}" is not an interactive Web Bench Pack.`);
    }

    return manifest;
  }

  private async getWebInferenceTarget(input: BenchLocalChatRequest): Promise<{
    provider: BenchLocalProviderConfig;
    model: BenchLocalModelConfig;
  }> {
    const { config } = await loadOrCreateConfig();
    const model = config.models.find((candidate) => candidate.id === input.modelId && candidate.enabled);

    if (!model) {
      throw new Error(`Model "${input.modelId}" is not enabled in BenchLocal.`);
    }

    const provider = config.providers[model.provider];

    if (!provider) {
      throw new Error(`Provider "${fallbackProviderDisplayName(model.provider)}" was not found.`);
    }

    if (!provider.enabled) {
      throw new Error(`Provider "${getProviderDisplayName(config.providers, model.provider)}" is disabled.`);
    }

    if ((provider.api_key || provider.api_key_env) && !getProviderApiKey(provider)) {
      throw new Error(`Provider "${getProviderDisplayName(config.providers, model.provider)}" requires an API key, but no secret is available.`);
    }

    return { provider, model };
  }

  async runWebPackChat(input: BenchLocalChatRequest): Promise<BenchLocalChatResponse> {
    const { provider, model } = await this.getWebInferenceTarget(input);
    const response = await fetchWithAbortTimeout(
      chatCompletionsUrl(provider.base_url),
      {
        method: "POST",
        headers: createProviderHeaders(provider),
        body: JSON.stringify(createWebInferenceRequestBody(input, model, false))
      },
      getWebInferenceTimeoutMs(input.generation)
    );

    if (!response.ok) {
      throw new Error(`Provider request failed with ${response.status}.`);
    }

    return normalizeChatResponse(input.modelId, await response.json());
  }

  async streamWebPackChat(input: BenchLocalChatRequest, onEvent: (event: BenchLocalChatStreamEvent) => void | Promise<void>): Promise<void> {
    const { provider, model } = await this.getWebInferenceTarget(input);
    const response = await fetchWithAbortTimeout(
      chatCompletionsUrl(provider.base_url),
      {
        method: "POST",
        headers: createProviderHeaders(provider),
        body: JSON.stringify(createWebInferenceRequestBody(input, model, true))
      },
      getWebInferenceTimeoutMs(input.generation)
    );

    if (!response.ok) {
      const event: BenchLocalChatStreamEvent = {
        type: "error",
        modelId: input.modelId,
        message: `Provider request failed with ${response.status}.`,
        retryable: response.status === 408 || response.status === 409 || response.status === 425 || response.status === 429 || response.status >= 500
      };
      await onEvent(event);
      return;
    }

    await onEvent({
      type: "start",
      modelId: input.modelId
    });

    if (!response.body) {
      await onEvent({
        type: "done",
        modelId: input.modelId
      });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let lastId: string | undefined;

    const consumeLine = async (line: string) => {
      const trimmed = line.trim();

      if (!trimmed.startsWith("data:")) {
        return;
      }

      const data = trimmed.slice("data:".length).trim();

      if (!data || data === "[DONE]") {
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(data) as unknown;
      } catch {
        return;
      }

      for (const event of normalizeStreamPayload(input.modelId, parsed)) {
        if ("id" in event && event.id) {
          lastId = event.id;
        }

        if (event.type === "delta" && event.content) {
          content += event.content;
        }

        await onEvent(event);
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        await consumeLine(line);
      }
    }

    if (buffer.trim()) {
      await consumeLine(buffer);
    }

    await onEvent({
      type: "done",
      id: lastId,
      modelId: input.modelId,
      message: {
        role: "assistant",
        content
      },
      content
    });
  }

  async saveWebPackHistory(input: {
    benchPackId: string;
    runId?: string | null;
    modelIds?: string[];
    payload: WebBenchPackHistoryPayload;
  }): Promise<BenchPackRunSummary> {
    const { config } = await loadOrCreateConfig();
    const manifest = await this.getWebBenchPackManifest(config, input.benchPackId);
    const now = new Date().toISOString();
    const runId = input.runId?.trim() || createWebRunId(input.benchPackId);
    const runDir = path.join(getBenchPackRunRoot(config, input.benchPackId), runId);
    const summaryPath = path.join(runDir, "summary.json");
    await fs.mkdir(runDir, { recursive: true });
    const existing = await loadRunSummaryForBenchPack(config, input.benchPackId, runId).catch(() => null);
    const modelIds = input.modelIds?.filter(Boolean) ?? Object.keys(existing?.resultsByModel ?? {});
    const nextPayload: WebBenchPackHistoryPayload = {
      ...(existing?.webHistory ?? {}),
      ...input.payload,
      metadata: {
        ...(existing?.webHistory?.metadata ?? {}),
        ...(input.payload.metadata ?? {})
      },
      artifacts: [
        ...(existing?.webHistory?.artifacts ?? []),
        ...(input.payload.artifacts ?? [])
      ],
      events: [
        ...(existing?.webHistory?.events ?? []),
        ...(input.payload.events ?? [])
      ]
    };
    const scoreModelId = modelIds[0] ?? "web";
    const summary: BenchPackRunSummary = {
      runId,
      runDir,
      packType: "web",
      packVersion: manifest.version,
      packEntry: manifest.entry,
      packBuildId: manifest.web?.buildId,
      packManifestHash: manifest.web?.manifestHash,
      benchPackId: input.benchPackId,
      benchPackName: manifest.name,
      executionMode: existing?.executionMode,
      runsPerTest: existing?.runsPerTest,
      startedAt: existing?.startedAt ?? now,
      completedAt: now,
      modelCount: modelIds.length,
      scenarioCount: existing?.scenarioCount ?? 0,
      cancelled: nextPayload.status === "cancelled",
      error: nextPayload.status === "error" ? existing?.error ?? "Web Bench Pack reported an error." : undefined,
      events: existing?.events ?? [],
      resultsByModel: existing?.resultsByModel ?? Object.fromEntries(modelIds.map((modelId) => [modelId, []])),
      scores: nextPayload.score ? { [scoreModelId]: nextPayload.score } : existing?.scores ?? {},
      webHistory: nextPayload
    };

    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");
    return summary;
  }

  async writeWebPackArtifact(input: {
    benchPackId: string;
    runId?: string | null;
    modelIds?: string[];
    artifact: {
      kind: string;
      label: string;
      path?: string;
      contentType?: string;
      content: unknown;
    };
  }): Promise<{ summary: BenchPackRunSummary; artifact: ArtifactRef }> {
    const runId = input.runId?.trim() || createWebRunId(input.benchPackId);
    const { config } = await loadOrCreateConfig();
    const runDir = path.join(getBenchPackRunRoot(config, input.benchPackId), runId);
    const artifactPath = sanitizeArtifactRelativePath(input.artifact.path, input.artifact.label);
    const targetPath = path.resolve(runDir, "artifacts", artifactPath);
    const artifactRoot = path.resolve(runDir, "artifacts");

    if (!targetPath.startsWith(`${artifactRoot}${path.sep}`) && targetPath !== artifactRoot) {
      throw new Error("Artifact path must stay inside the run artifacts directory.");
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, artifactContentToBuffer(input.artifact.content));

    const artifact: ArtifactRef = {
      kind: input.artifact.kind,
      label: input.artifact.label,
      path: path.relative(runDir, targetPath),
      contentType: input.artifact.contentType
    };
    const summary = await this.saveWebPackHistory({
      benchPackId: input.benchPackId,
      runId,
      modelIds: input.modelIds,
      payload: {
        artifacts: [artifact]
      }
    });

    return { summary, artifact };
  }

  async listVerifiers() {
    const { config } = await loadOrCreateConfig();
    const inspections = await inspectConfiguredBenchPacks(config, await this.getRuntimeCompatibility());
    const relevant = inspections.filter((inspection) => inspection.manifest?.capabilities.verification || inspection.manifest?.capabilities.sidecars);
    return Promise.all(relevant.map((inspection) => getConfiguredBenchPackVerifierStatus(config, inspection.id)));
  }

  async startVerifier(
    benchPackId: string,
    onProgress?: (progress: VerifierPreparationProgress) => void
  ) {
    const existingActiveStart = this.activeVerifierStarts.get(benchPackId);

    if (existingActiveStart) {
      if (existingActiveStart.controller.signal.aborted) {
        await this.waitForVerifierStartRelease(benchPackId);
      } else {
        throw new Error(`Verifier startup is already active for Bench Pack "${benchPackId}".`);
      }
    }

    const { config } = await loadOrCreateConfig();
    const currentStatus = await getConfiguredBenchPackVerifierStatus(config, benchPackId);
    const controller = new AbortController();
    this.activeVerifierStarts.set(benchPackId, {
      controller
    });

    try {
      return await startConfiguredBenchPackVerifiers(config, benchPackId, {
        abortSignal: controller.signal,
        onProgress: (progress) => {
          const event: VerifierPreparationProgress = {
            type: "verifier_preparing",
            benchPackId,
            benchPackName: currentStatus.benchPackName,
            verifierId: progress.verifierId,
            phase: progress.phase,
            message: progress.message
          };
          this.emitAgentEvent("verifier.event", {
            benchPackId,
            event
          });
          onProgress?.(event);
        }
      });
    } finally {
      this.activeVerifierStarts.delete(benchPackId);
    }
  }

  async stopVerifier(benchPackId: string) {
    const { config } = await loadOrCreateConfig();
    return stopConfiguredBenchPackVerifiers(config, benchPackId);
  }

  async cancelVerifierStart(benchPackId: string) {
    const activeStart = this.activeVerifierStarts.get(benchPackId);

    if (!activeStart) {
      return { cancelled: false };
    }

    activeStart.controller.abort(new Error("Verifier start cancelled by user."));
    return { cancelled: true };
  }

  async deleteVerifierImage(benchPackId: string, verifierId: string) {
    const { config } = await loadOrCreateConfig();
    return deleteConfiguredBenchPackVerifierImage(config, benchPackId, verifierId);
  }

  async runBenchPack(
    input: {
      tabId: string;
      benchPackId: string;
      modelIds?: string[];
      executionMode?: BenchLocalExecutionMode;
      runsPerTest?: number;
      generation?: GenerationRequest;
    },
    onEvent?: ProgressCallback
  ) {
    await this.prepareRunSlot(input.tabId, input.benchPackId);
    const { config } = await loadOrCreateConfig();
    const activeRun = this.activeBenchPackRuns.get(input.tabId);

    if (!activeRun) {
      throw new Error("Benchmark run slot was not initialized.");
    }

    try {
      const result = await runConfiguredBenchPack(
        config,
        input.benchPackId,
        {
          modelIds: input.modelIds,
          executionMode: input.executionMode,
          runsPerTest: input.runsPerTest,
          generation: input.generation,
          abortSignal: activeRun.controller.signal,
          onEvent: (progressEvent) => {
            this.emitRunEvent(input.tabId, input.benchPackId, progressEvent);
            onEvent?.(progressEvent);
          }
        },
        await this.getRuntimeCompatibility()
      );
      this.emitAgentEvent("benchpack.run.finished", {
        tabId: input.tabId,
        benchPackId: input.benchPackId,
        runId: result.runId,
        cancelled: result.cancelled === true
      });
      return result;
    } catch (error) {
      this.emitAgentEvent("benchpack.run.error", {
        tabId: input.tabId,
        benchPackId: input.benchPackId,
        message: error instanceof Error ? error.message : String(error)
      });
      throw error;
    } finally {
      this.activeBenchPackRuns.delete(input.tabId);
    }
  }

  async retryScenario(
    input: {
      tabId: string;
      benchPackId: string;
      runId: string;
      scenarioId: string;
      modelId: string;
      runsPerTest?: number;
      generation?: GenerationRequest;
    },
    onEvent?: ProgressCallback
  ) {
    const { config } = await loadOrCreateConfig();

    return retryScenarioForBenchPackRun(
      config,
      input.benchPackId,
      {
        runId: input.runId,
        scenarioId: input.scenarioId,
        modelId: input.modelId,
        runsPerTest: input.runsPerTest,
        generation: input.generation,
        onEvent: (progressEvent) => {
          this.emitRunEvent(input.tabId, input.benchPackId, progressEvent);
          onEvent?.(progressEvent);
        }
      },
      await this.getRuntimeCompatibility()
    );
  }

  async createRetryBatchPlan(input: {
    tabId: string;
    benchPackId: string;
    runId: string;
    kind: RetryBatchKind;
    executionMode: BenchLocalExecutionMode;
  }): Promise<RetryBatchPlan> {
    const { config } = await loadOrCreateConfig();
    const summary = await loadRunSummaryForBenchPack(config, input.benchPackId, input.runId);
    const inspections = await inspectConfiguredBenchPacks(config, await this.getRuntimeCompatibility());
    const inspection = inspections.find((candidate) => candidate.id === input.benchPackId);
    const scenarioOrder = getRunScenarioOrder(summary, inspection?.scenarios ?? []);
    const modelOrder = getRunModelOrder(summary);
    const cells = collectRetryCells(summary, input.kind);

    return {
      ...input,
      cells,
      groups: groupRetryCellsForExecutionMode(cells, input.executionMode, scenarioOrder, modelOrder)
    };
  }

  async executeRetryBatch(
    plan: RetryBatchPlan,
    input: {
      runsPerTest?: number;
      generation?: GenerationRequest;
    },
    onEvent?: ProgressCallback
  ) {
    const failures: Array<{ modelId: string; scenarioId: string; message: string }> = [];

    for (const group of plan.groups) {
      await Promise.all(
        group.map(async (cell) => {
          try {
            await this.retryScenario(
              {
                tabId: plan.tabId,
                benchPackId: plan.benchPackId,
                runId: plan.runId,
                scenarioId: cell.scenarioId,
                modelId: cell.modelId,
                runsPerTest: input.runsPerTest,
                generation: input.generation
              },
              onEvent
            );
          } catch (error) {
            failures.push({
              ...cell,
              message: error instanceof Error ? error.message : String(error)
            });
          }
        })
      );
    }

    const { config } = await loadOrCreateConfig();

    return {
      run: await loadRunSummaryForBenchPack(config, plan.benchPackId, plan.runId),
      attempted: plan.cells.length,
      failed: failures.length,
      failures
    };
  }

  async resumeRun(
    input: {
      tabId: string;
      benchPackId: string;
      runId: string;
      executionMode?: BenchLocalExecutionMode;
      runsPerTest?: number;
      generation?: GenerationRequest;
    },
    onEvent?: ProgressCallback
  ) {
    await this.prepareRunSlot(input.tabId, input.benchPackId);
    const { config } = await loadOrCreateConfig();
    const activeRun = this.activeBenchPackRuns.get(input.tabId);

    if (!activeRun) {
      throw new Error("Benchmark run slot was not initialized.");
    }

    try {
      const result = await resumeBenchPackRun(
        config,
        input.benchPackId,
        {
          runId: input.runId,
          executionMode: input.executionMode,
          runsPerTest: input.runsPerTest,
          generation: input.generation,
          abortSignal: activeRun.controller.signal,
          onEvent: (progressEvent) => {
            this.emitRunEvent(input.tabId, input.benchPackId, progressEvent);
            onEvent?.(progressEvent);
          }
        },
        await this.getRuntimeCompatibility()
      );
      this.emitAgentEvent("benchpack.run.finished", {
        tabId: input.tabId,
        benchPackId: input.benchPackId,
        runId: result.runId,
        cancelled: result.cancelled === true
      });
      return result;
    } catch (error) {
      this.emitAgentEvent("benchpack.run.error", {
        tabId: input.tabId,
        benchPackId: input.benchPackId,
        runId: input.runId,
        message: error instanceof Error ? error.message : String(error)
      });
      throw error;
    } finally {
      this.activeBenchPackRuns.delete(input.tabId);
    }
  }

  async stopRun(tabId: string) {
    const activeRun = this.activeBenchPackRuns.get(tabId);

    if (!activeRun) {
      return { stopped: false };
    }

    activeRun.controller.abort(new Error("Run cancelled by user."));
    return { stopped: true };
  }

  async stopActiveBenchPackRunsForShutdown(
    options?: {
      timeoutMs?: number;
      intervalMs?: number;
    }
  ): Promise<void> {
    if (this.activeBenchPackRuns.size === 0 && this.activeVerifierStarts.size === 0) {
      return;
    }

    for (const activeRun of this.activeBenchPackRuns.values()) {
      activeRun.controller.abort(new Error("Run cancelled because BenchLocal is shutting down."));
    }

    for (const activeStart of this.activeVerifierStarts.values()) {
      activeStart.controller.abort(new Error("Verifier start cancelled because BenchLocal is shutting down."));
    }

    const timeoutMs = options?.timeoutMs ?? 15000;
    const intervalMs = options?.intervalMs ?? 50;
    const deadline = Date.now() + timeoutMs;

    while (this.activeBenchPackRuns.size > 0 || this.activeVerifierStarts.size > 0) {
      if (Date.now() >= deadline) {
        throw new Error("Timed out while waiting for active Bench Pack work to stop.");
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  createWorkspaceTab(
    workspaceId: string,
    input: {
      benchPackId?: string | null;
      title?: string;
      modelSelections?: BenchLocalWorkspaceTabModelSelection[];
    }
  ) {
    return this.workspaceService.createWorkspaceTab(workspaceId, input);
  }

  patchTab(
    tabId: string,
    patch: Partial<{
      title: string;
      focusedScenarioId: string | null;
      modelSelections: BenchLocalWorkspaceTabModelSelection[];
      samplingOverrides: GenerationRequest;
      executionMode: BenchLocalExecutionMode;
      runsPerTest: number;
    }>
  ) {
    return this.workspaceService.patchTab(tabId, patch);
  }

  selectTabBenchPack(tabId: string, benchPackId: string | null, title?: string) {
    return this.workspaceService.selectTabBenchPack(tabId, benchPackId, title);
  }

  selectTabModels(
    tabId: string,
    input: { modelIds?: string[]; selections?: BenchLocalWorkspaceTabModelSelection[] }
  ) {
    return this.workspaceService.selectTabModels(tabId, input);
  }

  setTabLoadedRun(tabId: string, runId: string | null) {
    return this.workspaceService.setTabLoadedRun(tabId, runId);
  }

  getSafeConfig(): Promise<BenchLocalAgentSafeConfig> {
    return this.configService.getSafeConfig();
  }

  private async prepareRunSlot(tabId: string, benchPackId: string) {
    const existingActiveRun = this.activeBenchPackRuns.get(tabId);

    if (existingActiveRun) {
      if (existingActiveRun.controller.signal.aborted) {
        await this.waitForBenchPackRunRelease(tabId);
      } else {
        throw new Error("A benchmark run is already active for this tab.");
      }
    }

    const controller = new AbortController();
    this.activeBenchPackRuns.set(tabId, {
      benchPackId,
      controller
    });
  }

  private async waitForBenchPackRunRelease(tabId: string) {
    const deadline = Date.now() + RUN_RELEASE_TIMEOUT_MS;

    while (this.activeBenchPackRuns.has(tabId)) {
      if (Date.now() >= deadline) {
        throw new Error("The previous benchmark run is still shutting down. Please wait a moment and try again.");
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  private async waitForVerifierStartRelease(benchPackId: string) {
    const deadline = Date.now() + VERIFIER_RELEASE_TIMEOUT_MS;

    while (this.activeVerifierStarts.has(benchPackId)) {
      if (Date.now() >= deadline) {
        throw new Error(`Timed out while waiting for verifier startup "${benchPackId}" to stop.`);
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  private emitRunEvent(tabId: string, benchPackId: string, event: ProgressEvent) {
    this.emitAgentEvent("benchpack.run.event", {
      tabId,
      benchPackId,
      event
    });

    if (event.type === "run_started") {
      this.emitAgentEvent("benchpack.run.started", {
        tabId,
        benchPackId,
        runId: event.runId
      });
    }
  }

}

export const benchLocalController = new BenchLocalController();
