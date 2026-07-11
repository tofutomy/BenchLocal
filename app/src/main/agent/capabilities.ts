import type {
  BenchLocalAgentCreateModelRequest,
  BenchLocalAgentCreateProviderRequest,
  BenchLocalAgentEvent,
  BenchLocalAgentPatchModelRequest,
  BenchLocalAgentPatchProviderRequest
} from "@core";
import type { BenchLocalController } from "../controller";

export const READ_ONLY_CAPABILITY_DEFINITIONS = {
  config: {
    id: "config.read",
    http: { method: "GET", path: "/v1/config" },
    mcp: { tool: "benchlocal_get_config", resource: "benchlocal://state/config" }
  },
  workspaces: {
    id: "workspaces.list",
    http: { method: "GET", path: "/v1/workspaces" },
    mcp: { tool: "benchlocal_list_workspaces", resource: "benchlocal://state/workspaces" }
  },
  benchPacks: {
    id: "benchpacks.list",
    http: { method: "GET", path: "/v1/benchpacks" },
    mcp: { tool: "benchlocal_list_benchpacks", resource: "benchlocal://state/benchpacks" }
  },
  benchPackRegistry: {
    id: "benchpacks.registry.list",
    http: { method: "GET", path: "/v1/benchpacks/registry" },
    mcp: { tool: "benchlocal_list_benchpack_registry" }
  },
  providers: {
    id: "providers.list",
    http: { method: "GET", path: "/v1/providers" },
    mcp: { tool: "benchlocal_list_providers", resource: "benchlocal://state/providers" }
  },
  provider: {
    id: "providers.read",
    http: { method: "GET", path: "/v1/providers/{providerId}" },
    mcp: { tool: "benchlocal_get_provider" }
  },
  discoverProviderModels: {
    id: "providers.models.discover",
    http: { method: "GET", path: "/v1/providers/{providerId}/models/discover" },
    mcp: { tool: "benchlocal_discover_provider_models" }
  },
  models: {
    id: "models.list",
    http: { method: "GET", path: "/v1/models" },
    mcp: { tool: "benchlocal_list_models", resource: "benchlocal://state/models" }
  },
  model: {
    id: "models.read",
    http: { method: "GET", path: "/v1/models/{modelId}" },
    mcp: { tool: "benchlocal_get_model" }
  },
  modelAvailability: {
    id: "models.availability.check",
    http: { method: "GET", path: "/v1/models/availability" },
    mcp: { tool: "benchlocal_check_model_availability" }
  },
  refreshModelAvailability: {
    id: "models.availability.refresh",
    http: { method: "POST", path: "/v1/models/availability/refresh" },
    httpAliases: ["/v1/tabs/{tabId}/models/availability/refresh"],
    mcp: { tool: "benchlocal_refresh_model_availability" }
  },
  activeRuns: {
    id: "runs.active.list",
    http: { method: "GET", path: "/v1/runs/active" },
    mcp: { tool: "benchlocal_list_active_runs", resource: "benchlocal://state/runs/active" }
  },
  runHistory: {
    id: "runs.history.list",
    http: { method: "GET", path: "/v1/benchpacks/{benchPackId}/history" },
    mcp: { tool: "benchlocal_list_run_history" }
  },
  runSummary: {
    id: "runs.history.read",
    http: { method: "GET", path: "/v1/benchpacks/{benchPackId}/history/{runId}" },
    mcp: { tool: "benchlocal_get_run_summary" }
  },
  verifiers: {
    id: "verifiers.list",
    http: { method: "GET", path: "/v1/verifiers" },
    mcp: { tool: "benchlocal_list_verifiers" }
  },
  recentEvents: {
    id: "events.recent.list",
    mcp: { tool: "benchlocal_get_recent_events", resource: "benchlocal://state/events/recent" }
  }
} as const;

export type ReadOnlyCapabilityKey = keyof typeof READ_ONLY_CAPABILITY_DEFINITIONS;

export type ReadOnlyAgentCapabilities = ReturnType<typeof createReadOnlyAgentCapabilities>;

export class CapabilityNotFoundError extends Error {
  readonly statusCode = 404;

  constructor(message: string) {
    super(message);
  }
}

