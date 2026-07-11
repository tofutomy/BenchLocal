import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { BenchPackInspection, BenchPackRunSummary } from "@core";
import { AgentEventBus } from "../src/main/services/agent-event-bus.js";
import { BenchPackService } from "../src/main/services/benchpack-service.js";
import { ConfigService } from "../src/main/services/config-service.js";
import { HistoryService } from "../src/main/services/history-service.js";
import { RunService, type RetryBatchPlan, type RunHostOperations } from "../src/main/services/run-service.js";

const tempRoots: string[] = [];

function createSummary(overrides: Partial<BenchPackRunSummary> = {}): BenchPackRunSummary {
  return {
    runId: "run-1",
    runDir: "C:/tmp/run-1",
    benchPackId: "sample-pack",
    benchPackName: "Sample Pack",
    startedAt: "2026-07-11T00:00:00.000Z",
    completedAt: "2026-07-11T00:00:01.000Z",
    modelCount: 1,
    scenarioCount: 0,
    events: [],
    resultsByModel: {},
    scores: {},
    ...overrides
  };
}

async function createDependencies(
  summary = createSummary(),
  inspections: BenchPackInspection[] = []
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "benchlocal-run-service-test-"));
  tempRoots.push(root);
  vi.spyOn(os, "homedir").mockReturnValue(root);

  const eventBus = new AgentEventBus();
  const configService = new ConfigService(eventBus);
  await configService.loadConfig();
  const benchPackService = new BenchPackService(configService, async () => ({ benchLocalVersion: "0.3.0" }), {
    inspectConfiguredBenchPacks: vi.fn(async () => inspections)
  });
  const historyService = new HistoryService(configService, {
    loadRunSummaryForBenchPack: vi.fn(async () => summary)
  });
  return { eventBus, configService, benchPackService, historyService };
}

function createService(
  dependencies: Awaited<ReturnType<typeof createDependencies>>,
  operations: Partial<RunHostOperations>
) {
  return new RunService(
    dependencies.eventBus,
    dependencies.configService,
    dependencies.benchPackService,
    dependencies.historyService,
    async () => ({ benchLocalVersion: "0.3.0" }),
    operations
  );
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("RunService", () => {
  it("emits run lifecycle events and clears the active slot after success", async () => {
    const summary = createSummary();
    const dependencies = await createDependencies(summary);
    const agentEvents: Array<{ type: string }> = [];
    dependencies.eventBus.onAgentEvent((event) => agentEvents.push(event));
    const runConfigured: RunHostOperations["runConfiguredBenchPack"] = vi.fn(
      async (_config, _benchPackId, options) => {
        await options.onEvent?.({
          type: "run_started",
          runId: "run-1",
          models: [{ id: "model-1", label: "Model 1" }],
          totalScenarios: 0
        });
        return summary;
      }
    );
    const service = createService(dependencies, { runConfiguredBenchPack: runConfigured });

    await expect(service.runBenchPack({ tabId: "tab-1", benchPackId: "sample-pack" })).resolves.toBe(summary);

    expect(service.listActiveRuns()).toEqual([]);
    expect(agentEvents.map((event) => event.type)).toEqual([
      "benchpack.run.event",
      "benchpack.run.started",
      "benchpack.run.finished"
    ]);
  });

  it("rejects duplicate runs and releases the slot after user cancellation", async () => {
    const dependencies = await createDependencies();
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const runConfigured: RunHostOperations["runConfiguredBenchPack"] = vi.fn(
      async (_config, _benchPackId, options) => {
        markStarted?.();
        return new Promise<never>((_resolve, reject) => {
          options.abortSignal?.addEventListener("abort", () => reject(options.abortSignal?.reason));
        });
      }
    );
    const service = createService(dependencies, { runConfiguredBenchPack: runConfigured });

    const activeRun = service.runBenchPack({ tabId: "tab-1", benchPackId: "sample-pack" });
    await started;
    await expect(service.runBenchPack({ tabId: "tab-1", benchPackId: "sample-pack" })).rejects.toThrow(
      "A benchmark run is already active for this tab."
    );
    expect(service.listActiveRuns()).toEqual([{ tabId: "tab-1", benchPackId: "sample-pack" }]);
    expect(service.stopRun("tab-1")).toEqual({ stopped: true });
    await expect(activeRun).rejects.toThrow("Run cancelled by user.");
    expect(service.hasActiveRuns()).toBe(false);
    expect(service.stopRun("tab-1")).toEqual({ stopped: false });
  });

  it("aborts active runs during shutdown", async () => {
    const dependencies = await createDependencies();
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const runConfigured: RunHostOperations["runConfiguredBenchPack"] = vi.fn(
      async (_config, _benchPackId, options) => {
        markStarted?.();
        return new Promise<never>((_resolve, reject) => {
          options.abortSignal?.addEventListener("abort", () => reject(options.abortSignal?.reason));
        });
      }
    );
    const service = createService(dependencies, { runConfiguredBenchPack: runConfigured });

    const activeRun = service.runBenchPack({ tabId: "tab-1", benchPackId: "sample-pack" });
    await started;
    service.cancelActiveRunsForShutdown();
    await expect(activeRun).rejects.toThrow("Run cancelled because BenchLocal is shutting down.");
    expect(service.hasActiveRuns()).toBe(false);
  });

  it("groups retry cells by scenario and aggregates execution failures", async () => {
    const summary = createSummary({
      modelCount: 2,
      scenarioCount: 2,
      events: [{
        type: "run_started",
        runId: "run-1",
        models: [{ id: "model-1", label: "Model 1" }, { id: "model-2", label: "Model 2" }],
        totalScenarios: 2
      }],
      resultsByModel: {
        "model-1": [
          { scenarioId: "scenario-1", status: "fail", summary: "Failed", rawLog: "" },
          { scenarioId: "scenario-2", status: "fail", errorType: "provider_error", summary: "Provider", rawLog: "" }
        ],
        "model-2": [{ scenarioId: "scenario-1", status: "fail", summary: "Failed", rawLog: "" }]
      }
    });
    const inspections: BenchPackInspection[] = [{
      id: "sample-pack",
      source: "registry",
      status: "ready",
      scenarios: [
        { id: "scenario-1", title: "Scenario 1" },
        { id: "scenario-2", title: "Scenario 2" }
      ]
    }];
    const dependencies = await createDependencies(summary, inspections);
    const retryScenario: RunHostOperations["retryScenarioForBenchPackRun"] = vi.fn(
      async (_config, _benchPackId, input) => {
        if (input.modelId === "model-2") throw new Error("Retry failed.");
        return summary;
      }
    );
    const service = createService(dependencies, { retryScenarioForBenchPackRun: retryScenario });
    const plan = await service.createRetryBatchPlan({
      tabId: "tab-1",
      benchPackId: "sample-pack",
      runId: "run-1",
      kind: "failed_results",
      executionMode: "parallel_by_test_case"
    });

    expect(plan.groups).toEqual([[
      { modelId: "model-1", scenarioId: "scenario-1" },
      { modelId: "model-2", scenarioId: "scenario-1" }
    ]]);
    const result = await service.executeRetryBatch(plan as RetryBatchPlan, {});
    expect(result).toMatchObject({
      attempted: 2,
      failed: 1,
      failures: [{ modelId: "model-2", scenarioId: "scenario-1", message: "Retry failed." }]
    });
  });
});
