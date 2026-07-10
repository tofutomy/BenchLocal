import type {
  BenchLocalAgentCreateProviderRequest,
  BenchLocalAgentPatchProviderRequest,
  BenchLocalProviderConfig
} from "@core";
import type { BenchLocalDiscoveredModel } from "@/shared/desktop-api";
import { redactConfig, type ConfigService } from "./config-service";
import type { WorkspaceService } from "./workspace-service";
import {
  createCopyLabel,
  createUniqueProviderId,
  defaultProviderName,
  fallbackProviderDisplayName,
  getProviderDisplayName,
  normalizeOptionalBoolean,
  normalizeOptionalString,
  normalizeRequiredString
} from "./provider-model-utils";

function normalizeProviderConfig(
  input: BenchLocalAgentCreateProviderRequest,
  providers: Record<string, BenchLocalProviderConfig>
): { providerId: string; provider: BenchLocalProviderConfig } {
  const providerId = normalizeOptionalString(input.id) ?? createUniqueProviderId(input.kind, providers);
  const provider: BenchLocalProviderConfig = {
    kind: input.kind,
    name: normalizeOptionalString(input.name) ?? defaultProviderName(input.kind),
    enabled: normalizeOptionalBoolean(input.enabled, true, "enabled"),
    base_url: normalizeRequiredString(input.base_url, "base_url")
  };
  const apiKey = normalizeOptionalString(input.api_key);
  const apiKeyEnv = normalizeOptionalString(input.api_key_env);

  if (apiKey) provider.api_key = apiKey;
  if (apiKeyEnv) provider.api_key_env = apiKeyEnv;
  return { providerId, provider };
}

function patchProviderConfig(
  provider: BenchLocalProviderConfig,
  input: BenchLocalAgentPatchProviderRequest
): BenchLocalProviderConfig {
  const next: BenchLocalProviderConfig = {
    ...provider,
    ...(input.kind !== undefined ? { kind: input.kind } : {}),
    ...(input.name !== undefined
      ? { name: normalizeOptionalString(input.name) ?? defaultProviderName(input.kind ?? provider.kind) }
      : {}),
    ...(input.enabled !== undefined
      ? { enabled: normalizeOptionalBoolean(input.enabled, provider.enabled, "enabled") }
      : {}),
    ...(input.base_url !== undefined
      ? { base_url: normalizeRequiredString(input.base_url, "base_url") }
      : {})
  };

  if (input.api_key !== undefined) {
    const apiKey = normalizeOptionalString(input.api_key);
    if (apiKey) next.api_key = apiKey;
    else delete next.api_key;
  }

  if (input.api_key_env !== undefined) {
    const apiKeyEnv = normalizeOptionalString(input.api_key_env);
    if (apiKeyEnv) next.api_key_env = apiKeyEnv;
    else delete next.api_key_env;
  }

  return next;
}

function providerSupportsModelDiscovery(provider: BenchLocalProviderConfig): boolean {
  return provider.kind === "openrouter" || provider.kind === "huggingface" || provider.kind === "openai_compatible";
}

function providerModelsUrl(baseUrl: string): string {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL("models", normalizedBaseUrl).toString();
}

function formatModelPricing(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;

  const record = value as Record<string, unknown>;
  const prompt = typeof record.prompt === "string" || typeof record.prompt === "number" ? String(record.prompt) : null;
  const completion =
    typeof record.completion === "string" || typeof record.completion === "number" ? String(record.completion) : null;

  if (prompt && completion) return `In ${prompt} · Out ${completion}`;
  if (prompt) return `Prompt ${prompt}`;
  if (completion) return `Completion ${completion}`;
  return undefined;
}

function mapDiscoveredModel(input: unknown): BenchLocalDiscoveredModel | null {
  if (!input || typeof input !== "object") return null;

  const record = input as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  if (!id) return null;

  const name = typeof record.name === "string" ? record.name.trim() : undefined;
  const ownedBy = typeof record.owned_by === "string" ? record.owned_by.trim() : undefined;
  const topProvider =
    typeof record.top_provider === "object" && record.top_provider !== null
      ? (record.top_provider as Record<string, unknown>)
      : null;
  const architecture =
    typeof record.architecture === "object" && record.architecture !== null
      ? (record.architecture as Record<string, unknown>)
      : null;
  const contextLength =
    typeof record.context_length === "number"
      ? record.context_length
      : typeof topProvider?.context_length === "number"
        ? (topProvider.context_length as number)
        : undefined;
  const modality = Array.isArray(architecture?.modality)
    ? architecture.modality.filter((value): value is string => typeof value === "string").join(", ")
    : Array.isArray(record.input_modalities)
      ? record.input_modalities.filter((value): value is string => typeof value === "string").join(", ")
      : Array.isArray(record.output_modalities)
        ? record.output_modalities.filter((value): value is string => typeof value === "string").join(", ")
        : undefined;

  return { id, name, ownedBy, contextLength, pricing: formatModelPricing(record.pricing), modality };
}

