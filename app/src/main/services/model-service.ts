import type {
  BenchLocalAgentCreateModelRequest,
  BenchLocalAgentPatchModelRequest,
  BenchLocalConfig,
  BenchLocalModelConfig,
  BenchLocalProviderConfig
} from "@core";
import { checkConfiguredModelAvailability } from "@benchpack-host";
import type { AgentEventBus } from "./agent-event-bus";
import { redactConfig, type ConfigService } from "./config-service";
import type { WorkspaceService } from "./workspace-service";
import {
  createCopyLabel,
  createUniqueModelId,
  fallbackProviderDisplayName,
  getProviderDisplayName,
  normalizeOptionalBoolean,
  normalizeOptionalString,
  normalizeRequiredString
} from "./provider-model-utils";

function buildModelConfig(
  input: BenchLocalAgentCreateModelRequest,
  providers: Record<string, BenchLocalProviderConfig>
): BenchLocalModelConfig {
  const provider = normalizeRequiredString(input.provider, "provider");
  const model = normalizeRequiredString(input.model, "model");
  const providerLabel = getProviderDisplayName(providers, provider);

  return {
    id: normalizeOptionalString(input.id) ?? `${provider}:${model}`,
    provider,
    model,
    label: normalizeOptionalString(input.label) ?? `${model} via ${providerLabel}`,
    group: normalizeOptionalString(input.group) ?? "primary",
    enabled: normalizeOptionalBoolean(input.enabled, true, "enabled")
  };
}

function patchModelConfig(
  model: BenchLocalModelConfig,
  input: BenchLocalAgentPatchModelRequest,
  providers: Record<string, BenchLocalProviderConfig>
): BenchLocalModelConfig {
  return buildModelConfig(
    {
      id: input.id ?? model.id,
      provider: input.provider ?? model.provider,
      model: input.model ?? model.model,
      label: input.label ?? model.label,
      group: input.group ?? model.group,
      enabled: input.enabled ?? model.enabled
    },
    providers
  );
}

// Model ID 变化必须同步迁移全部标签页选择，调用方无需重复维护关联数据。
export class ModelService {
  constructor(
    private readonly eventBus: AgentEventBus,
    private readonly configService: ConfigService,
    private readonly workspaceService: WorkspaceService
  ) {}

  async createModel(input: BenchLocalAgentCreateModelRequest) {
    const { config } = await this.configService.loadConfig();
    const nextConfig = structuredClone(config);
    const model = buildModelConfig(input, nextConfig.providers);

    if (!nextConfig.providers[model.provider]) {
      throw new Error(`Model provider "${fallbackProviderDisplayName(model.provider)}" does not exist yet.`);
    }
    if (nextConfig.models.some((candidate) => candidate.id === model.id)) {
      throw new Error(`Model "${model.id}" already exists.`);
    }

    nextConfig.models.push(model);
    const saved = await this.configService.saveConfig(nextConfig);
    return { modelId: model.id, model, config: redactConfig(saved.config) };
  }

  async updateModel(modelId: string, input: BenchLocalAgentPatchModelRequest) {
    const { config } = await this.configService.loadConfig();
    const nextConfig = structuredClone(config);
    const index = nextConfig.models.findIndex((model) => model.id === modelId);
    if (index < 0) throw new Error(`Model "${modelId}" was not found.`);

    const model = patchModelConfig(nextConfig.models[index], input, nextConfig.providers);
    if (!nextConfig.providers[model.provider]) {
      throw new Error(`Model provider "${fallbackProviderDisplayName(model.provider)}" does not exist yet.`);
    }
    if (nextConfig.models.some((candidate, candidateIndex) => candidateIndex !== index && candidate.id === model.id)) {
      throw new Error(`Model "${model.id}" already exists.`);
    }

    nextConfig.models[index] = model;
    const saved = await this.configService.saveConfig(nextConfig);
    if (model.id !== modelId) await this.workspaceService.replaceModelSelectionId(modelId, model.id);

    return {
      modelId: model.id,
      previousModelId: modelId,
      model,
      config: redactConfig(saved.config)
    };
  }

  async deleteModel(modelId: string) {
    const { config } = await this.configService.loadConfig();
    const nextConfig = structuredClone(config);
    const index = nextConfig.models.findIndex((model) => model.id === modelId);
    if (index < 0) throw new Error(`Model "${modelId}" was not found.`);

    const [removedModel] = nextConfig.models.splice(index, 1);
    const saved = await this.configService.saveConfig(nextConfig);
    await this.workspaceService.removeModelSelections(new Set([modelId]));
    return { modelId, model: removedModel, config: redactConfig(saved.config) };
  }

  async duplicateModel(modelId: string) {
    const { config } = await this.configService.loadConfig();
    const model = config.models.find((candidate) => candidate.id === modelId);
    if (!model) throw new Error(`Model "${modelId}" was not found.`);

    const nextConfig = structuredClone(config);
    const nextModelLabel = createCopyLabel(
      model.label || model.model || model.id,
      nextConfig.models.map((candidate) => candidate.label)
    );
    const nextModel: BenchLocalModelConfig = {
      ...model,
      id: createUniqueModelId(model, nextConfig.models),
      label: nextModelLabel
    };
    nextConfig.models.push(nextModel);
    const saved = await this.configService.saveConfig(nextConfig);
    return { modelId: nextModel.id, model: nextModel, config: redactConfig(saved.config) };
  }

  async checkModelAvailability(input: { config: BenchLocalConfig; modelIds?: string[] }) {
    const availability = await checkConfiguredModelAvailability(input.config, { modelIds: input.modelIds });
    this.eventBus.emitAgentEvent("models.availability.updated", { availability });
    return availability;
  }
}
