import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  ArtifactRef,
  BenchLocalChatRequest,
  BenchLocalChatResponse,
  BenchLocalChatStreamEvent,
  BenchLocalConfig,
  BenchLocalModelConfig,
  BenchLocalProviderConfig,
  BenchPackRunSummary,
  GenerationRequest,
  WebBenchPackHistoryPayload
} from "@core";
import { DEFAULT_BENCHLOCAL_GENERATION, expandHomePath } from "@core";
import type { BenchPackService } from "./benchpack-service";
import type { ConfigService } from "./config-service";
import type { HistoryService } from "./history-service";
import { fallbackProviderDisplayName, getProviderDisplayName } from "./provider-model-utils";

export type SaveWebPackHistoryInput = {
  benchPackId: string;
  runId?: string | null;
  modelIds?: string[];
  payload: WebBenchPackHistoryPayload;
};

export type WriteWebPackArtifactInput = {
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
};

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
  const headers = new Headers({ accept: "application/json", "content-type": "application/json" });
  const apiKey = getProviderApiKey(provider);
  if (apiKey) headers.set("authorization", `Bearer ${apiKey}`);
  return headers;
}

function createWebInferenceRequestBody(
  input: BenchLocalChatRequest,
  model: BenchLocalModelConfig,
  stream: boolean
): Record<string, unknown> {
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
    if (value !== undefined) body[key] = value;
  }

  return { ...body, ...(generation.extra_body ?? {}) };
}

async function fetchWithAbortTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error(`Provider did not respond within ${Math.ceil(timeoutMs / 1000)} seconds.`)),
    timeoutMs
  );

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function mapToolCalls(value: unknown): NonNullable<BenchLocalChatResponse["message"]>["tool_calls"] {
  if (!Array.isArray(value)) return undefined;

  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];

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

    return name ? [{ id, name, rawArguments }] : [];
  });
}

function normalizeChatResponse(modelId: string, payload: unknown): BenchLocalChatResponse {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const firstChoice = choices[0] && typeof choices[0] === "object" ? (choices[0] as Record<string, unknown>) : {};
  const message =
    firstChoice.message && typeof firstChoice.message === "object"
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
    const delta =
      choiceRecord.delta && typeof choiceRecord.delta === "object"
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
    : [{ type: "delta", id: typeof record.id === "string" ? record.id : undefined, modelId, raw: payload }];
}

function getBenchPackRunRoot(config: BenchLocalConfig, benchPackId: string): string {
  return path.join(expandHomePath(config.run_storage_dir), benchPackId);
}

function createWebRunId(benchPackId: string): string {
  return `${benchPackId}-${new Date().toISOString().replaceAll(":", "-")}-${randomUUID().slice(0, 8)}`;
}

function sanitizeArtifactRelativePath(input: string | undefined, fallbackLabel: string): string {
  const fallback = `${fallbackLabel.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "artifact"}.txt`;
  const raw = input?.trim() || fallback;
  const normalized = path.posix.normalize(raw.replaceAll("\\", "/")).replace(/^(\.\.\/)+/, "");
  const withoutRoot = normalized.replace(/^\/+/, "");
  return withoutRoot && withoutRoot !== "." ? withoutRoot : fallback;
}

function artifactContentToBuffer(content: unknown): Buffer {
  if (typeof content === "string") return Buffer.from(content, "utf8");
  if (content instanceof ArrayBuffer) return Buffer.from(content);
  if (ArrayBuffer.isView(content)) return Buffer.from(content.buffer, content.byteOffset, content.byteLength);
  return Buffer.from(JSON.stringify(content ?? null, null, 2), "utf8");
}

export class WebPackService {
  constructor(
    private readonly configService: ConfigService,
    private readonly benchPackService: BenchPackService,
    private readonly historyService: HistoryService
  ) {}

  private async getWebBenchPackManifest(benchPackId: string) {
    const inspections = await this.benchPackService.listBenchPacks();
    const manifest = inspections.find((candidate) => candidate.id === benchPackId)?.manifest;

    if (!manifest) throw new Error(`Bench Pack "${benchPackId}" was not found.`);
    if ((manifest.type ?? "table") !== "web") {
      throw new Error(`Bench Pack "${benchPackId}" is not an interactive Web Bench Pack.`);
    }
    return manifest;
  }