// Provider 删除同时负责清理其模型和工作区引用，保证领域操作完整落盘。
export class ProviderService {
  constructor(
    private readonly configService: ConfigService,
    private readonly workspaceService: WorkspaceService
  ) {}

  async listProviders() {
    return (await this.configService.getSafeConfig()).providers;
  }

  async createProvider(input: BenchLocalAgentCreateProviderRequest) {
    const { config } = await this.configService.loadConfig();
    const nextConfig = structuredClone(config);
    const { providerId, provider } = normalizeProviderConfig(input, nextConfig.providers);

    if (nextConfig.providers[providerId]) {
      throw new Error(`Provider "${getProviderDisplayName(nextConfig.providers, providerId)}" already exists.`);
    }

    nextConfig.providers[providerId] = provider;
    const saved = await this.configService.saveConfig(nextConfig);
    const safeConfig = redactConfig(saved.config);
    return { providerId, provider: safeConfig.providers[providerId], config: safeConfig };
  }

  async updateProvider(providerId: string, input: BenchLocalAgentPatchProviderRequest) {
    const { config } = await this.configService.loadConfig();
    const nextConfig = structuredClone(config);
    const provider = nextConfig.providers[providerId];
    if (!provider) throw new Error(`Provider "${fallbackProviderDisplayName(providerId)}" was not found.`);

    nextConfig.providers[providerId] = patchProviderConfig(provider, input);
    const saved = await this.configService.saveConfig(nextConfig);
    const safeConfig = redactConfig(saved.config);
    return { providerId, provider: safeConfig.providers[providerId], config: safeConfig };
  }

  async deleteProvider(providerId: string) {
    const { config } = await this.configService.loadConfig();
    if (!config.providers[providerId]) {
      throw new Error(`Provider "${fallbackProviderDisplayName(providerId)}" was not found.`);
    }

    const nextConfig = structuredClone(config);
    const providerName = getProviderDisplayName(nextConfig.providers, providerId);
    const removedModelIds = new Set(
      nextConfig.models.filter((model) => model.provider === providerId).map((model) => model.id)
    );
    delete nextConfig.providers[providerId];
    nextConfig.models = nextConfig.models.filter((model) => model.provider !== providerId);
    const saved = await this.configService.saveConfig(nextConfig);
    if (removedModelIds.size > 0) await this.workspaceService.removeModelSelections(removedModelIds);

    return {
      providerId,
      providerName,
      removedModelIds: Array.from(removedModelIds),
      config: redactConfig(saved.config)
    };
  }

  async duplicateProvider(providerId: string) {
    const { config } = await this.configService.loadConfig();
    const provider = config.providers[providerId];
    if (!provider) throw new Error(`Provider "${fallbackProviderDisplayName(providerId)}" was not found.`);

    const nextConfig = structuredClone(config);
    const nextProviderId = createUniqueProviderId(provider.kind, nextConfig.providers);
    const nextProviderName = createCopyLabel(
      getProviderDisplayName(nextConfig.providers, providerId),
      Object.values(nextConfig.providers).map((candidate) => candidate.name)
    );
    nextConfig.providers[nextProviderId] = { ...provider, name: nextProviderName };
    const saved = await this.configService.saveConfig(nextConfig);
    const safeConfig = redactConfig(saved.config);
    return { providerId: nextProviderId, provider: safeConfig.providers[nextProviderId], config: safeConfig };
  }

  async discoverProviderModelsById(providerId: string): Promise<BenchLocalDiscoveredModel[]> {
    const { config } = await this.configService.loadConfig();
    const provider = config.providers[providerId];
    if (!provider) throw new Error(`Provider "${fallbackProviderDisplayName(providerId)}" was not found.`);
    return this.discoverProviderModels(provider);
  }

  async discoverProviderModels(provider: BenchLocalProviderConfig): Promise<BenchLocalDiscoveredModel[]> {
    if (!providerSupportsModelDiscovery(provider)) {
      throw new Error(`${provider.name} does not support model browsing yet.`);
    }

    const headers = new Headers({ Accept: "application/json" });
    const apiKey = provider.api_key?.trim() || (provider.api_key_env ? process.env[provider.api_key_env]?.trim() : "");
    if (apiKey) headers.set("Authorization", `Bearer ${apiKey}`);

    const response = await fetch(providerModelsUrl(provider.base_url), { method: "GET", headers });
    if (!response.ok) {
      throw new Error(`Failed to load models from ${provider.name}: ${response.status} ${response.statusText}`.trim());
    }

    const payload = (await response.json()) as { data?: unknown[] } | unknown[];
    const entries = Array.isArray(payload) ? payload : Array.isArray(payload.data) ? payload.data : [];
    return entries
      .map((entry) => mapDiscoveredModel(entry))
      .filter((entry): entry is BenchLocalDiscoveredModel => Boolean(entry))
      .sort((left, right) => (left.name ?? left.id).localeCompare(right.name ?? right.id));
  }
}