export function createReadOnlyAgentCapabilities(
  controller: BenchLocalController,
  getRecentEvents: () => BenchLocalAgentEvent[]
) {
  // handler 同时服务 HTTP 与 MCP，传输层只负责协议适配和状态码。
  return {
    config: async () => ({ config: await controller.getSafeConfig() }),
    workspaces: async () => controller.loadWorkspaceState(),
    benchPacks: async () => ({ benchPacks: await controller.listBenchPacks() }),
    benchPackRegistry: async () => ({ registry: await controller.loadBenchPackRegistry() }),
    providers: async () => ({ providers: await controller.listProviders() }),
    provider: async (providerId: string) => {
      const providers = await controller.listProviders();
      const provider = providers[providerId];

      if (!provider) {
        throw new CapabilityNotFoundError(`Provider "${providerId}" was not found.`);
      }

      return { providerId, provider };
    },
    discoverProviderModels: async (providerId: string) => ({
      models: await controller.discoverProviderModelsById(providerId)
    }),
    models: async () => {
      const { config } = await controller.loadConfig();
      return { models: config.models };
    },
    activeRuns: async () => ({ activeRuns: await controller.listActiveRuns() }),
    model: async (modelId: string) => {
      const { config } = await controller.loadConfig();
      const model = config.models.find((candidate) => candidate.id === modelId);

      if (!model) {
        throw new CapabilityNotFoundError(`Model "${modelId}" was not found.`);
      }

      return { model };
    },
    modelAvailability: async (modelIds?: string[]) => {
      const { config } = await controller.loadConfig();
      return { availability: await controller.checkModelAvailability({ config, modelIds }) };
    },
    refreshModelAvailability: async (input: { tabId?: string; modelIds?: unknown }) => {
      let modelIds = Array.isArray(input.modelIds)
        ? input.modelIds.filter((modelId): modelId is string => typeof modelId === "string")
        : undefined;

      if (input.tabId && (!modelIds || modelIds.length === 0)) {
        const { state } = await controller.loadWorkspaceState();
        const tab = state.tabs[input.tabId];

        if (!tab) {
          throw new CapabilityNotFoundError(`Tab "${input.tabId}" was not found.`);
        }

        modelIds = tab.modelSelections.map((selection) => selection.modelId);
      }

      const { config } = await controller.loadConfig();
      return {
        availability: await controller.checkModelAvailability({ config, modelIds })
      };
    },
    verifiers: async () => ({ verifiers: await controller.listVerifiers() }),
    runHistory: async (benchPackId: string) => ({ history: await controller.listRunHistory(benchPackId) }),
    runSummary: async (benchPackId: string, runId: string) => ({
      run: await controller.loadRunHistory(benchPackId, runId)
    }),
    recentEvents: async (limit?: number) => {
      const events = getRecentEvents();
      const count = Number.isFinite(limit) && limit && limit > 0 ? Math.floor(limit) : events.length;
      return { events: events.slice(-count) };
    }
  };
}

export const WRITE_CAPABILITY_DEFINITIONS = {
  createProvider: {
    id: "providers.create",
    http: { method: "POST", path: "/v1/providers", successStatus: 201 },
    mcp: { tool: "benchlocal_create_provider" }
  },
  updateProvider: {
    id: "providers.update",
    http: { method: "PATCH", path: "/v1/providers/{providerId}", successStatus: 200 },
    mcp: { tool: "benchlocal_update_provider" }
  },
  deleteProvider: {
    id: "providers.delete",
    http: { method: "DELETE", path: "/v1/providers/{providerId}", successStatus: 200 },
    mcp: { tool: "benchlocal_delete_provider" }
  },
  duplicateProvider: {
    id: "providers.duplicate",
    http: { method: "POST", path: "/v1/providers/{providerId}/duplicate", successStatus: 201 },
    mcp: { tool: "benchlocal_duplicate_provider" }
  },
  createModel: {
    id: "models.create",
    http: { method: "POST", path: "/v1/models", successStatus: 201 },
    mcp: { tool: "benchlocal_create_model" }
  },
  updateModel: {
    id: "models.update",
    http: { method: "PATCH", path: "/v1/models/{modelId}", successStatus: 200 },
    mcp: { tool: "benchlocal_update_model" }
  },
  deleteModel: {
    id: "models.delete",
    http: { method: "DELETE", path: "/v1/models/{modelId}", successStatus: 200 },
    mcp: { tool: "benchlocal_delete_model" }
  },
  duplicateModel: {
    id: "models.duplicate",
    http: { method: "POST", path: "/v1/models/{modelId}/duplicate", successStatus: 201 },
    mcp: { tool: "benchlocal_duplicate_model" }
  }
} as const;

export type WriteCapabilityKey = keyof typeof WRITE_CAPABILITY_DEFINITIONS;

export function createWriteAgentCapabilities(controller: BenchLocalController) {
  // 写 handler 只编排领域调用，HTTP 状态码与 MCP 注解继续由各自适配层负责。
  return {
    createProvider: (input: BenchLocalAgentCreateProviderRequest) => controller.createProvider(input),
    updateProvider: (providerId: string, input: BenchLocalAgentPatchProviderRequest) => controller.updateProvider(providerId, input),
    deleteProvider: (providerId: string) => controller.deleteProvider(providerId),
    duplicateProvider: (providerId: string) => controller.duplicateProvider(providerId),
    createModel: (input: BenchLocalAgentCreateModelRequest) => controller.createModel(input),
    updateModel: (modelId: string, input: BenchLocalAgentPatchModelRequest) => controller.updateModel(modelId, input),
    deleteModel: (modelId: string) => controller.deleteModel(modelId),
    duplicateModel: (modelId: string) => controller.duplicateModel(modelId)
  };
}
