import type {
  BenchLocalConfig,
  HostContext,
  ModelAvailability,
  RegisteredModel,
  SecretResolution
} from "@benchlocal/core";

const MODEL_AVAILABILITY_PROBE_TIMEOUT_MS = 4000;

function createProbeAbortError(signal?: AbortSignal): Error {
  const reason = signal?.reason;

  if (reason instanceof Error) {
    return reason;
  }

  return new Error("Run cancelled by user.");
}

function throwIfProbeAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createProbeAbortError(signal);
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown benchmark error.";
}

export function getProviderBaseUrlById(providers: HostContext["providers"]): Map<string, string> {
  return new Map(providers.map((provider) => [provider.id, provider.baseUrl]));
}

function fallbackProviderDisplayName(providerId: string): string {
  const trimmed = providerId.trim();

  if (/^openai[_-]compatible-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return "OpenAI Compatible";
  }

  return trimmed || "Unknown Provider";
}

export function getProviderDisplayName(
  provider: HostContext["providers"][number] | undefined,
  providerId: string
): string {
  return provider?.name?.trim() || fallbackProviderDisplayName(providerId);
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
}

function providerModelsUrl(baseUrl: string): string {
  return new URL("models", normalizeBaseUrl(baseUrl)).toString();
}

function createProviderProbeHeaders(secret?: SecretResolution): Headers {
  const headers = new Headers({
    Accept: "application/json"
  });

  if (secret?.value) {
    headers.set("authorization", "Bearer " + secret.value);
  }

  return headers;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  abortSignal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  let timeout: NodeJS.Timeout | undefined;
  const abortFromParent = () => {
    controller.abort(abortSignal?.reason ?? createProbeAbortError(abortSignal));
  };

  if (abortSignal) {
    if (abortSignal.aborted) {
      abortFromParent();
    } else {
      abortSignal.addEventListener("abort", abortFromParent, { once: true });
    }
  }

  timeout = setTimeout(() => {
    controller.abort(new Error("Provider did not respond within " + Math.ceil(timeoutMs / 1000) + " seconds."));
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
    abortSignal?.removeEventListener("abort", abortFromParent);
  }
}

function getDiscoveredModelIds(payload: unknown): Set<string> {
  const record = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : null;
  const entries = Array.isArray(payload)
    ? payload
    : Array.isArray(record?.data)
      ? record.data
      : Array.isArray(record?.models)
        ? record.models
        : [];
  const ids = entries.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const model = entry as Record<string, unknown>;
    const id = typeof model.id === "string" ? model.id.trim() : "";
    const name = typeof model.name === "string" ? model.name.trim() : "";

    return [id, name].filter(Boolean);
  });

  return new Set(ids);
}

function createModelAvailability(
  model: RegisteredModel,
  status: ModelAvailability["status"],
  reason: ModelAvailability["reason"],
  checkedAt: string,
  details?: string
): ModelAvailability {
  return {
    modelId: model.id,
    providerId: model.provider,
    status,
    reason,
    details,
    checkedAt
  };
}

export function createRuntimeProviders(config: BenchLocalConfig): HostContext["providers"] {
  return Object.entries(config.providers).map(([id, provider]) => ({
    id,
    kind: provider.kind,
    name: provider.name,
    enabled: provider.enabled,
    baseUrl: provider.base_url,
    authMode: (provider.api_key || provider.api_key_env ? "bearer" : "none") as "bearer" | "none"
  }));
}

export function createRuntimeModels(config: BenchLocalConfig): HostContext["models"] {
  return config.models.filter((model) => model.enabled).map((model) => ({
    id: model.id,
    provider: model.provider,
    model: model.model,
    label: model.label,
    enabled: model.enabled,
    group: model.group
  }));
}

export async function createRuntimeSecrets(config: BenchLocalConfig): Promise<HostContext["secrets"]> {
  return await Promise.all(
    Object.entries(config.providers).map(async ([providerId, provider]) => {
      const envName = provider.api_key_env;
      const envValue = envName ? process.env[envName] : undefined;
      const value = provider.api_key ?? envValue;

      return {
        providerId,
        keyName: envName ?? "api_key",
        value,
        source: provider.api_key ? "config" : envValue ? "env" : "none"
      } as const;
    })
  );
}

