import type { BenchLocalAgentEvent } from "@core";
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
