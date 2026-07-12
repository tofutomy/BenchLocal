import type {
  BenchLocalExecutionMode,
  BenchPackManifest,
  BenchPackRunSummary,
  GenerationRequest,
  ProgressEvent,
  RegisteredModel,
  ScenarioMeta,
  ScenarioResult
} from "@benchlocal/core";
import { DEFAULT_BENCHLOCAL_GENERATION } from "@benchlocal/core";
import { createAbortError, throwIfAborted } from "../shared/abort.js";
import {
  captureProviderFetchErrors,
  getProviderHttpErrorFromError,
  isProviderHttpErrorStatus,
  isRecord,
  isRetryableProviderHttpStatus,
  toHttpStatusCode,
  type CapturedProviderHttpError
} from "../providers/provider-errors.js";
import type { LoadedBenchPackRuntime } from "../runtime/load-runtime.js";
import { normalizeRunsPerTest, selectMajorityRepeatedScenarioResult } from "./execution-plan.js";

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown benchmark error.";
}

function formatRequestTimeoutMessage(timeoutSeconds: number): string {
  return `The model did not complete the answer within the configured request timeout (${timeoutSeconds} seconds).`;
}

function createRequestTimeoutError(timeoutSeconds: number): Error {
  const error = new Error(formatRequestTimeoutMessage(timeoutSeconds));
  error.name = "TimeoutError";
  return error;
}

function toScenarioExecutionErrorMessage(error: unknown, generation: GenerationRequest | undefined, startedAt: number): string {
  const message = toErrorMessage(error);
  const timeoutSeconds = generation?.request_timeout_seconds;

  if (!timeoutSeconds || !Number.isFinite(timeoutSeconds)) {
    return message;
  }

  const elapsedMs = Date.now() - startedAt;
  const timeoutMs = timeoutSeconds * 1000;
  const likelyTimeout =
    isAbortError(error) ||
    (/fetch failed/i.test(message) && elapsedMs >= Math.max(0, timeoutMs - 1000));

  return likelyTimeout ? formatRequestTimeoutMessage(timeoutSeconds) : message;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && /abort|cancel/i.test(error.name + " " + error.message);
}

function getRequestTimeoutSeconds(generation?: GenerationRequest): number | undefined {
  const timeoutSeconds = generation?.request_timeout_seconds;

  if (!timeoutSeconds || !Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
    return undefined;
  }

  return timeoutSeconds;
}

function compactGenerationRequest(input?: GenerationRequest): GenerationRequest {
  if (!input) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as GenerationRequest;
}

