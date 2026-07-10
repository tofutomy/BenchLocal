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
} from "@core";
import { loadOrCreateConfig } from "@core";
import {
  inspectConfiguredBenchPacks,
  loadRunSummaryForBenchPack,
  resumeBenchPackRun,
  retryScenarioForBenchPackRun,
  runConfiguredBenchPack,
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
import {
  VerifierService,
  type VerifierPreparationProgress
} from "./services/verifier-service";
import { ModelService } from "./services/model-service";
import { ProviderService } from "./services/provider-service";
import { WorkspaceService } from "./services/workspace-service";
import {
  WebPackService,
  type SaveWebPackHistoryInput,
  type WriteWebPackArtifactInput
} from "./services/webpack-service";
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



const RUN_RELEASE_TIMEOUT_MS = 5000;
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

export class BenchLocalController {
  private readonly eventBus = new AgentEventBus();
  private readonly configService = new ConfigService(this.eventBus);
  private readonly workspaceService = new WorkspaceService(this.eventBus, this.configService);
  private readonly providerService = new ProviderService(this.configService, this.workspaceService);
  private readonly modelService = new ModelService(this.eventBus, this.configService, this.workspaceService);
  private readonly benchPackService = new BenchPackService(this.configService, () => this.getRuntimeCompatibility());
  private readonly historyService = new HistoryService(this.configService);
  private readonly webPackService = new WebPackService(this.configService, this.benchPackService, this.historyService);
  private readonly verifierService = new VerifierService(this.eventBus, this.configService, this.benchPackService);
  private readonly activeBenchPackRuns = new Map<
    string,
    {
      benchPackId: string;
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
  runWebPackChat(input: BenchLocalChatRequest): Promise<BenchLocalChatResponse> {
    return this.webPackService.runWebPackChat(input);
  }

  streamWebPackChat(
    input: BenchLocalChatRequest,
    onEvent: (event: BenchLocalChatStreamEvent) => void | Promise<void>
  ): Promise<void> {
    return this.webPackService.streamWebPackChat(input, onEvent);
  }

  saveWebPackHistory(input: SaveWebPackHistoryInput): Promise<BenchPackRunSummary> {
    return this.webPackService.saveWebPackHistory(input);
  }

  writeWebPackArtifact(
    input: WriteWebPackArtifactInput
  ): Promise<{ summary: BenchPackRunSummary; artifact: ArtifactRef }> {
    return this.webPackService.writeWebPackArtifact(input);
  }
  listVerifiers() {
    return this.verifierService.listVerifiers();
  }

  startVerifier(
    benchPackId: string,
    onProgress?: (progress: VerifierPreparationProgress) => void
  ) {
    return this.verifierService.startVerifier(benchPackId, onProgress);
  }

  stopVerifier(benchPackId: string) {
    return this.verifierService.stopVerifier(benchPackId);
  }

  cancelVerifierStart(benchPackId: string) {
    return this.verifierService.cancelVerifierStart(benchPackId);
  }

  deleteVerifierImage(benchPackId: string, verifierId: string) {
    return this.verifierService.deleteVerifierImage(benchPackId, verifierId);
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
    if (this.activeBenchPackRuns.size === 0 && !this.verifierService.hasActiveStarts()) {
      return;
    }

    for (const activeRun of this.activeBenchPackRuns.values()) {
      activeRun.controller.abort(new Error("Run cancelled because BenchLocal is shutting down."));
    }

    this.verifierService.cancelActiveStartsForShutdown();

    const timeoutMs = options?.timeoutMs ?? 15000;
    const intervalMs = options?.intervalMs ?? 50;
    const deadline = Date.now() + timeoutMs;

    while (this.activeBenchPackRuns.size > 0 || this.verifierService.hasActiveStarts()) {
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
