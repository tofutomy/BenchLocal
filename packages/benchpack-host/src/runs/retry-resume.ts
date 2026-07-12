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

export async function retryScenarioForBenchPackRun(
  config: BenchLocalConfig,
  benchPackId: string,
  options: {
    runId: string;
    scenarioId: string;
    modelId: string;
    runsPerTest?: number;
    generation?: GenerationRequest;
    abortSignal?: AbortSignal;
    onEvent?: (event: ProgressEvent) => Promise<void> | void;
  },
  runtime?: BenchLocalRuntimeCompatibility
): Promise<BenchPackRunSummary> {
  const existingSummary = await loadRunSummaryForBenchPack(config, benchPackId, options.runId);
  const artifacts = getRunArtifactsForExistingRun(existingSummary);
  const { rootDir, manifest, benchPack } = await loadConfiguredBenchPack(config, benchPackId, runtime);
  const retryEvents: ProgressEvent[] = [];
  const emit = async (event: ProgressEvent) => {
    retryEvents.push(event);
    await appendJsonLine(artifacts.eventsPath, event);
    await options.onEvent?.(event);
  };

  await startConfiguredBenchPackVerifiers(config, benchPackId, {
    abortSignal: options.abortSignal,
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

    const providerBaseUrlById = getProviderBaseUrlById(hostContext.providers);
    const scenarioList = await benchPack.listScenarios();
    const scenarioIndex = scenarioList.findIndex((candidate) => candidate.id === options.scenarioId);
    const scenario = scenarioIndex >= 0 ? scenarioList[scenarioIndex] : null;

    if (!scenario) {
      throw new Error(`Scenario "${options.scenarioId}" was not found for Bench Pack "${benchPackId}".`);
    }

    const model = hostContext.models.find((candidate) => candidate.id === options.modelId);

    if (!model) {
      throw new Error(`Model "${options.modelId}" is not currently enabled in BenchLocal.`);
    }

    const prepared = await benchPack.prepare(hostContext);
    const generation = resolveBenchPackGeneration(manifest, options.generation);
    const runsPerTest = normalizeRunsPerTest(options.runsPerTest ?? existingSummary.runsPerTest);

    try {
      await emit({
        type: "scenario_started",
        scenarioId: scenario.id,
        title: scenario.title,
        index: scenarioIndex + 1,
        total: scenarioList.length
      });
      await emit({
        type: "model_progress",
        modelId: model.id,
        scenarioId: scenario.id,
        message: `Retrying ${scenario.title} for ${model.label}.`
      });

      const result = await runScenarioWithRepeats(
        prepared,
        {
          runId: existingSummary.runId,
          benchPackId,
          scenario,
          model,
          providerBaseUrl: providerBaseUrlById.get(model.provider),
          abortSignal: options.abortSignal,
          generation,
          runsPerTest
        },
        emit
      );

      await emit({
        type: "scenario_result",
        modelId: model.id,
        scenarioId: scenario.id,
        result
      });
      await emit({
        type: "scenario_finished",
        scenarioId: scenario.id
      });

      return await withRunSummaryLock(`${benchPackId}:${existingSummary.runId}`, async () => {
        const latestSummary = await loadRunSummaryForBenchPack(config, benchPackId, existingSummary.runId);
        const nextResultsByModel: Record<string, ScenarioResult[]> = {
          ...latestSummary.resultsByModel,
          [model.id]: upsertScenarioResult(latestSummary.resultsByModel[model.id] ?? [], result)
        };

        const nextSnapshot: BenchPackRunSummary = {
          ...latestSummary,
          resultsByModel: nextResultsByModel
        };
        const isComplete = hasCompleteRunResults(nextSnapshot);
        const scores = Object.fromEntries(
          Object.entries(nextResultsByModel).map(([modelId, results]) => [modelId, benchPack.scoreModelResults(results)])
        );

        const nextSummary: BenchPackRunSummary = {
          ...latestSummary,
          runsPerTest,
          completedAt: new Date().toISOString(),
          cancelled: isComplete ? false : latestSummary.cancelled,
          error: isComplete ? undefined : latestSummary.error,
          events: [...latestSummary.events, ...retryEvents],
          resultsByModel: nextResultsByModel,
          scores
        };

        await writeRunSummary(artifacts.summaryPath, nextSummary, normalizeRunSummaryProviderErrorClassification);
        return nextSummary;
      });
    } finally {
      await prepared.dispose();
      await disposeHostResources();
    }
  } catch (error) {
    await disposeHostResources();
    throw error;
  }
}

export async function resumeBenchPackRun(
  config: BenchLocalConfig,
  benchPackId: string,
  options: {
    runId: string;
    executionMode?: BenchLocalExecutionMode;
    runsPerTest?: number;
    generation?: GenerationRequest;
    abortSignal?: AbortSignal;
    onEvent?: (event: ProgressEvent) => Promise<void> | void;
  },
  runtime?: BenchLocalRuntimeCompatibility
): Promise<BenchPackRunSummary> {
  const existingSummary = await loadRunSummaryForBenchPack(config, benchPackId, options.runId);

  if (hasCompleteRunResults(existingSummary)) {
    return existingSummary;
  }

  const artifacts = getRunArtifactsForExistingRun(existingSummary);
  const { rootDir, manifest, benchPack } = await loadConfiguredBenchPack(config, benchPackId, runtime);
  const resumeEvents: ProgressEvent[] = [];
  const emit = async (event: ProgressEvent) => {
    resumeEvents.push(event);
    await appendJsonLine(artifacts.eventsPath, event);
    await options.onEvent?.(event);
  };

  await startConfiguredBenchPackVerifiers(config, benchPackId, {
    abortSignal: options.abortSignal,
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

    const providerBaseUrlById = getProviderBaseUrlById(hostContext.providers);
    const historicalModelIds = getHistoricalRunModelIds(existingSummary);
    const enabledModels = hostContext.models.filter((model) => model.enabled);
    const selectedModels = historicalModelIds
      .map((modelId) => enabledModels.find((model) => model.id === modelId))
      .filter((model): model is (typeof enabledModels)[number] => Boolean(model));
    const missingModelIds = historicalModelIds.filter((modelId) => !selectedModels.some((model) => model.id === modelId));

    if (missingModelIds.length > 0) {
      throw new Error(
        `This saved run cannot be resumed because these historical models are not currently enabled: ${missingModelIds.join(", ")}.`
      );
    }

    if (selectedModels.length === 0) {
      throw new Error("This saved run has no resumable models.");
    }

    const modelAvailability = await checkModelAvailability(
      hostContext.providers,
      selectedModels,
      hostContext.secrets,
      {
        modelIds: selectedModels.map((model) => model.id),
        abortSignal: options.abortSignal
      }
    );
    const availableModelIds = new Set(
      modelAvailability.filter((availability) => availability.status === "online").map((availability) => availability.modelId)
    );
    const unavailableModels = modelAvailability.filter((availability) => availability.status !== "online");

    if (unavailableModels.length > 0) {
      hostContext.logger.info("Skipping currently unavailable models while resuming this run.", {
        models: unavailableModels.map((availability) => ({
          modelId: availability.modelId,
          reason: availability.reason,
          details: availability.details
        }))
      });
    }

    const scenarios = await benchPack.listScenarios();
    const existingCellKeys = new Set(
      Object.entries(existingSummary.resultsByModel).flatMap(([modelId, results]) =>
        results.map((result) => `${modelId}::${result.scenarioId}`)
      )
    );
    const shouldExecuteCell = (scenario: ScenarioMeta, model: RegisteredModel) =>
      availableModelIds.has(model.id) && !existingCellKeys.has(`${model.id}::${scenario.id}`);
    const resultsByModel: Record<string, ScenarioResult[]> = Object.fromEntries(selectedModels.map((model) => [model.id, []]));
    const prepared = await benchPack.prepare(hostContext);
    const executionMode = options.executionMode ?? existingSummary.executionMode ?? "parallel_by_test_case";
    const runsPerTest = normalizeRunsPerTest(options.runsPerTest ?? existingSummary.runsPerTest);
    const generation = resolveBenchPackGeneration(manifest, options.generation);
    let runErrorMessage: string | undefined;
    let cancelled = false;

    try {
      await emit({
        type: "run_started",
        runId: existingSummary.runId,
        models: selectedModels.map((model) => ({ id: model.id, label: model.label })),
        totalScenarios: scenarios.length
      });

      try {
        throwIfAborted(options.abortSignal);
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
              existingSummary.runId,
              providerBaseUrlById,
              shouldExecuteCell,
              options.abortSignal
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
              existingSummary.runId,
              providerBaseUrlById,
              shouldExecuteCell,
              options.abortSignal
            );
            break;
          case "parallel_by_test_case":
            await executeParallelTestCasesMode(
              scenarios,
              selectedModels,
              prepared,
              benchPackId,
              generation,
              runsPerTest,
              emit,
              resultsByModel,
              existingSummary.runId,
              providerBaseUrlById,
              shouldExecuteCell,
              options.abortSignal
            );
            break;
          case "full_parallel":
            await executeFullParallelMode(
              scenarios,
              selectedModels,
              prepared,
              benchPackId,
              generation,
              runsPerTest,
              emit,
              resultsByModel,
              existingSummary.runId,
              providerBaseUrlById,
              shouldExecuteCell,
              options.abortSignal
            );
            break;
          case "parallel_by_model":
          default:
            await executeParallelModelsMode(
              scenarios,
              selectedModels,
              prepared,
              benchPackId,
              generation,
              runsPerTest,
              emit,
              resultsByModel,
              existingSummary.runId,
              providerBaseUrlById,
              shouldExecuteCell,
              options.abortSignal
            );
            break;
        }
      } catch (error) {
        runErrorMessage = toErrorMessage(error);
        cancelled = isAbortError(error) || Boolean(options.abortSignal?.aborted);
        await emit({
          type: "run_error",
          message: runErrorMessage
        });
      }

      return await withRunSummaryLock(`${benchPackId}:${existingSummary.runId}`, async () => {
        const latestSummary = await loadRunSummaryForBenchPack(config, benchPackId, existingSummary.runId);
        const mergedResultsByModel = mergeResultsByModel(resultsByModel, latestSummary.resultsByModel);
        const mergedEvents = [...latestSummary.events, ...resumeEvents];
        const scores = Object.fromEntries(
          Object.entries(mergedResultsByModel).map(([modelId, results]) => [modelId, benchPack.scoreModelResults(results)])
        );
        const nextSnapshot: BenchPackRunSummary = {
          ...latestSummary,
          executionMode,
          runsPerTest,
          resultsByModel: mergedResultsByModel
        };
        const isComplete = hasCompleteRunResults(nextSnapshot);

        if (!runErrorMessage) {
          await emit({
            type: "run_finished",
            scores
          });
        }

        const nextSummary: BenchPackRunSummary = {
          ...latestSummary,
          executionMode,
          runsPerTest,
          completedAt: new Date().toISOString(),
          cancelled: isComplete ? false : cancelled || latestSummary.cancelled,
          error: isComplete ? undefined : runErrorMessage ?? latestSummary.error,
          events: mergedEvents,
          resultsByModel: mergedResultsByModel,
          scores
        };

        await writeRunSummary(artifacts.summaryPath, nextSummary, normalizeRunSummaryProviderErrorClassification);
        return nextSummary;
      });
    } finally {
      await prepared.dispose();
      await disposeHostResources();
    }
  } catch (error) {
    await disposeHostResources();
    throw error;
  }
}






