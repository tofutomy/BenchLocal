import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { BenchLocalAgentEvent } from "@core";
import type { BenchLocalController } from "../src/main/controller";
import {
  READ_ONLY_CAPABILITY_DEFINITIONS,
  WRITE_CAPABILITY_DEFINITIONS,
  createReadOnlyAgentCapabilities,
  createWriteAgentCapabilities,
  type ReadOnlyAgentCapabilities
} from "../src/main/agent/capabilities";
import { createAgentGuide } from "../src/main/agent/guide";
import {
  routeProviderModelWriteAgentHttp,
  routeReadOnlyAgentHttp,
  routeWorkspaceRunWriteAgentHttp
} from "../src/main/agent/http-router";
import { createOpenApiDocument } from "../src/main/agent/openapi";

import {
  executionModeSchema,
  generationSchema,
  modelSelectionSchema,
  providerKindSchema
} from "../src/main/agent/schemas";
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

  it("resolves run defaults and returns accepted lifecycle responses", async () => {
    const runInputs: unknown[] = [];
    const loadedRuns: string[] = [];
    const controller = {
      loadWorkspaceState: async () => ({
        state: {
          tabs: {
            tab1: {
              benchPackId: "pack-1",
              modelSelections: [{ modelId: "model-1" }],
              executionMode: "serial",
              runsPerTest: 2,
              samplingOverrides: { temperature: 0.3 }
            },
            empty: { benchPackId: null, modelSelections: [], executionMode: "serial", runsPerTest: 1 }
          }
        }
      }),
      runBenchPack: async (input: unknown) => {
        runInputs.push(input);
        return { runId: "run-new" };
      },
      resumeRun: async (input: unknown) => {
        runInputs.push(input);
        return { runId: "run-resumed" };
      },
      setTabLoadedRun: async (_tabId: string, runId: string) => loadedRuns.push(runId),
      stopRun: async (tabId: string) => ({ stopped: true, tabId })
    } as unknown as BenchLocalController;
    const capabilities = createWriteAgentCapabilities(controller);

    await expect(capabilities.startRun("tab1", {})).resolves.toEqual({ accepted: true, tabId: "tab1" });
    await expect(capabilities.resumeRun("tab1", "run-old", { runsPerTest: 4 })).resolves.toEqual({
      accepted: true,
      tabId: "tab1",
      runId: "run-old"
    });
    await expect(capabilities.stopRun("tab1")).resolves.toEqual({ stopped: true, tabId: "tab1" });
    expect(runInputs).toEqual([
      { tabId: "tab1", benchPackId: "pack-1", modelIds: ["model-1"], executionMode: "serial", runsPerTest: 2, generation: { temperature: 0.3 } },
      { tabId: "tab1", benchPackId: "pack-1", modelIds: ["model-1"], executionMode: "serial", runsPerTest: 4, generation: { temperature: 0.3 }, runId: "run-old" }
    ]);
    await expect(capabilities.startRun("missing", {})).rejects.toMatchObject({ statusCode: 404 });
    await expect(capabilities.startRun("empty", {})).rejects.toMatchObject({ statusCode: 400 });
    await Promise.resolve();
    expect(loadedRuns).toEqual(["run-new", "run-resumed"]);
  });
  it("preserves scenario and batch retry outcomes", async () => {
    const retryInputs: unknown[] = [];
    const loadedRuns: string[] = [];
    const controller = {
      loadWorkspaceState: async () => ({
        state: {
          tabs: {
            tab1: {
              benchPackId: "pack-1",
              executionMode: "serial",
              runsPerTest: 2,
              samplingOverrides: { temperature: 0.4 }
            }
          }
        }
      }),
      retryScenario: async (input: unknown) => {
        retryInputs.push(input);
        return { runId: "retry-scenario" };
      },
      createRetryBatchPlan: async (input: { runId: string }) => ({
        ...input,
        cells: input.runId === "empty" ? [] : [{ id: "cell-1" }],
        groups: input.runId === "empty" ? [] : [{ id: "group-1" }]
      }),
      executeRetryBatch: async (plan: unknown, options: unknown) => {
        retryInputs.push({ plan, options });
        return { run: { runId: "retry-batch" } };
      },
      setTabLoadedRun: async (_tabId: string, runId: string) => loadedRuns.push(runId)
    } as unknown as BenchLocalController;
    const capabilities = createWriteAgentCapabilities(controller);

    await expect(capabilities.retryScenario("tab1", "run-1", {
      scenarioId: " scenario-1 ",
      modelId: " model-1 "
    })).resolves.toEqual({ accepted: true, tabId: "tab1", runId: "run-1" });
    await expect(capabilities.retryProviderErrors("tab1", "empty", {})).resolves.toEqual({
      accepted: false,
      tabId: "tab1",
      runId: "empty",
      kind: "provider_errors",
      cellCount: 0,
      groupCount: 0
    });
    await expect(capabilities.retryFailedResults("tab1", "run-2", { runsPerTest: 5 })).resolves.toMatchObject({
      accepted: true,
      kind: "failed_results",
      cellCount: 1,
      groupCount: 1
    });
    expect(retryInputs[0]).toMatchObject({ scenarioId: "scenario-1", modelId: "model-1" });
    expect(retryInputs[1]).toMatchObject({ options: { runsPerTest: 5, generation: { temperature: 0.4 } } });
    await Promise.resolve();
    expect(loadedRuns).toEqual(["retry-scenario", "retry-batch"]);
  });

  it("shares stable primitive schemas across Agent transports", () => {
    expect(executionModeSchema.safeParse("full_parallel").success).toBe(true);
    expect(executionModeSchema.safeParse("parallel").success).toBe(false);
    expect(providerKindSchema.safeParse("openai_compatible").success).toBe(true);
    expect(providerKindSchema.safeParse("unknown").success).toBe(false);
    expect(generationSchema.parse({
      temperature: 0.2,
      request_timeout_seconds: 30
    })).toEqual({
      temperature: 0.2,
      request_timeout_seconds: 30
    });
    expect(modelSelectionSchema.safeParse({ modelId: "model-1", alias: "primary" }).success).toBe(true);
    expect(modelSelectionSchema.safeParse({ alias: "missing-id" }).success).toBe(false);
  });

  it("generates the extracted OpenAPI document with stable routing metadata", () => {
    const document = createOpenApiDocument(43210);

    expect(document.openapi).toBe("3.1.0");
    expect(document.servers).toEqual([{ url: "http://127.0.0.1:43210" }]);
    expect(document.components.securitySchemes.bearerAuth).toEqual({ type: "http", scheme: "bearer" });
    expect(Object.keys(document.paths)).toEqual(expect.arrayContaining([
      "/v1/health",
      "/v1/openapi.json",
      "/v1/providers/{providerId}",
      "/v1/tabs/{tabId}/runs",
      "/v1/tabs/{tabId}/runs/{runId}/retry-failed-results",
      "/mcp"
    ]));
  });
  it("generates the extracted Agent guide with stable workflow instructions", () => {
    const guide = createAgentGuide(43210);

    expect(guide).toContain("Base URL: `http://127.0.0.1:43210`");
    expect(guide).toContain("MCP URL: `http://127.0.0.1:43210/mcp`");
    expect(guide).toContain("Authorization: Bearer <token>");
    expect(guide).toContain("POST /v1/tabs/:tabId/runs/:runId/retry-provider-errors");
    expect(guide).toContain("benchlocal_get_recent_events");
  });


  it("routes read-only HTTP capabilities before write command dispatch", async () => {
    const calls: unknown[] = [];
    const capabilities = {
      config: async () => ({ config: true }),
      workspaces: async () => ({ workspaces: true }),
      benchPacks: async () => ({ benchPacks: true }),
      benchPackRegistry: async () => ({ registry: true }),
      providers: async () => ({ providers: true }),
      provider: async (providerId: string) => {
        calls.push(["provider", providerId]);
        return { providerId };
      },
      discoverProviderModels: async (providerId: string) => ({ providerId }),
      models: async () => ({ models: true }),
      modelAvailability: async () => ({ availability: true }),
      model: async (modelId: string) => ({ modelId }),
      activeRuns: async () => ({ activeRuns: true }),
      verifiers: async () => ({ verifiers: true }),
      runHistory: async (benchPackId: string) => ({ benchPackId }),
      runSummary: async (benchPackId: string, runId: string) => {
        calls.push(["runSummary", benchPackId, runId]);
        return { benchPackId, runId };
      }
    } as unknown as ReadOnlyAgentCapabilities;

    await expect(routeReadOnlyAgentHttp("GET", ["config"], capabilities)).resolves.toEqual({
      statusCode: 200,
      payload: { config: true }
    });
    await expect(routeReadOnlyAgentHttp("GET", ["models", "availability"], capabilities)).resolves.toMatchObject({
      payload: { availability: true }
    });
    await routeReadOnlyAgentHttp("GET", ["providers", "provider-1"], capabilities);
    await routeReadOnlyAgentHttp("GET", ["benchpacks", "pack-1", "history", "run-1"], capabilities);
    await expect(routeReadOnlyAgentHttp("POST", ["config"], capabilities)).resolves.toBeNull();
    await expect(routeReadOnlyAgentHttp("GET", ["unknown"], capabilities)).resolves.toBeNull();
    expect(calls).toEqual([["provider", "provider-1"], ["runSummary", "pack-1", "run-1"]]);
  });

  it("routes provider and model writes with registry status codes and body guards", async () => {
    const calls: unknown[] = [];
    let bodyReads = 0;
    const controller = {
      createProvider: async (input: unknown) => {
        calls.push(["createProvider", input]);
        return { created: true };
      },
      updateProvider: async (providerId: string, input: unknown) => ({ providerId, input }),
      deleteProvider: async (providerId: string) => ({ providerId }),
      duplicateProvider: async (providerId: string) => ({ providerId }),
      createModel: async (input: unknown) => ({ input }),
      updateModel: async (modelId: string, input: unknown) => ({ modelId, input }),
      deleteModel: async (modelId: string) => {
        calls.push(["deleteModel", modelId]);
        return { modelId };
      },
      duplicateModel: async (modelId: string) => ({ modelId })
    } as unknown as BenchLocalController;
    const capabilities = createWriteAgentCapabilities(controller);
    const readBody = async () => {
      bodyReads += 1;
      return { kind: "ollama", base_url: "http://localhost" };
    };

    await expect(routeProviderModelWriteAgentHttp("POST", ["providers"], capabilities, readBody)).resolves.toEqual({
      statusCode: 201,
      payload: { created: true }
    });
    await expect(routeProviderModelWriteAgentHttp("DELETE", ["models", "model-1"], capabilities, readBody)).resolves.toEqual({
      statusCode: 200,
      payload: { modelId: "model-1" }
    });
    await expect(routeProviderModelWriteAgentHttp("POST", ["unknown"], capabilities, readBody)).resolves.toBeNull();
    expect(bodyReads).toBe(1);
    expect(calls).toEqual([
      ["createProvider", { kind: "ollama", base_url: "http://localhost" }],
      ["deleteModel", "model-1"]
    ]);
    await expect(routeProviderModelWriteAgentHttp(
      "POST",
      ["providers"],
      capabilities,
      async () => ({ kind: "ollama", base_url: "http://localhost", unexpected: true })
    )).rejects.toMatchObject({ statusCode: 400, message: "Unknown field: unexpected" });
  });


  it("routes workspace, tab, and run writes without consuming unmatched bodies", async () => {
    let bodyReads = 0;
    const controller = {
      createWorkspaceTab: async (workspaceId: string, input: unknown) => ({ workspaceId, input }),
      loadWorkspaceState: async () => ({
        state: {
          tabs: {
            tab1: {
              benchPackId: "pack-1",
              modelSelections: [{ modelId: "model-1" }],
              executionMode: "serial",
              runsPerTest: 1,
              samplingOverrides: {}
            }
          }
        }
      }),
      runBenchPack: async () => ({ runId: "run-new" }),
      setTabLoadedRun: async () => undefined,
      createRetryBatchPlan: async () => ({ cells: [], groups: [] })
    } as unknown as BenchLocalController;
    const writeCapabilities = createWriteAgentCapabilities(controller);
    const readCapabilities = {
      refreshModelAvailability: async (input: unknown) => ({ input })
    } as unknown as ReadOnlyAgentCapabilities;
    const readBody = async () => {
      bodyReads += 1;
      return {};
    };

    await expect(routeWorkspaceRunWriteAgentHttp(
      "POST", ["workspaces", "workspace-1", "tabs"], readCapabilities, writeCapabilities, readBody
    )).resolves.toMatchObject({ statusCode: 201 });
    await expect(routeWorkspaceRunWriteAgentHttp(
      "POST", ["tabs", "tab1", "runs"], readCapabilities, writeCapabilities, readBody
    )).resolves.toMatchObject({ statusCode: 202, payload: { accepted: true } });
    await expect(routeWorkspaceRunWriteAgentHttp(
      "POST", ["tabs", "tab1", "runs", "run-1", "retry-provider-errors"], readCapabilities, writeCapabilities, readBody
    )).resolves.toMatchObject({ statusCode: 200, payload: { accepted: false } });
    await expect(routeWorkspaceRunWriteAgentHttp(
      "POST", ["unknown"], readCapabilities, writeCapabilities, readBody
    )).resolves.toBeNull();
    expect(bodyReads).toBe(3);

    await expect(routeWorkspaceRunWriteAgentHttp(
      "POST",
      ["workspaces", "workspace-1", "tabs"],
      readCapabilities,
      writeCapabilities,
      async () => ({ unexpected: true })
    )).rejects.toMatchObject({ statusCode: 400, message: "Unknown field: unexpected" });
  });
});

