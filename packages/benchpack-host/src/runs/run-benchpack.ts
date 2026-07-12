// run 主入口编排：加载 Bench Pack、校验 model/verifier、按 execution mode 分发场景执行、写入 summary 与 history。
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  BenchLocalConfig,
  BenchLocalExecutionMode,
  BenchPackManifest,
  GenerationRequest,
  HostContext,
  ModelAvailability,
  BenchPackRunSummary,
  ProgressEvent,
  RegisteredModel,
  ScenarioMeta,
  ScenarioResult,
} from "@benchlocal/core";
import { expandHomePath } from "@benchlocal/core";
import { DEFAULT_BENCHLOCAL_GENERATION } from "@benchlocal/core";
import { mergeSummaryEvents } from "./progress-events.js";
import {
  checkModelAvailability,
  createRuntimeModels,
  createRuntimeProviders,
  createRuntimeSecrets,
  getProviderBaseUrlById
} from "../runtime/model-resolution.js";
import {
  resolveVerifierEndpoints,
  startConfiguredBenchPackVerifiers
} from "../verifier/verifier-service.js";
import {
  createAbortError,
  throwIfAborted
} from "../shared/abort.js";
import { withRunSummaryLock } from "../shared/locks.js";
import { readJsonFile } from "../shared/file-system.js";
import type { BenchLocalRuntimeCompatibility } from "../shared/compatibility.js";
import { loadConfiguredBenchPack, type LoadedBenchPackRuntime } from "../runtime/load-runtime.js";
import { createHostContext } from "../runtime/host-context.js";
import { normalizeRunsPerTest, selectMajorityRepeatedScenarioResult } from "./execution-plan.js";
import {
  executeFullParallelMode,
  executeParallelModelsMode,
  executeParallelTestCasesMode,
  executeSerialByModelMode,
  executeSerialTestCasesMode,
  getHistoricalRunModelIds,
  hasCompleteRunResults,
  mergeResultsByModel,
  normalizeRunSummaryProviderErrorClassification,
  resolveBenchPackGeneration,
  runScenarioWithRepeats,
  upsertScenarioResult,
  toErrorMessage,
  isAbortError
} from "./scenario-execution.js";
export { normalizeRunSummaryProviderErrorClassification } from "./scenario-execution.js";
import {
  appendJsonLine,
  appendTextLine,
  createRunArtifacts,
  getBenchPackRunRoot,
  getRunArtifactsForExistingRun,
  writeRunSummary,
  type RunArtifacts
} from "./run-artifacts.js";
import { startInferenceRelay } from "../providers/inference-endpoints.js";
import {
  captureProviderFetchErrors,
  getProviderHttpErrorFromError,
  isProviderHttpErrorStatus,
  isRecord,
  isRetryableProviderHttpStatus,
  toHttpStatusCode,
  type CapturedProviderHttpError
} from "../providers/provider-errors.js";
import { loadRunSummaryForBenchPack as loadRawRunSummaryForBenchPack } from "../history/history-store.js";
import { getBenchPackManifestType } from "../inspect/manifest.js";

async function loadRunSummaryForBenchPack(
  config: BenchLocalConfig,
  benchPackId: string,
  runId: string
): Promise<BenchPackRunSummary> {
  const summary = await loadRawRunSummaryForBenchPack(config, benchPackId, runId);
  return normalizeRunSummaryProviderErrorClassification(summary);
}

