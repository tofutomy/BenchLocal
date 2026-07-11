import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { BenchLocalAgentEvent } from "@core";
import type { BenchLocalController } from "../src/main/controller";
import {
  READ_ONLY_CAPABILITY_DEFINITIONS,
  WRITE_CAPABILITY_DEFINITIONS,
  createReadOnlyAgentCapabilities,
  createWriteAgentCapabilities
} from "../src/main/agent/capabilities";

const repoRoot = path.resolve(__dirname, "..");

async function readProjectFile(relativePath: string): Promise<string> {
  return fs.readFile(path.join(repoRoot, relativePath), "utf8");
}

function readStringMatches(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

describe("Agent API contract", () => {
  it("keeps the documented HTTP and MCP entrypoints wired", async () => {
    const [agentServerSource, agentMcpSource, capabilitySource] = await Promise.all([
      readProjectFile("src/main/agent-server.ts"),
      readProjectFile("src/main/agent-mcp.ts"),
      readProjectFile("src/main/agent/capabilities.ts")
    ]);

    const pathnameChecks = new Set(readStringMatches(agentServerSource, /url\.pathname === "([^"]+)"/g));
    const mcpTools = new Set(readStringMatches(`${agentMcpSource}\n${capabilitySource}`, /"(benchlocal_[^"]+)"/g));

    expect([...pathnameChecks]).toEqual(
      expect.arrayContaining(["/v1/health", "/mcp", "/v1/mcp", "/v1/events", "/v1/agent-guide", "/v1/openapi.json"])
    );
    expect(agentServerSource).toContain("handleBenchLocalMcpRequest(this.controller");
    expect([...mcpTools]).toEqual(
      expect.arrayContaining([
        "benchlocal_get_health",
        "benchlocal_get_config",
        "benchlocal_list_workspaces",
        "benchlocal_list_benchpacks",
        "benchlocal_list_models",
        "benchlocal_create_tab",
        "benchlocal_select_models",
        "benchlocal_start_run",
        "benchlocal_stop_run",
        "benchlocal_get_recent_events"
      ])
    );
  });

  it("keeps read-only capability ids and transport mappings unique", () => {
    const definitions = Object.values(READ_ONLY_CAPABILITY_DEFINITIONS);
    const ids = definitions.map((definition) => definition.id);
    const httpPaths = definitions.flatMap((definition) => "http" in definition ? [definition.http.path] : []);
    const mcpTools = definitions.map((definition) => definition.mcp.tool);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(httpPaths).size).toBe(httpPaths.length);
    expect(new Set(mcpTools).size).toBe(mcpTools.length);
    expect(httpPaths).toEqual(expect.arrayContaining([
      "/v1/config",
      "/v1/workspaces",
      "/v1/benchpacks",
      "/v1/models",
      "/v1/runs/active"
    ]));
  });

  it("shares read-only response shaping between HTTP and MCP adapters", async () => {
    const calls: string[] = [];
    const controller = {
      getSafeConfig: async () => {
        calls.push("config");
        return { providers: {} };
      },
      loadWorkspaceState: async () => ({ state: { workspaces: [], tabs: { tab1: { modelSelections: [{ modelId: "model-1" }] } } } }),
      listBenchPacks: async () => [],
      loadBenchPackRegistry: async () => [],
      listProviders: async () => ({ provider1: { name: "Provider 1" } }),
      discoverProviderModelsById: async () => [{ id: "remote-model" }],
      loadConfig: async () => ({ config: { models: [{ id: "model-1" }] } }),
      listActiveRuns: async () => [],
      listVerifiers: async () => [],
      checkModelAvailability: async (input: { modelIds?: string[] }) => input.modelIds ?? [],
      listRunHistory: async () => [{ runId: "run-1" }],
      loadRunHistory: async () => ({ runId: "run-1" })
    } as unknown as BenchLocalController;
    const events: BenchLocalAgentEvent[] = [
      { eventId: "evt-1", createdAt: "2026-01-01T00:00:00.000Z", type: "benchpack.run.event", payload: {} },
      { eventId: "evt-2", createdAt: "2026-01-01T00:00:01.000Z", type: "benchpack.run.event", payload: {} }
    ];
    const capabilities = createReadOnlyAgentCapabilities(controller, () => events);

    expect(await capabilities.config()).toEqual({ config: { providers: {} } });
    expect(await capabilities.models()).toEqual({ models: [{ id: "model-1" }] });
    expect(await capabilities.recentEvents(1)).toEqual({ events: [events[1]] });
    expect(await capabilities.provider("provider1")).toEqual({ providerId: "provider1", provider: { name: "Provider 1" } });
    expect(await capabilities.discoverProviderModels("provider1")).toEqual({ models: [{ id: "remote-model" }] });
    expect(await capabilities.model("model-1")).toEqual({ model: { id: "model-1" } });
    expect(await capabilities.runHistory("pack-1")).toEqual({ history: [{ runId: "run-1" }] });
    expect(await capabilities.modelAvailability(["model-1"])).toEqual({ availability: ["model-1"] });
    expect(await capabilities.refreshModelAvailability({ tabId: "tab1" })).toEqual({ availability: ["model-1"] });
    await expect(capabilities.refreshModelAvailability({ tabId: "missing" })).rejects.toMatchObject({ statusCode: 404 });
    expect(await capabilities.runSummary("pack-1", "run-1")).toEqual({ run: { runId: "run-1" } });
    await expect(capabilities.model("missing")).rejects.toMatchObject({ statusCode: 404 });
    expect(calls).toEqual(["config"]);
  });

  it("registers provider and model writes once and delegates their handlers", async () => {
    const definitions = Object.values(WRITE_CAPABILITY_DEFINITIONS);
    const ids = definitions.map((definition) => definition.id);
    const tools = definitions.map((definition) => definition.mcp.tool);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(tools).size).toBe(tools.length);

    const calls: string[] = [];
    const controller = {
      createProvider: async () => calls.push("createProvider"),
      updateProvider: async () => calls.push("updateProvider"),
      deleteProvider: async () => calls.push("deleteProvider"),
      duplicateProvider: async () => calls.push("duplicateProvider"),
      createModel: async () => calls.push("createModel"),
      updateModel: async () => calls.push("updateModel"),
      deleteModel: async () => calls.push("deleteModel"),
      duplicateModel: async () => calls.push("duplicateModel")
    } as unknown as BenchLocalController;
    const capabilities = createWriteAgentCapabilities(controller);

    await capabilities.createProvider({ kind: "ollama", base_url: "http://localhost" });
    await capabilities.updateProvider("provider-1", { enabled: false });
    await capabilities.deleteModel("model-1");
    await capabilities.duplicateModel("model-1");
    expect(calls).toEqual(["createProvider", "updateProvider", "deleteModel", "duplicateModel"]);
  });

  it("delegates tab writes and keeps specialized patch payloads stable", async () => {
    const calls: unknown[] = [];
    const controller = {
      createWorkspaceTab: async (workspaceId: string, input: unknown) => calls.push(["createTab", workspaceId, input]),
      patchTab: async (tabId: string, input: unknown) => calls.push(["patchTab", tabId, input]),
      selectTabBenchPack: async (tabId: string, benchPackId: string | null, title?: string) =>
        calls.push(["selectBenchPack", tabId, benchPackId, title]),
      selectTabModels: async (tabId: string, input: unknown) => calls.push(["selectModels", tabId, input])
    } as unknown as BenchLocalController;
    const capabilities = createWriteAgentCapabilities(controller);

    await capabilities.createTab("workspace-1", { title: "Tab" });
    await capabilities.selectBenchPack("tab-1", { benchPackId: "pack-1", title: "Pack" });
    await capabilities.selectModels("tab-1", { modelIds: ["model-1"] });
    await capabilities.setSampling("tab-1", { samplingOverrides: { temperature: 0.2 } });
    await capabilities.setExecutionMode("tab-1", { executionMode: "serial", runsPerTest: 2 });
    await capabilities.setRunsPerTest("tab-1", { runsPerTest: 3 });

    expect(calls).toEqual([
      ["createTab", "workspace-1", { title: "Tab" }],
      ["selectBenchPack", "tab-1", "pack-1", "Pack"],
      ["selectModels", "tab-1", { modelIds: ["model-1"] }],
      ["patchTab", "tab-1", { samplingOverrides: { temperature: 0.2 } }],
      ["patchTab", "tab-1", { executionMode: "serial", runsPerTest: 2 }],
      ["patchTab", "tab-1", { runsPerTest: 3 }]
    ]);
  });
});

