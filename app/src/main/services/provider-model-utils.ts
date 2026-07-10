import { randomUUID } from "node:crypto";
import type {
  BenchLocalModelConfig,
  BenchLocalProviderConfig,
  BenchLocalProviderKind
} from "@core";

// Main 进程共享同一套命名与输入归一化规则，避免 Provider/Model 服务产生行为漂移。
const PROVIDER_KIND_LABELS: Record<BenchLocalProviderKind, string> = {
  openrouter: "OpenRouter",
  huggingface: "Hugging Face",
  ollama: "Ollama",
  llamacpp: "llama.cpp",
  mlx: "MLX",
  lmstudio: "LM Studio",
  pico: "Pico",
  openai_compatible: "OpenAI Compatible"
};

export function defaultProviderName(kind: BenchLocalProviderKind): string {
  return PROVIDER_KIND_LABELS[kind] ?? kind;
}

export function fallbackProviderDisplayName(providerId: string): string {
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

export function getProviderDisplayName(
  providers: Record<string, BenchLocalProviderConfig>,
  providerId: string
): string {
  return providers[providerId]?.name?.trim() || fallbackProviderDisplayName(providerId);
}

export function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function normalizeRequiredString(value: unknown, field: string): string {
  const normalized = normalizeOptionalString(value);

  if (!normalized) {
    throw new Error(`${field} is required.`);
  }

  return normalized;
}

export function normalizeOptionalBoolean(value: unknown, fallback: boolean, field: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean.`);
  return value;
}

export function createCopyLabel(label: string, existingLabels: string[]): string {
  const base = `${label.trim() || "Untitled"} Copy`;
  const existing = new Set(existingLabels.map((candidate) => candidate.trim()));

  if (!existing.has(base)) return base;

  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base} ${index}`;
    if (!existing.has(candidate)) return candidate;
  }

  return `${base} ${randomUUID().slice(0, 8)}`;
}

export function createUniqueProviderId(
  kind: BenchLocalProviderKind,
  providers: Record<string, BenchLocalProviderConfig>
): string {
  let id = "";
  do {
    id = `${kind}-${randomUUID()}`;
  } while (providers[id]);
  return id;
}

export function createUniqueModelId(
  model: BenchLocalModelConfig,
  models: BenchLocalModelConfig[]
): string {
  const existing = new Set(models.map((candidate) => candidate.id));
  const modelPart = model.model.trim() || model.id.split(":").slice(1).join(":").trim() || "model";
  let id = "";

  do {
    id = `${model.provider}:${modelPart}:copy-${randomUUID()}`;
  } while (existing.has(id));

  return id;
}
