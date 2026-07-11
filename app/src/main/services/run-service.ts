import type { BenchLocalExecutionMode, BenchPackRunSummary, GenerationRequest, ProgressEvent, ScenarioMeta } from "@core";
import { resumeBenchPackRun, retryScenarioForBenchPackRun, runConfiguredBenchPack } from "@benchpack-host";
import type { AgentEventBus } from "./agent-event-bus";
import type { BenchPackService, RuntimeCompatibility } from "./benchpack-service";
import type { ConfigService } from "./config-service";
import type { HistoryService } from "./history-service";

export type ProgressCallback = (event: ProgressEvent) => void;
export type RetryBatchKind = "provider_errors" | "failed_results";
export type RetryScenarioCell = { modelId: string; scenarioId: string };
export type RetryBatchPlan = {
  tabId: string;
  benchPackId: string;
  runId: string;
  kind: RetryBatchKind;
  executionMode: BenchLocalExecutionMode;
  cells: RetryScenarioCell[];
  groups: RetryScenarioCell[][];
};
export type RunBenchPackInput = {
  tabId: string;
  benchPackId: string;
  modelIds?: string[];
  executionMode?: BenchLocalExecutionMode;
  runsPerTest?: number;
  generation?: GenerationRequest;
};
export type RetryScenarioInput = {
  tabId: string;
  benchPackId: string;
  runId: string;
  scenarioId: string;
  modelId: string;
  runsPerTest?: number;
  generation?: GenerationRequest;
};
export type ResumeRunInput = {
  tabId: string;
  benchPackId: string;
  runId: string;
  executionMode?: BenchLocalExecutionMode;
  runsPerTest?: number;
  generation?: GenerationRequest;
};

export type RunHostOperations = {
  runConfiguredBenchPack: typeof runConfiguredBenchPack;
  retryScenarioForBenchPackRun: typeof retryScenarioForBenchPackRun;
  resumeBenchPackRun: typeof resumeBenchPackRun;
};
const defaultOperations: RunHostOperations = { runConfiguredBenchPack, retryScenarioForBenchPackRun, resumeBenchPackRun };
const RUN_RELEASE_TIMEOUT_MS = 5000;

function uniqueValues(values: string[]): string[] {
  return values.filter((value, index, all) => Boolean(value) && all.indexOf(value) === index);
}