  private async getWebInferenceTarget(input: BenchLocalChatRequest) {
    const { config } = await this.configService.loadConfig();
    const model = config.models.find((candidate) => candidate.id === input.modelId && candidate.enabled);
    if (!model) throw new Error(`Model "${input.modelId}" is not enabled in BenchLocal.`);

    const provider = config.providers[model.provider];
    if (!provider) throw new Error(`Provider "${fallbackProviderDisplayName(model.provider)}" was not found.`);
    if (!provider.enabled) {
      throw new Error(`Provider "${getProviderDisplayName(config.providers, model.provider)}" is disabled.`);
    }
    if ((provider.api_key || provider.api_key_env) && !getProviderApiKey(provider)) {
      throw new Error(
        `Provider "${getProviderDisplayName(config.providers, model.provider)}" requires an API key, but no secret is available.`
      );
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

    if (!response.ok) throw new Error(`Provider request failed with ${response.status}.`);
    return normalizeChatResponse(input.modelId, await response.json());
  }

  async streamWebPackChat(
    input: BenchLocalChatRequest,
    onEvent: (event: BenchLocalChatStreamEvent) => void | Promise<void>
  ): Promise<void> {
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
      await onEvent({
        type: "error",
        modelId: input.modelId,
        message: `Provider request failed with ${response.status}.`,
        retryable:
          response.status === 408 ||
          response.status === 409 ||
          response.status === 425 ||
          response.status === 429 ||
          response.status >= 500
      });
      return;
    }

    await onEvent({ type: "start", modelId: input.modelId });
    if (!response.body) {
      await onEvent({ type: "done", modelId: input.modelId });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let lastId: string | undefined;

    const consumeLine = async (line: string) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) return;
      const data = trimmed.slice("data:".length).trim();
      if (!data || data === "[DONE]") return;

      let parsed: unknown;
      try {
        parsed = JSON.parse(data) as unknown;
      } catch {
        return;
      }

      for (const event of normalizeStreamPayload(input.modelId, parsed)) {
        if ("id" in event && event.id) lastId = event.id;
        if (event.type === "delta" && event.content) content += event.content;
        await onEvent(event);
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) await consumeLine(line);
    }

    if (buffer.trim()) await consumeLine(buffer);
    await onEvent({
      type: "done",
      id: lastId,
      modelId: input.modelId,
      message: { role: "assistant", content },
      content
    });
  }

  async saveWebPackHistory(input: SaveWebPackHistoryInput): Promise<BenchPackRunSummary> {
    const { config } = await this.configService.loadConfig();
    const manifest = await this.getWebBenchPackManifest(input.benchPackId);
    const now = new Date().toISOString();
    const runId = input.runId?.trim() || createWebRunId(input.benchPackId);
    const runDir = path.join(getBenchPackRunRoot(config, input.benchPackId), runId);
    const summaryPath = path.join(runDir, "summary.json");
    await fs.mkdir(runDir, { recursive: true });
    const existing = await this.historyService.loadRunHistory(input.benchPackId, runId).catch(() => null);
    const modelIds = input.modelIds?.filter(Boolean) ?? Object.keys(existing?.resultsByModel ?? {});
    const nextPayload: WebBenchPackHistoryPayload = {
      ...(existing?.webHistory ?? {}),
      ...input.payload,
      metadata: { ...(existing?.webHistory?.metadata ?? {}), ...(input.payload.metadata ?? {}) },
      artifacts: [...(existing?.webHistory?.artifacts ?? []), ...(input.payload.artifacts ?? [])],
      events: [...(existing?.webHistory?.events ?? []), ...(input.payload.events ?? [])]
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

  async writeWebPackArtifact(
    input: WriteWebPackArtifactInput
  ): Promise<{ summary: BenchPackRunSummary; artifact: ArtifactRef }> {
    const runId = input.runId?.trim() || createWebRunId(input.benchPackId);
    const { config } = await this.configService.loadConfig();
    const runDir = path.join(getBenchPackRunRoot(config, input.benchPackId), runId);
    const artifactPath = sanitizeArtifactRelativePath(input.artifact.path, input.artifact.label);
    const targetPath = path.resolve(runDir, "artifacts", artifactPath);
    const artifactRoot = path.resolve(runDir, "artifacts");

    if (!targetPath.startsWith(`${artifactRoot}${path.sep}`) && targetPath !== artifactRoot) {
      throw new Error("Artifact path must stay inside the run artifacts directory.");
    }

    // 先将内容限制在 run/artifacts 下，再把相对路径写入历史摘要。
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
      payload: { artifacts: [artifact] }
    });
    return { summary, artifact };
  }
}
