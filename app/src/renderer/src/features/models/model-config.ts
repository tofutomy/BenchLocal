import type { BenchLocalModelConfig, BenchLocalProviderConfig, BenchLocalProviderKind } from "@core";

export type ProviderFormState = {
  id: string;
  kind: BenchLocalProviderKind;
  name: string;
  enabled: boolean;
  base_url: string;
  api_key: string;
};

export type ModelFormState = {
  id: string;
  provider: string;
  model: string;
  label: string;
  group: string;
  enabled: boolean;
};

export type ResolvedTabModel = BenchLocalModelConfig & {
  displayLabel: string;
  alias?: string;
};

export const PROVIDER_KIND_OPTIONS: Array<{ value: BenchLocalProviderKind; label: string }> = [
  { value: "openai_compatible", label: "OpenAI Compatible" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "huggingface", label: "Hugging Face" },
  { value: "ollama", label: "Ollama" },
  { value: "llamacpp", label: "llama.cpp" },
  { value: "mlx", label: "MLX" },
  { value: "lmstudio", label: "LM Studio" },
  { value: "pico", label: "Pico" }
];

export function providerKindLabel(kind: BenchLocalProviderKind): string {
  return PROVIDER_KIND_OPTIONS.find((option) => option.value === kind)?.label ?? kind;
}

export function defaultProviderName(kind: BenchLocalProviderKind): string {
  return providerKindLabel(kind);
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

export function getModelLabelForMessage(modelId: string, models: ResolvedTabModel[]): string {
  const model = models.find((candidate) => candidate.id === modelId);
  return model?.displayLabel ?? model?.label ?? (modelId.split(":").slice(1).join(":").trim() || modelId);
}

export function defaultProviderApiKeyPlaceholder(kind: BenchLocalProviderKind): string {
  switch (kind) {
    case "huggingface":
      return "hf_...";
    default:
      return "sk-or-v1-...";
  }
}

export function defaultProviderBaseUrl(kind: BenchLocalProviderKind): string {
  switch (kind) {
    case "openrouter":
      return "https://openrouter.ai/api/v1";
    case "huggingface":
      return "https://router.huggingface.co/v1";
    case "ollama":
      return "http://127.0.0.1:11434/v1";
    case "llamacpp":
      return "http://127.0.0.1:8080/v1";
    case "mlx":
      return "http://127.0.0.1:8082/v1";
    case "lmstudio":
      return "http://127.0.0.1:1234/v1";
    case "pico":
      return "http://127.0.0.1:7426/v1";
    case "openai_compatible":
    default:
      return "https://api.example.com/v1";
  }
}

export function createEmptyProvider(): ProviderFormState {
  return {
    id: `openai_compatible-${crypto.randomUUID()}`,
    kind: "openai_compatible",
    name: "",
    enabled: true,
    base_url: "https://api.example.com/v1",
    api_key: ""
  };
}

export function createEmptyModel(providerId = "openrouter"): ModelFormState {
  return {
    id: "",
    provider: providerId,
    model: "",
    label: "",
    group: "primary",
    enabled: true
  };
}

export function providerSupportsModelDiscovery(provider?: BenchLocalProviderConfig | null): boolean {
  // 与主进程白名单保持一致：LM Studio 走本地 OpenAI 兼容 /models
  return (
    provider?.kind === "openrouter" ||
    provider?.kind === "huggingface" ||
    provider?.kind === "openai_compatible" ||
    provider?.kind === "lmstudio"
  );
}

export function defaultModelLabel(
  providerName: string,
  modelId: string,
  discoveredName?: string
): string {
  const trimmedDiscoveredName = discoveredName?.trim();

  if (trimmedDiscoveredName) {
    return trimmedDiscoveredName;
  }

  return `${modelId.trim()} via ${providerName}`.trim();
}

export function toProviderForm(id: string, provider: BenchLocalProviderConfig): ProviderFormState {
  return {
    id,
    kind: provider.kind,
    name: provider.name,
    enabled: provider.enabled,
    base_url: provider.base_url,
    api_key: provider.api_key ?? ""
  };
}

export function toModelForm(model: BenchLocalModelConfig): ModelFormState {
  return {
    id: model.id,
    provider: model.provider,
    model: model.model,
    label: model.label,
    group: model.group,
    enabled: model.enabled
  };
}

export function buildModelConfig(
  form: ModelFormState,
  providers: Record<string, BenchLocalProviderConfig>
): BenchLocalModelConfig {
  const providerLabel = getProviderDisplayName(providers, form.provider.trim());

  return {
    id: form.id.trim() || `${form.provider}:${form.model}`.trim(),
    provider: form.provider.trim(),
    model: form.model.trim(),
    label: form.label.trim() || `${form.model.trim()} via ${providerLabel}`,
    group: form.group.trim() || "primary",
    enabled: form.enabled
  };
}

export function createCopyLabel(label: string, existingLabels: string[]): string {
  const base = `${label.trim() || "Untitled"} Copy`;
  const existing = new Set(existingLabels.map((candidate) => candidate.trim()));

  if (!existing.has(base)) {
    return base;
  }

  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base} ${index}`;
    if (!existing.has(candidate)) {
      return candidate;
    }
  }

  return `${base} ${crypto.randomUUID().slice(0, 8)}`;
}

export function createUniqueProviderId(
  kind: BenchLocalProviderKind,
  providers: Record<string, BenchLocalProviderConfig>
): string {
  let id = "";

  do {
    id = `${kind}-${crypto.randomUUID()}`;
  } while (providers[id]);

  return id;
}

export function createUniqueModelId(model: BenchLocalModelConfig, models: BenchLocalModelConfig[]): string {
  const existing = new Set(models.map((candidate) => candidate.id));
  const modelPart = model.model.trim() || model.id.split(":").slice(1).join(":").trim() || "model";
  let id = "";

  do {
    id = `${model.provider}:${modelPart}:copy-${crypto.randomUUID()}`;
  } while (existing.has(id));

  return id;
}