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
  BenchLocalExecutionMode,
  BenchLocalProviderConfig,
  BenchLocalWorkspaceTabModelSelection,
  BenchPackRunSummary,
  GenerationRequest,
} from "@core";
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
import {
  RunService,
  type ProgressCallback,
  type ResumeRunInput,
  type RetryBatchKind,
  type RetryBatchPlan,
  type RetryScenarioInput,
  type RunBenchPackInput
} from "./services/run-service";
import { WorkspaceService } from "./services/workspace-service";
import {
  WebPackService,
  type SaveWebPackHistoryInput,
  type WriteWebPackArtifactInput
} from "./services/webpack-service";
import { loadAppMetadata } from "./app-metadata";
export type { BenchLocalControllerEventName } from "./services/agent-event-bus";


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
  private readonly runService = new RunService(this.eventBus, this.configService, this.benchPackService, this.historyService, () => this.getRuntimeCompatibility());

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
  listActiveRuns() {
    return this.runService.listActiveRuns();
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
  runBenchPack(input: RunBenchPackInput, onEvent?: ProgressCallback) {
    return this.runService.runBenchPack(input, onEvent);
  }

  retryScenario(input: RetryScenarioInput, onEvent?: ProgressCallback) {
    return this.runService.retryScenario(input, onEvent);
  }

  createRetryBatchPlan(input: {
    tabId: string;
    benchPackId: string;
    runId: string;
    kind: RetryBatchKind;
    executionMode: BenchLocalExecutionMode;
  }): Promise<RetryBatchPlan> {
    return this.runService.createRetryBatchPlan(input);
  }

  executeRetryBatch(
    plan: RetryBatchPlan,
    input: { runsPerTest?: number; generation?: GenerationRequest },
    onEvent?: ProgressCallback
  ) {
    return this.runService.executeRetryBatch(plan, input, onEvent);
  }

  resumeRun(input: ResumeRunInput, onEvent?: ProgressCallback) {
    return this.runService.resumeRun(input, onEvent);
  }

  stopRun(tabId: string) {
    return this.runService.stopRun(tabId);
  }

  async stopActiveBenchPackRunsForShutdown(
    options?: { timeoutMs?: number; intervalMs?: number }
  ): Promise<void> {
    if (!this.runService.hasActiveRuns() && !this.verifierService.hasActiveStarts()) return;

    this.runService.cancelActiveRunsForShutdown();
    this.verifierService.cancelActiveStartsForShutdown();

    const timeoutMs = options?.timeoutMs ?? 15000;
    const intervalMs = options?.intervalMs ?? 50;
    const deadline = Date.now() + timeoutMs;

    while (this.runService.hasActiveRuns() || this.verifierService.hasActiveStarts()) {
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

}

export const benchLocalController = new BenchLocalController();