function getRunModelOrder(summary: BenchPackRunSummary): string[] {
  const runStarted = summary.events.find(
    (event): event is Extract<ProgressEvent, { type: "run_started" }> => event.type === "run_started"
  );
  return uniqueValues([...(runStarted?.models.map((model) => model.id) ?? []), ...Object.keys(summary.resultsByModel)]);
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
      if (result.status !== "fail") continue;
      const isProviderError = result.errorType === "provider_error";
      if (kind === "provider_errors" && !isProviderError) continue;
      if (kind === "failed_results" && isProviderError) continue;
      cells.push({ modelId, scenarioId: result.scenarioId });
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

export class RunService {
  private readonly activeRuns = new Map<string, { benchPackId: string; controller: AbortController }>();
  private readonly operations: RunHostOperations;

  constructor(
    private readonly eventBus: AgentEventBus,
    private readonly configService: ConfigService,
    private readonly benchPackService: BenchPackService,
    private readonly historyService: HistoryService,
    private readonly getRuntimeCompatibility: () => Promise<RuntimeCompatibility>,
    operations: Partial<RunHostOperations> = {}
  ) {
    this.operations = { ...defaultOperations, ...operations };
  }

  listActiveRuns() {
    return Array.from(this.activeRuns.entries()).map(([tabId, run]) => ({ tabId, benchPackId: run.benchPackId }));
  }

  async runBenchPack(input: RunBenchPackInput, onEvent?: ProgressCallback) {
    await this.prepareRunSlot(input.tabId, input.benchPackId);
    const { config } = await this.configService.loadConfig();
    const activeRun = this.activeRuns.get(input.tabId);
    if (!activeRun) throw new Error("Benchmark run slot was not initialized.");

    try {
      const result = await this.operations.runConfiguredBenchPack(
        config,
        input.benchPackId,
        {
          modelIds: input.modelIds,
          executionMode: input.executionMode,
          runsPerTest: input.runsPerTest,
          generation: input.generation,
          abortSignal: activeRun.controller.signal,
          onEvent: (event) => {
            this.emitRunEvent(input.tabId, input.benchPackId, event);
            onEvent?.(event);
          }
        },
        await this.getRuntimeCompatibility()
      );
      this.eventBus.emitAgentEvent("benchpack.run.finished", {
        tabId: input.tabId,
        benchPackId: input.benchPackId,
        runId: result.runId,
        cancelled: result.cancelled === true
      });
      return result;
    } catch (error) {
      this.eventBus.emitAgentEvent("benchpack.run.error", {
        tabId: input.tabId,
        benchPackId: input.benchPackId,
        message: error instanceof Error ? error.message : String(error)
      });
      throw error;
    } finally {
      this.activeRuns.delete(input.tabId);
    }
  }

  async retryScenario(input: RetryScenarioInput, onEvent?: ProgressCallback) {
    const { config } = await this.configService.loadConfig();
    return this.operations.retryScenarioForBenchPackRun(
      config,
      input.benchPackId,
      {
        runId: input.runId,
        scenarioId: input.scenarioId,
        modelId: input.modelId,
        runsPerTest: input.runsPerTest,
        generation: input.generation,
        onEvent: (event) => {
          this.emitRunEvent(input.tabId, input.benchPackId, event);
          onEvent?.(event);
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
    const summary = await this.historyService.loadRunHistory(input.benchPackId, input.runId);
    const inspection = (await this.benchPackService.listBenchPacks()).find((candidate) => candidate.id === input.benchPackId);
    const scenarioOrder = getRunScenarioOrder(summary, inspection?.scenarios ?? []);
    const modelOrder = getRunModelOrder(summary);
    const cells = collectRetryCells(summary, input.kind);
    return { ...input, cells, groups: groupRetryCellsForExecutionMode(cells, input.executionMode, scenarioOrder, modelOrder) };
  }

  async executeRetryBatch(
    plan: RetryBatchPlan,
    input: { runsPerTest?: number; generation?: GenerationRequest },
    onEvent?: ProgressCallback
  ) {
    const failures: Array<{ modelId: string; scenarioId: string; message: string }> = [];
    for (const group of plan.groups) {
      await Promise.all(
        group.map(async (cell) => {
          try {
            await this.retryScenario({
              tabId: plan.tabId,
              benchPackId: plan.benchPackId,
              runId: plan.runId,
              scenarioId: cell.scenarioId,
              modelId: cell.modelId,
              runsPerTest: input.runsPerTest,
              generation: input.generation
            }, onEvent);
          } catch (error) {
            failures.push({ ...cell, message: error instanceof Error ? error.message : String(error) });
          }
        })
      );
    }
    return {
      run: await this.historyService.loadRunHistory(plan.benchPackId, plan.runId),
      attempted: plan.cells.length,
      failed: failures.length,
      failures
    };
  }

  async resumeRun(input: ResumeRunInput, onEvent?: ProgressCallback) {
    await this.prepareRunSlot(input.tabId, input.benchPackId);
    const { config } = await this.configService.loadConfig();
    const activeRun = this.activeRuns.get(input.tabId);
    if (!activeRun) throw new Error("Benchmark run slot was not initialized.");

    try {
      const result = await this.operations.resumeBenchPackRun(
        config,
        input.benchPackId,
        {
          runId: input.runId,
          executionMode: input.executionMode,
          runsPerTest: input.runsPerTest,
          generation: input.generation,
          abortSignal: activeRun.controller.signal,
          onEvent: (event) => {
            this.emitRunEvent(input.tabId, input.benchPackId, event);
            onEvent?.(event);
          }
        },
        await this.getRuntimeCompatibility()
      );
      this.eventBus.emitAgentEvent("benchpack.run.finished", {
        tabId: input.tabId,
        benchPackId: input.benchPackId,
        runId: result.runId,
        cancelled: result.cancelled === true
      });
      return result;
    } catch (error) {
      this.eventBus.emitAgentEvent("benchpack.run.error", {
        tabId: input.tabId,
        benchPackId: input.benchPackId,
        runId: input.runId,
        message: error instanceof Error ? error.message : String(error)
      });
      throw error;
    } finally {
      this.activeRuns.delete(input.tabId);
    }
  }

  stopRun(tabId: string) {
    const activeRun = this.activeRuns.get(tabId);
    if (!activeRun) return { stopped: false };
    activeRun.controller.abort(new Error("Run cancelled by user."));
    return { stopped: true };
  }

  hasActiveRuns(): boolean {
    return this.activeRuns.size > 0;
  }

  // shutdown 只发出取消信号，Controller 继续与 verifier 共用同一个总超时窗口。
  cancelActiveRunsForShutdown(): void {
    for (const activeRun of this.activeRuns.values()) {
      activeRun.controller.abort(new Error("Run cancelled because BenchLocal is shutting down."));
    }
  }

  private async prepareRunSlot(tabId: string, benchPackId: string) {
    const existingActiveRun = this.activeRuns.get(tabId);
    if (existingActiveRun) {
      if (existingActiveRun.controller.signal.aborted) await this.waitForRunRelease(tabId);
      else throw new Error("A benchmark run is already active for this tab.");
    }
    this.activeRuns.set(tabId, { benchPackId, controller: new AbortController() });
  }

  private async waitForRunRelease(tabId: string) {
    const deadline = Date.now() + RUN_RELEASE_TIMEOUT_MS;
    while (this.activeRuns.has(tabId)) {
      if (Date.now() >= deadline) {
        throw new Error("The previous benchmark run is still shutting down. Please wait a moment and try again.");
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  private emitRunEvent(tabId: string, benchPackId: string, event: ProgressEvent) {
    this.eventBus.emitAgentEvent("benchpack.run.event", { tabId, benchPackId, event });
    if (event.type === "run_started") {
      this.eventBus.emitAgentEvent("benchpack.run.started", { tabId, benchPackId, runId: event.runId });
    }
  }
}