export async function runConfiguredBenchPack(
  config: BenchLocalConfig,
  benchPackId: string,
  options?: {
    modelIds?: string[];
    executionMode?: BenchLocalExecutionMode;
    runsPerTest?: number;
    generation?: GenerationRequest;
    abortSignal?: AbortSignal;
    onEvent?: (event: ProgressEvent) => Promise<void> | void;
  },
  runtime?: BenchLocalRuntimeCompatibility
): Promise<BenchPackRunSummary> {
  const artifacts = await createRunArtifacts(config, benchPackId);
  const { rootDir, manifest, benchPack } = await loadConfiguredBenchPack(config, benchPackId, runtime);
  const events: ProgressEvent[] = [];
  const emit = async (event: ProgressEvent) => {
    events.push(event);
    await appendJsonLine(artifacts.eventsPath, event);
    await options?.onEvent?.(event);
  };

  await startConfiguredBenchPackVerifiers(config, benchPackId, {
    abortSignal: options?.abortSignal,
    onProgress: async (progress) => {
      await emit({
        type: "verifier_preparing",
        benchPackId,
        benchPackName: manifest.name,
        verifierId: progress.verifierId,
        phase: progress.phase,
        message: progress.message
      });
    }
  });
  const hostResources = await createHostContext(config, benchPackId, rootDir, manifest, artifacts);
  const hostContext = hostResources.context;
  let hostDisposed = false;
  const disposeHostResources = async () => {
    if (hostDisposed) {
      return;
    }

    hostDisposed = true;
    await hostResources.dispose();
  };

  try {
    const blockingVerifier = hostContext.verifiers.find((verifier) => verifier.required && verifier.status !== "running");
    const providerBaseUrlById = getProviderBaseUrlById(hostContext.providers);

    if (blockingVerifier) {
      if (blockingVerifier.status === "missing_dependency") {
        throw new Error(blockingVerifier.details ?? `Bench Pack "${manifest.name}" requires Local Docker.`);
      }

      if (blockingVerifier.status === "dependency_not_running") {
        throw new Error(blockingVerifier.details ?? `Bench Pack "${manifest.name}" requires Local Docker to be running.`);
      }

      throw new Error(
        blockingVerifier.details ??
          `Bench Pack "${manifest.name}" requires verifier "${blockingVerifier.id}" to be running before the test can start.`
      );
    }

    const enabledModels = hostContext.models.filter((model) => model.enabled);
    const selectedModels =
      options?.modelIds && options.modelIds.length > 0
        ? options.modelIds
            .map((modelId) => enabledModels.find((model) => model.id === modelId))
            .filter((model): model is (typeof enabledModels)[number] => Boolean(model))
        : enabledModels;

    if (selectedModels.length === 0) {
      throw new Error("No enabled models are configured in BenchLocal.");
    }

    const modelAvailability = await checkModelAvailability(
      hostContext.providers,
      selectedModels,
      hostContext.secrets,
      {
        modelIds: selectedModels.map((model) => model.id),
        abortSignal: options?.abortSignal
      }
    );
    const availableModelIds = new Set(
      modelAvailability.filter((availability) => availability.status === "online").map((availability) => availability.modelId)
    );
    const shouldExecuteAvailableCell = (_scenario: ScenarioMeta, model: RegisteredModel) => availableModelIds.has(model.id);
    const unavailableModels = modelAvailability.filter((availability) => availability.status !== "online");

    if (unavailableModels.length > 0) {
      hostContext.logger.info("Skipping currently unavailable models for this pass.", {
        models: unavailableModels.map((availability) => ({
          modelId: availability.modelId,
          reason: availability.reason,
          details: availability.details
        }))
      });
    }

    const scenarios = await benchPack.listScenarios();
    const prepared = await benchPack.prepare(hostContext);
    const resultsByModel: Record<string, ScenarioResult[]> = Object.fromEntries(selectedModels.map((model) => [model.id, []]));
    const startedAt = new Date().toISOString();
    const executionMode = options?.executionMode ?? "parallel_by_test_case";
    const runsPerTest = normalizeRunsPerTest(options?.runsPerTest);
    const generation = resolveBenchPackGeneration(manifest, options?.generation);
    let runErrorMessage: string | undefined;
    let cancelled = false;

    await emit({
      type: "run_started",
      runId: artifacts.runId,
      models: selectedModels.map((model) => ({ id: model.id, label: model.label })),
      totalScenarios: scenarios.length
    });

    await writeRunSummary(artifacts.summaryPath, {
      runId: artifacts.runId,
      runDir: artifacts.runDir,
      packType: getBenchPackManifestType(manifest),
      packVersion: manifest.version,
      packEntry: manifest.entry,
      packBuildId: manifest.web?.buildId,
      packManifestHash: manifest.web?.manifestHash,
      benchPackId,
      benchPackName: manifest.name,
      executionMode,
      runsPerTest,
      startedAt,
      completedAt: startedAt,
      modelCount: selectedModels.length,
      scenarioCount: scenarios.length,
      cancelled: false,
      error: undefined,
      events,
      resultsByModel,
      scores: Object.fromEntries(selectedModels.map((model) => [model.id, benchPack.scoreModelResults([])]))
    }, normalizeRunSummaryProviderErrorClassification);

    try {
      try {
        throwIfAborted(options?.abortSignal);
        switch (executionMode) {
          case "serial":
            await executeSerialTestCasesMode(
              scenarios,
              selectedModels,
              prepared,
              benchPackId,
              generation,
              runsPerTest,
              emit,
              resultsByModel,
              artifacts.runId,
              providerBaseUrlById,
              shouldExecuteAvailableCell,
              options?.abortSignal
            );
            break;
          case "serial_by_model":
            await executeSerialByModelMode(
              scenarios,
              selectedModels,
              prepared,
              benchPackId,
              generation,
              runsPerTest,
              emit,
              resultsByModel,
              artifacts.runId,
              providerBaseUrlById,
              shouldExecuteAvailableCell,
              options?.abortSignal
            );
            break;
          case "parallel_by_test_case":
            await executeParallelTestCasesMode(scenarios, selectedModels, prepared, benchPackId, generation, runsPerTest, emit, resultsByModel, artifacts.runId, providerBaseUrlById, shouldExecuteAvailableCell, options?.abortSignal);
            break;
          case "full_parallel":
            await executeFullParallelMode(scenarios, selectedModels, prepared, benchPackId, generation, runsPerTest, emit, resultsByModel, artifacts.runId, providerBaseUrlById, shouldExecuteAvailableCell, options?.abortSignal);
            break;
          case "parallel_by_model":
          default:
            await executeParallelModelsMode(scenarios, selectedModels, prepared, benchPackId, generation, runsPerTest, emit, resultsByModel, artifacts.runId, providerBaseUrlById, shouldExecuteAvailableCell, options?.abortSignal);
            break;
        }
      } catch (error) {
        runErrorMessage = toErrorMessage(error);
        cancelled = isAbortError(error) || Boolean(options?.abortSignal?.aborted);
        await emit({
          type: "run_error",
          message: runErrorMessage
        });
      }

      const persistedSummary = await loadRunSummaryForBenchPack(config, benchPackId, artifacts.runId).catch(() => null);
      const mergedResultsByModel = mergeResultsByModel(
        persistedSummary?.resultsByModel ?? {},
        resultsByModel
      );
      const mergedEvents = mergeSummaryEvents(events, persistedSummary?.events);
      const scores = Object.fromEntries(
        Object.entries(mergedResultsByModel).map(([modelId, results]) => [modelId, benchPack.scoreModelResults(results)])
      );

      if (!runErrorMessage) {
        await emit({
          type: "run_finished",
          scores
        });
      }

      const summary: BenchPackRunSummary = {
        runId: artifacts.runId,
        runDir: artifacts.runDir,
        packType: getBenchPackManifestType(manifest),
        packVersion: manifest.version,
        packEntry: manifest.entry,
        packBuildId: manifest.web?.buildId,
        packManifestHash: manifest.web?.manifestHash,
        benchPackId,
        benchPackName: manifest.name,
        executionMode,
        runsPerTest,
        startedAt,
        completedAt: new Date().toISOString(),
        modelCount: selectedModels.length,
        scenarioCount: scenarios.length,
        cancelled,
        error: runErrorMessage,
        events: mergedEvents,
        resultsByModel: mergedResultsByModel,
        scores
      };

      await writeRunSummary(artifacts.summaryPath, summary, normalizeRunSummaryProviderErrorClassification);

      return summary;
    } finally {
      await prepared.dispose();
      await disposeHostResources();
    }
  } catch (error) {
    await disposeHostResources();
    throw error;
  }
}

export { retryScenarioForBenchPackRun, resumeBenchPackRun } from "./retry-resume.js";
