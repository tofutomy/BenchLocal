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
  models: {
    id: "models.list",
    http: { method: "GET", path: "/v1/models" },
    mcp: { tool: "benchlocal_list_models", resource: "benchlocal://state/models" }
  },
  activeRuns: {
    id: "runs.active.list",
    http: { method: "GET", path: "/v1/runs/active" },
    mcp: { tool: "benchlocal_list_active_runs", resource: "benchlocal://state/runs/active" }
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
    models: async () => {
      const { config } = await controller.loadConfig();
      return { models: config.models };
    },
    activeRuns: async () => ({ activeRuns: await controller.listActiveRuns() }),
    verifiers: async () => ({ verifiers: await controller.listVerifiers() }),
    recentEvents: async (limit?: number) => {
      const events = getRecentEvents();
      const count = Number.isFinite(limit) && limit && limit > 0 ? Math.floor(limit) : events.length;
      return { events: events.slice(-count) };
    }
  };
}