function getEnvRequestTimeoutOverride(): number | undefined {
  const raw = process.env.BENCHLOCAL_REQUEST_TIMEOUT_SECONDS?.trim();

  if (!raw) {
    return undefined;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function getDefaultGenerationRequest(): GenerationRequest {
  const requestTimeoutSeconds = getEnvRequestTimeoutOverride();

  return compactGenerationRequest({
    ...DEFAULT_BENCHLOCAL_GENERATION,
    request_timeout_seconds: requestTimeoutSeconds ?? DEFAULT_BENCHLOCAL_GENERATION.request_timeout_seconds
  });
}

export function resolveBenchPackGeneration(
  manifest: BenchPackManifest,
  overrides?: GenerationRequest
): GenerationRequest {
  return compactGenerationRequest({
    ...getDefaultGenerationRequest(),
    ...(manifest.samplingDefaults ?? {}),
    ...(overrides ?? {})
  });
}

export function upsertScenarioResult(results: ScenarioResult[], result: ScenarioResult): ScenarioResult[] {
  const next = [...results];
  const existingIndex = next.findIndex((candidate) => candidate.scenarioId === result.scenarioId);

  if (existingIndex >= 0) {
    next[existingIndex] = result;
    return next;
  }

  next.push(result);
  return next;
}

export function mergeResultsByModel(
  preferred: Record<string, ScenarioResult[]>,
  fallback: Record<string, ScenarioResult[]>
): Record<string, ScenarioResult[]> {
  const modelIds = new Set([...Object.keys(fallback), ...Object.keys(preferred)]);
  const merged: Record<string, ScenarioResult[]> = {};

  for (const modelId of modelIds) {
    const preferredResults = preferred[modelId] ?? [];
    const fallbackResults = fallback[modelId] ?? [];
    const next = [...fallbackResults];

    for (const result of preferredResults) {
      const existingIndex = next.findIndex((candidate) => candidate.scenarioId === result.scenarioId);

      if (existingIndex >= 0) {
        next[existingIndex] = result;
      } else {
        next.push(result);
      }
    }

    merged[modelId] = next;
  }

  return merged;
}

export function hasCompleteRunResults(summary: BenchPackRunSummary): boolean {
  const modelIds = Object.keys(summary.resultsByModel);

  if (modelIds.length !== summary.modelCount) {
    return false;
  }

  return modelIds.every((modelId) => summary.resultsByModel[modelId]?.length === summary.scenarioCount);
}

export function getHistoricalRunModelIds(summary: BenchPackRunSummary): string[] {
  const runStartedEvent = summary.events.find(
    (event): event is Extract<ProgressEvent, { type: "run_started" }> => event.type === "run_started"
  );

  const orderedModelIds = [
    ...(runStartedEvent?.models.map((model) => model.id) ?? []),
    ...Object.keys(summary.resultsByModel)
  ].filter((modelId, index, all) => Boolean(modelId) && all.indexOf(modelId) === index);

  return orderedModelIds;
}

export async function executeSerialTestCasesMode(
  scenarios: ScenarioMeta[],
  selectedModels: RegisteredModel[],
  prepared: Awaited<ReturnType<LoadedBenchPackRuntime["prepare"]>>,
  benchPackId: string,
  generation: GenerationRequest,
  runsPerTest: number,
  emit: (event: ProgressEvent) => Promise<void>,
  resultsByModel: Record<string, ScenarioResult[]>,
  runId: string,
  providerBaseUrlById: Map<string, string>,
  shouldExecuteCell: (scenario: ScenarioMeta, model: RegisteredModel) => boolean = () => true,
  abortSignal?: AbortSignal
): Promise<void> {
  for (const [index, scenario] of scenarios.entries()) {
    throwIfAborted(abortSignal);
    const runnableModels = selectedModels.filter((model) => shouldExecuteCell(scenario, model));

    if (runnableModels.length === 0) {
      continue;
    }

    await emit({
      type: "scenario_started",
      scenarioId: scenario.id,
      title: scenario.title,
      index: index + 1,
      total: scenarios.length
    });

    for (const model of runnableModels) {
      throwIfAborted(abortSignal);
      const result = await runScenarioWithRepeats(
        prepared,
        {
          runId,
          benchPackId,
          scenario,
          model,
          providerBaseUrl: providerBaseUrlById.get(model.provider),
          abortSignal,
          generation,
          runsPerTest
        },
        emit
      );

      resultsByModel[model.id].push(result);
      await emit({ type: "scenario_result", modelId: model.id, scenarioId: scenario.id, result });
    }

    await emit({
      type: "scenario_finished",
      scenarioId: scenario.id
    });
  }
}

function buildScenarioExecutionFailureResult(
  scenario: ScenarioMeta,
  error: unknown,
  startedAt: number,
  generation?: GenerationRequest
): ScenarioResult {
  const message = toScenarioExecutionErrorMessage(error, generation, startedAt);
  const providerHttpError = getProviderHttpErrorFromError(error);
  const providerHttpStatus = providerHttpError?.status;
  const providerError = providerHttpStatus !== undefined;
  const retryableProviderError = providerHttpStatus !== undefined && isRetryableProviderHttpStatus(providerHttpStatus);
  const completedAt = Date.now();
  const verifierDetails: Record<string, unknown> = { error: message };

  if (providerHttpError) {
    verifierDetails.providerHttpStatus = providerHttpStatus;
    verifierDetails.providerResponseBlank = providerHttpError.responseBlank;
  }

  const failureResult: ScenarioResult = {
    scenarioId: scenario.id,
    status: "fail",
    score: 0,
    summary: providerHttpError
      ? `Provider returned HTTP status ${providerHttpStatus}${providerHttpError.responseBlank ? " with a blank response" : ""}.`
      : "BenchLocal could not complete this scenario run.",
    note: message,
    rawLog: `error=${message}`,
    verifier: {
      status: "fail",
      summary: "Scenario execution failed before a verifier result was returned.",
      details: verifierDetails
    },
    timings: {
      startedAt: new Date(startedAt).toISOString(),
      completedAt: new Date(completedAt).toISOString(),
      durationMs: completedAt - startedAt
    }
  };

  return {
    ...failureResult,
    errorType: providerError ? "provider_error" : "execution_error",
    retryable: retryableProviderError
  } as ScenarioResult;
}

function getStructuredProviderHttpError(result: ScenarioResult): CapturedProviderHttpError | undefined {
  const details = result.verifier?.details;

  if (!isRecord(details)) {
    return undefined;
  }

  const status = toHttpStatusCode(details.providerHttpStatus);
  if (status === undefined || !isProviderHttpErrorStatus(status)) {
    return undefined;
  }

  return {
    status,
    responseBlank: details.providerResponseBlank === true
  };
}

function attachProviderHttpError(result: ScenarioResult, providerHttpError: CapturedProviderHttpError | undefined): ScenarioResult {
  if (!providerHttpError || result.status !== "fail") {
    return result;
  }

  return {
    ...result,
    verifier: {
      status: result.verifier?.status ?? "fail",
      summary: result.verifier?.summary ?? "Provider returned an HTTP error status.",
      details: {
        ...(result.verifier?.details ?? {}),
        providerHttpStatus: providerHttpError.status,
        providerResponseBlank: providerHttpError.responseBlank
      }
    }
  };
}

function classifyReturnedScenarioResult(result: ScenarioResult): ScenarioResult {
  if (result.errorType === "execution_error") {
    return result;
  }

  if (result.status !== "fail") {
    return result.errorType === "provider_error" ? removeProviderErrorClassification(result) : result;
  }

  const providerHttpError = getStructuredProviderHttpError(result);

  if (!providerHttpError) {
    return result.errorType === "provider_error" ? removeProviderErrorClassification(result) : result;
  }

  return {
    ...result,
    errorType: "provider_error",
    retryable: isRetryableProviderHttpStatus(providerHttpError.status),
    summary: result.summary || `Provider returned HTTP status ${providerHttpError.status}.`
  } as ScenarioResult;
}

function removeProviderErrorClassification(result: ScenarioResult): ScenarioResult {
  const { errorType: _errorType, retryable: _retryable, ...unclassifiedResult } = result;
  return unclassifiedResult as ScenarioResult;
}

export function normalizeRunSummaryProviderErrorClassification(summary: BenchPackRunSummary): BenchPackRunSummary {
  const resultsByModel = Object.fromEntries(
    Object.entries(summary.resultsByModel).map(([modelId, results]) => [
      modelId,
      results.map((result) => classifyReturnedScenarioResult(result))
    ])
  );
  const events = summary.events.map((event) =>
    event.type === "scenario_result"
      ? {
          ...event,
          result: classifyReturnedScenarioResult(event.result)
        }
      : event
  );

  return {
    ...summary,
    events,
    resultsByModel
  };
}

function applyScenarioTimings(result: ScenarioResult, startedAt: number, completedAt: number): ScenarioResult {
  const classifiedResult = classifyReturnedScenarioResult(result);

  return {
    ...classifiedResult,
    timings: {
      startedAt: classifiedResult.timings?.startedAt ?? new Date(startedAt).toISOString(),
      completedAt: classifiedResult.timings?.completedAt ?? new Date(completedAt).toISOString(),
      durationMs: classifiedResult.timings?.durationMs ?? completedAt - startedAt
    }
  };
}

async function runScenarioSafely(
  prepared: Awaited<ReturnType<LoadedBenchPackRuntime["prepare"]>>,
  input: {
    runId: string;
    benchPackId: string;
    scenario: ScenarioMeta;
    model: RegisteredModel;
    providerBaseUrl?: string;
    abortSignal?: AbortSignal;
    generation: GenerationRequest;
  },
  emit: (event: ProgressEvent) => Promise<void>
): Promise<ScenarioResult> {
  const startedAt = Date.now();
  const timeoutSeconds = getRequestTimeoutSeconds(input.generation);
  const timeoutMs = timeoutSeconds ? timeoutSeconds * 1000 : undefined;
  const scenarioController = timeoutMs ? new AbortController() : undefined;
  let timedOut = false;
  let timeout: NodeJS.Timeout | undefined;

  const abortScenarioFromParent = () => {
    scenarioController?.abort(input.abortSignal?.reason ?? createAbortError(input.abortSignal));
  };

  if (scenarioController && input.abortSignal) {
    if (input.abortSignal.aborted) {
      abortScenarioFromParent();
    } else {
      input.abortSignal.addEventListener("abort", abortScenarioFromParent, { once: true });
    }
  }

  try {
    const { providerBaseUrl, ...scenarioInput } = input;
    const runPromise = captureProviderFetchErrors(
      providerBaseUrl,
      () => prepared.runScenario({
        ...scenarioInput,
        abortSignal: scenarioController?.signal ?? input.abortSignal
      }, emit)
    );
    const result = await (timeoutMs && timeoutSeconds
      ? Promise.race([
          runPromise,
          new Promise<{ result: ScenarioResult; providerHttpError?: CapturedProviderHttpError }>((_resolve, reject) => {
            timeout = setTimeout(() => {
              timedOut = true;
              const error = createRequestTimeoutError(timeoutSeconds);
              scenarioController?.abort(error);
              reject(error);
            }, timeoutMs);
          })
        ])
      : runPromise);
    return applyScenarioTimings(
      attachProviderHttpError(result.result, result.providerHttpError),
      startedAt,
      Date.now()
    );
  } catch (error) {
    if (!timedOut && (isAbortError(error) || input.abortSignal?.aborted)) {
      throw error;
    }

    return buildScenarioExecutionFailureResult(input.scenario, error, startedAt, input.generation);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
    input.abortSignal?.removeEventListener("abort", abortScenarioFromParent);
  }
}

export async function runScenarioWithRepeats(
  prepared: Awaited<ReturnType<LoadedBenchPackRuntime["prepare"]>>,
  input: {
    runId: string;
    benchPackId: string;
    scenario: ScenarioMeta;
    model: RegisteredModel;
    providerBaseUrl?: string;
    abortSignal?: AbortSignal;
    generation: GenerationRequest;
    runsPerTest: number;
  },
  emit: (event: ProgressEvent) => Promise<void>
): Promise<ScenarioResult> {
  const runsPerTest = normalizeRunsPerTest(input.runsPerTest);

  if (runsPerTest <= 1) {
    return runScenarioSafely(prepared, input, emit);
  }

  const results: ScenarioResult[] = [];

  for (let runIndex = 0; runIndex < runsPerTest; runIndex += 1) {
    throwIfAborted(input.abortSignal);
    await emit({
      type: "model_progress",
      modelId: input.model.id,
      scenarioId: input.scenario.id,
      message: `Running attempt ${runIndex + 1}/${runsPerTest}.`
    });
    results.push(
      await runScenarioSafely(
        prepared,
        {
          ...input,
          generation: input.generation
        },
        emit
      )
    );
  }

  return selectMajorityRepeatedScenarioResult(results);
}

export async function executeSerialByModelMode(
  scenarios: ScenarioMeta[],
  selectedModels: RegisteredModel[],
  prepared: Awaited<ReturnType<LoadedBenchPackRuntime["prepare"]>>,
  benchPackId: string,
  generation: GenerationRequest,
  runsPerTest: number,
  emit: (event: ProgressEvent) => Promise<void>,
  resultsByModel: Record<string, ScenarioResult[]>,
  runId: string,
  providerBaseUrlById: Map<string, string>,
  shouldExecuteCell: (scenario: ScenarioMeta, model: RegisteredModel) => boolean = () => true,
  abortSignal?: AbortSignal
): Promise<void> {
  const startedScenarios = new Set<string>();
  const finishedCounts = new Map<string, number>();
  const expectedCounts = new Map(
    scenarios.map((scenario) => [
      scenario.id,
      selectedModels.filter((model) => shouldExecuteCell(scenario, model)).length
    ])
  );

  for (const model of selectedModels) {
    throwIfAborted(abortSignal);

    for (const [index, scenario] of scenarios.entries()) {
      throwIfAborted(abortSignal);

      if (!shouldExecuteCell(scenario, model)) {
        continue;
      }

      if (!startedScenarios.has(scenario.id)) {
        startedScenarios.add(scenario.id);
        await emit({
          type: "scenario_started",
          scenarioId: scenario.id,
          title: scenario.title,
          index: index + 1,
          total: scenarios.length
        });
      }

      const result = await runScenarioWithRepeats(
        prepared,
        {
          runId,
          benchPackId,
          scenario,
          model,
          providerBaseUrl: providerBaseUrlById.get(model.provider),
          abortSignal,
          generation,
          runsPerTest
        },
        emit
      );

      resultsByModel[model.id].push(result);
      await emit({ type: "scenario_result", modelId: model.id, scenarioId: scenario.id, result });

      const completedCount = (finishedCounts.get(scenario.id) ?? 0) + 1;
      finishedCounts.set(scenario.id, completedCount);

      if (completedCount >= (expectedCounts.get(scenario.id) ?? 0)) {
        await emit({
          type: "scenario_finished",
          scenarioId: scenario.id
        });
      }
    }
  }
}

export async function executeParallelModelsMode(
  scenarios: ScenarioMeta[],
  selectedModels: RegisteredModel[],
  prepared: Awaited<ReturnType<LoadedBenchPackRuntime["prepare"]>>,
  benchPackId: string,
  generation: GenerationRequest,
  runsPerTest: number,
  emit: (event: ProgressEvent) => Promise<void>,
  resultsByModel: Record<string, ScenarioResult[]>,
  runId: string,
  providerBaseUrlById: Map<string, string>,
  shouldExecuteCell: (scenario: ScenarioMeta, model: RegisteredModel) => boolean = () => true,
  abortSignal?: AbortSignal
): Promise<void> {
  const startedScenarios = new Set<string>();
  const finishedCounts = new Map<string, number>();
  const expectedCounts = new Map(
    scenarios.map((scenario) => [
      scenario.id,
      selectedModels.filter((model) => shouldExecuteCell(scenario, model)).length
    ])
  );

  for (const model of selectedModels) {
    throwIfAborted(abortSignal);

    await Promise.all(
      scenarios.map(async (scenario, index) => {
        throwIfAborted(abortSignal);

        if (!shouldExecuteCell(scenario, model)) {
          return;
        }

        if (!startedScenarios.has(scenario.id)) {
          startedScenarios.add(scenario.id);
          await emit({
            type: "scenario_started",
            scenarioId: scenario.id,
            title: scenario.title,
            index: index + 1,
            total: scenarios.length
          });
        }

        const result = await runScenarioWithRepeats(
          prepared,
          {
            runId,
            benchPackId,
            scenario,
            model,
            providerBaseUrl: providerBaseUrlById.get(model.provider),
            abortSignal,
            generation,
            runsPerTest
          },
          emit
        );

        resultsByModel[model.id].push(result);
        await emit({ type: "scenario_result", modelId: model.id, scenarioId: scenario.id, result });

        const completedCount = (finishedCounts.get(scenario.id) ?? 0) + 1;
        finishedCounts.set(scenario.id, completedCount);

        if (completedCount >= (expectedCounts.get(scenario.id) ?? 0)) {
          await emit({
            type: "scenario_finished",
            scenarioId: scenario.id
          });
        }
      })
    );
  }
}

export async function executeParallelTestCasesMode(
  scenarios: ScenarioMeta[],
  selectedModels: RegisteredModel[],
  prepared: Awaited<ReturnType<LoadedBenchPackRuntime["prepare"]>>,
  benchPackId: string,
  generation: GenerationRequest,
  runsPerTest: number,
  emit: (event: ProgressEvent) => Promise<void>,
  resultsByModel: Record<string, ScenarioResult[]>,
  runId: string,
  providerBaseUrlById: Map<string, string>,
  shouldExecuteCell: (scenario: ScenarioMeta, model: RegisteredModel) => boolean = () => true,
  abortSignal?: AbortSignal
): Promise<void> {
  for (const [index, scenario] of scenarios.entries()) {
    throwIfAborted(abortSignal);
    const runnableModels = selectedModels.filter((model) => shouldExecuteCell(scenario, model));

    if (runnableModels.length === 0) {
      continue;
    }

    await emit({
      type: "scenario_started",
      scenarioId: scenario.id,
      title: scenario.title,
      index: index + 1,
      total: scenarios.length
    });

    const scenarioResults = await Promise.all(
      runnableModels.map(async (model) => {
        const result = await runScenarioWithRepeats(
          prepared,
          {
            runId,
            benchPackId,
            scenario,
            model,
            providerBaseUrl: providerBaseUrlById.get(model.provider),
            abortSignal,
            generation,
            runsPerTest
          },
          emit
        );

        return { modelId: model.id, result };
      })
    );

    for (const { modelId, result } of scenarioResults) {
      resultsByModel[modelId].push(result);
      await emit({ type: "scenario_result", modelId, scenarioId: scenario.id, result });
    }

    await emit({
      type: "scenario_finished",
      scenarioId: scenario.id
    });
  }
}

export async function executeFullParallelMode(
  scenarios: ScenarioMeta[],
  selectedModels: RegisteredModel[],
  prepared: Awaited<ReturnType<LoadedBenchPackRuntime["prepare"]>>,
  benchPackId: string,
  generation: GenerationRequest,
  runsPerTest: number,
  emit: (event: ProgressEvent) => Promise<void>,
  resultsByModel: Record<string, ScenarioResult[]>,
  runId: string,
  providerBaseUrlById: Map<string, string>,
  shouldExecuteCell: (scenario: ScenarioMeta, model: RegisteredModel) => boolean = () => true,
  abortSignal?: AbortSignal
): Promise<void> {
  await Promise.all(
    scenarios.map(async (scenario, index) => {
      throwIfAborted(abortSignal);
      const runnableModels = selectedModels.filter((model) => shouldExecuteCell(scenario, model));

      if (runnableModels.length === 0) {
        return;
      }

      await emit({
        type: "scenario_started",
        scenarioId: scenario.id,
        title: scenario.title,
        index: index + 1,
        total: scenarios.length
      });

      const scenarioResults = await Promise.all(
        runnableModels.map(async (model) => {
          const result = await runScenarioWithRepeats(
            prepared,
            {
              runId,
              benchPackId,
              scenario,
              model,
              providerBaseUrl: providerBaseUrlById.get(model.provider),
              abortSignal,
              generation,
              runsPerTest
            },
            emit
          );

          return { modelId: model.id, result };
        })
      );

      for (const { modelId, result } of scenarioResults) {
        resultsByModel[modelId].push(result);
        await emit({ type: "scenario_result", modelId, scenarioId: scenario.id, result });
      }

      await emit({
        type: "scenario_finished",
        scenarioId: scenario.id
      });
    })
  );
}