export async function checkModelAvailability(
  providers: HostContext["providers"],
  models: HostContext["models"],
  secrets: HostContext["secrets"],
  options?: {
    modelIds?: string[];
    timeoutMs?: number;
    abortSignal?: AbortSignal;
  }
): Promise<ModelAvailability[]> {
  const selectedModelIds = options?.modelIds && options.modelIds.length > 0 ? new Set(options.modelIds) : null;
  const selectedModels = selectedModelIds ? models.filter((model) => selectedModelIds.has(model.id)) : models;
  const providerMap = new Map(providers.map((provider) => [provider.id, provider]));
  const secretMap = new Map(secrets.map((secret) => [secret.providerId, secret]));
  const groupedModels = new Map<string, RegisteredModel[]>();
  const timeoutMs = options?.timeoutMs ?? MODEL_AVAILABILITY_PROBE_TIMEOUT_MS;
  const checkedAt = new Date().toISOString();
  const results: ModelAvailability[] = [];

  for (const model of selectedModels) {
    const existing = groupedModels.get(model.provider) ?? [];
    existing.push(model);
    groupedModels.set(model.provider, existing);
  }

  await Promise.all(Array.from(groupedModels.entries()).map(async ([providerId, providerModels]) => {
    throwIfProbeAborted(options?.abortSignal);

    const provider = providerMap.get(providerId);

    if (!provider) {
      results.push(
        ...providerModels.map((model) =>
          createModelAvailability(
            model,
            "offline",
            "provider_missing",
            checkedAt,
            "Provider " + getProviderDisplayName(provider, providerId) + " was not found."
          )
        )
      );
      return;
    }

    const providerName = getProviderDisplayName(provider, providerId);

    if (!provider.enabled) {
      results.push(
        ...providerModels.map((model) =>
          createModelAvailability(model, "offline", "provider_disabled", checkedAt, "Provider " + providerName + " is disabled.")
        )
      );
      return;
    }

    const secret = secretMap.get(provider.id);

    if (provider.authMode === "bearer" && !secret?.value) {
      results.push(
        ...providerModels.map((model) =>
          createModelAvailability(model, "offline", "auth_missing", checkedAt, "Provider " + providerName + " requires an API key.")
        )
      );
      return;
    }

    let response: Response;
    try {
      response = await fetchWithTimeout(
        providerModelsUrl(provider.baseUrl),
        {
          method: "GET",
          headers: createProviderProbeHeaders(secret)
        },
        timeoutMs,
        options?.abortSignal
      );
    } catch (error) {
      if (options?.abortSignal?.aborted) {
        throw error;
      }

      results.push(
        ...providerModels.map((model) =>
          createModelAvailability(
            model,
            "offline",
            "provider_unreachable",
            checkedAt,
            "Provider " + providerName + " is unreachable: " + toErrorMessage(error)
          )
        )
      );
      return;
    }

    if (!response.ok) {
      results.push(
        ...providerModels.map((model) =>
          createModelAvailability(
            model,
            "offline",
            "provider_error",
            checkedAt,
            ("Provider " + providerName + " returned " + response.status + " " + response.statusText).trim()
          )
        )
      );
      return;
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      results.push(
        ...providerModels.map((model) =>
          createModelAvailability(
            model,
            "offline",
            "provider_error",
            checkedAt,
            "Provider " + providerName + " returned invalid model metadata: " + toErrorMessage(error)
          )
        )
      );
      return;
    }

    const availableModelIds = getDiscoveredModelIds(payload);

    for (const model of providerModels) {
      if (availableModelIds.has(model.model) || availableModelIds.has(model.id)) {
        results.push(createModelAvailability(model, "online", "available", checkedAt));
        continue;
      }

      results.push(
        createModelAvailability(
          model,
          "offline",
          "model_missing",
          checkedAt,
          "Provider " + providerName + " is reachable, but model " + model.model + " is not listed."
        )
      );
    }
  }));

  return results.sort((left, right) => left.modelId.localeCompare(right.modelId));
}

export async function checkConfiguredModelAvailability(
  config: BenchLocalConfig,
  options?: {
    modelIds?: string[];
    timeoutMs?: number;
    abortSignal?: AbortSignal;
  }
): Promise<ModelAvailability[]> {
  return await checkModelAvailability(
    createRuntimeProviders(config),
    createRuntimeModels(config),
    await createRuntimeSecrets(config),
    options
  );
}
