import type { BenchLocalExecutionMode, BenchPackRunSummary, ProgressEvent, ScenarioResult } from "@core";

export const EXECUTION_MODE_OPTIONS: Array<{ value: BenchLocalExecutionMode; label: string }> = [
  { value: "serial", label: "Serial per Test Case" },
  { value: "serial_by_model", label: "Serial per Model" },
  { value: "parallel_by_model", label: "Parallel per Model" },
  { value: "parallel_by_test_case", label: "Parallel per Test Case" },
  { value: "full_parallel", label: "Parallel for All" }
];

export const RUNS_PER_TEST_OPTIONS = [1, 3, 5, 7, 9] as const;

export type LiveRunState = {
  runId?: string;
  events: ProgressEvent[];
  resultsByModel: Record<string, ScenarioResult[]>;
  activeCellKeys: string[];
};

export type LoadedHistoryEntry = {
  runId: string;
  startedAt: string;
  mode?: "history" | "replay";
};

export type BenchPackRunBlocker = {
  title: string;
  message: string;
  actionLabel: string;
};

export type RetryScenarioCell = {
  modelId: string;
  scenarioId: string;
  runId?: string;
};

export function supportsLiveScenarioColumnFocus(executionMode: BenchLocalExecutionMode): boolean {
  return executionMode !== "parallel_by_model" && executionMode !== "full_parallel";
}

export function normalizeRunsPerTest(value: unknown): number {
  return RUNS_PER_TEST_OPTIONS.includes(value as (typeof RUNS_PER_TEST_OPTIONS)[number])
    ? (value as number)
    : 1;
}

export function countStoredRunResults(summary: BenchPackRunSummary | null): number {
  if (!summary) {
    return 0;
  }

  return Object.values(summary.resultsByModel).reduce((total, results) => total + results.length, 0);
}

export function isRunSummaryComplete(summary: BenchPackRunSummary | null): boolean {
  if (!summary) {
    return false;
  }

  return countStoredRunResults(summary) >= summary.modelCount * summary.scenarioCount;
}

export function getCellKey(modelId: string, scenarioId: string): string {
  return `${modelId}::${scenarioId}`;
}

export function isProviderErrorResult(result: ScenarioResult | undefined): boolean {
  return result?.errorType === "provider_error";
}

export function isRunCancellationMessage(message: string | undefined): boolean {
  return /run cancelled/i.test(message ?? "");
}
