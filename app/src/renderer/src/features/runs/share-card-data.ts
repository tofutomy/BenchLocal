import type {
  BenchLocalModelConfig,
  BenchLocalProviderConfig,
  BenchPackRunSummary,
  ScenarioResult
} from "@core";
import type { ResultShareCardData, ShareCardStatusCounts } from "./ResultShareCardModal";
import { formatDurationMs } from "./duration-format";

type ShareCardModel = BenchLocalModelConfig & {
  displayLabel: string;
  alias?: string;
};

const RUNS_PER_TEST_OPTIONS = [1, 3, 5, 7, 9] as const;

function normalizeRunsPerTest(value: unknown): number {
  return RUNS_PER_TEST_OPTIONS.includes(value as (typeof RUNS_PER_TEST_OPTIONS)[number])
    ? (value as number)
    : 1;
}

function fallbackProviderDisplayName(providerId: string): string {
  const trimmed = providerId.trim();

  if (/^openai[_-]compatible-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return "OpenAI Compatible";
  }

  switch (trimmed) {
    case "openrouter":
      return "OpenRouter";
    case "huggingface":
      return "Hugging Face";
    case "ollama":
      return "Ollama";
    case "llamacpp":
      return "llama.cpp";
    case "mlx":
      return "MLX";
    case "lmstudio":
      return "LM Studio";
    case "pico":
      return "Pico";
    default:
      return trimmed || "Unknown Provider";
  }
}

function getProviderDisplayName(
  providers: Record<string, BenchLocalProviderConfig>,
  providerId: string
): string {
  return providers[providerId]?.name?.trim() || fallbackProviderDisplayName(providerId);
}

function getModelDisplayIdentifier(model: Pick<BenchLocalModelConfig, "id" | "model">): string {
  return model.model.trim() || model.id.split(":").slice(1).join(":").trim() || model.id;
}

function formatShareScore(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  if (Number.isInteger(value)) {
    return `${value}`;
  }

  return value.toFixed(2).replace(/\.?0+$/u, "");
}

function formatShareDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.valueOf())) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function sanitizeShareFileName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80) || "benchlocal-result";
}

function countShareStatuses(results: ScenarioResult[], scenarioCount: number): ShareCardStatusCounts {
  const counts: ShareCardStatusCounts = {
    pass: 0,
    partial: 0,
    fail: 0
  };

  for (const result of results) {
    if (result.errorType === "provider_error") {
      counts.fail += 1;
    } else if (result.status === "pass") {
      counts.pass += 1;
    } else if (result.status === "partial") {
      counts.partial += 1;
    } else {
      counts.fail += 1;
    }
  }

  counts.fail += Math.max(0, scenarioCount - results.length);
  return counts;
}

function describeShareOutcome(counts: ShareCardStatusCounts, scenarioCount: number): string {
  if (scenarioCount > 0 && counts.pass === scenarioCount) {
    return "All passed";
  }

  if (counts.fail > 0) {
    return `${counts.fail} failed`;
  }

  if (counts.partial > 0) {
    return `${counts.partial} partial`;
  }

  return "Completed";
}

export function buildResultShareCardData({
  runSummary,
  model,
  providers,
  score,
  runModeLabel
}: {
  runSummary: BenchPackRunSummary;
  model: ShareCardModel | undefined;
  providers: Record<string, BenchLocalProviderConfig>;
  score: BenchPackRunSummary["scores"][string];
  runModeLabel: string;
}): ResultShareCardData {
  const modelId = model?.id ?? "model";
  const results = runSummary.resultsByModel[modelId] ?? [];
  const scenarioCount = runSummary.scenarioCount;
  const statusCounts = countShareStatuses(results, scenarioCount);
  const providerName = model ? getProviderDisplayName(providers, model.provider) : "Unknown Provider";
  const modelIdentifier = model ? getModelDisplayIdentifier(model) : modelId;
  const startedAt = new Date(runSummary.startedAt);
  const completedAt = new Date(runSummary.completedAt);
  const durationLabel =
    Number.isNaN(startedAt.valueOf()) || Number.isNaN(completedAt.valueOf())
      ? null
      : formatDurationMs(Math.max(0, completedAt.valueOf() - startedAt.valueOf()));
  const benchPackName = runSummary.benchPackName || runSummary.benchPackId;
  const modelLabel = model?.displayLabel ?? model?.label ?? modelIdentifier;

  return {
    benchPackName,
    modelLabel,
    providerName,
    modelIdentifier,
    scoreValue: formatShareScore(score.totalScore),
    scenarioCount,
    completedCount: results.length,
    statusCounts,
    categories: score.categories.map((category) => ({
      id: category.id,
      label: category.label,
      score: formatShareScore(category.score)
    })),
    runModeLabel,
    runsPerTest: normalizeRunsPerTest(runSummary.runsPerTest),
    runDateLabel: formatShareDate(runSummary.startedAt),
    durationLabel,
    footerLabel: "benchlocal.com",
    outcomeLabel: describeShareOutcome(statusCounts, scenarioCount),
    fileName: `${sanitizeShareFileName(`benchlocal-${benchPackName}-${modelLabel}`)}.png`
  };
}
