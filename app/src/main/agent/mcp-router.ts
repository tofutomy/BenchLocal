import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type {
  BenchLocalAgentCreateModelRequest,
  BenchLocalAgentCreateProviderRequest,
  BenchLocalAgentEvent,
  BenchLocalAgentExecutionModeRequest,
  BenchLocalAgentPatchModelRequest,
  BenchLocalAgentPatchProviderRequest,
  BenchLocalAgentPatchTabRequest,
  BenchLocalAgentRetryBatchRequest,
  BenchLocalAgentRetryScenarioRequest,
  BenchLocalAgentRunRequest,
  BenchLocalAgentRunsPerTestRequest,
  BenchLocalAgentSamplingRequest,
  BenchLocalAgentSelectBenchPackRequest,
  BenchLocalAgentSelectModelsRequest,
  BenchLocalAgentResumeRunRequest,
  BenchLocalExecutionMode,
  GenerationRequest
} from "@core";
import type { BenchLocalController } from "../controller";
import {
  WRITE_CAPABILITY_DEFINITIONS,
  createReadOnlyAgentCapabilities,
  createWriteAgentCapabilities
} from "./capabilities";
import {
  executionModeSchema,
  generationSchema,
  modelSelectionSchema,
  providerKindSchema
} from "./schemas";
import { jsonToolResult } from "./mcp-content";
import { registerBenchLocalMcpResources } from "./mcp-resources";
import { registerBenchLocalMcpReadTools } from "./mcp-read-tools";

export type BenchLocalMcpOptions = {
  getAgentGuide: () => string;
  getOpenApiDocument: () => unknown;
  getRecentEvents: () => BenchLocalAgentEvent[];
};

export function createBenchLocalMcpServer(controller: BenchLocalController, options: BenchLocalMcpOptions): McpServer {
  const capabilities = createReadOnlyAgentCapabilities(controller, options.getRecentEvents);
  const writeCapabilities = createWriteAgentCapabilities(controller, {
    onBackgroundError: (operation, error) => {
      const label = operation === "retryBatch" ? "retry batch" : operation;
      console.error(`[benchlocal] mcp-started ${label} failed`, error);
    }
  });
  const server = new McpServer({
    name: "benchlocal",
    title: "BenchLocal",
    version: "1.0.0",
    websiteUrl: "https://github.com/stevibe/BenchLocal"
  });

  registerBenchLocalMcpResources(server, capabilities, options);
  registerBenchLocalMcpReadTools(server, controller, capabilities);
  server.registerTool(
    WRITE_CAPABILITY_DEFINITIONS.createProvider.mcp.tool,
    {
      title: "Create Provider",
      description: "Create one provider record.",
      inputSchema: {
        id: z.string().optional(),
        kind: providerKindSchema,
        name: z.string().optional(),
        enabled: z.boolean().optional(),
        base_url: z.string(),
        api_key: z.string().optional(),
        api_key_env: z.string().optional()
      },
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async (input) => jsonToolResult(await writeCapabilities.createProvider(input as BenchLocalAgentCreateProviderRequest))
  );

  server.registerTool(
    WRITE_CAPABILITY_DEFINITIONS.updateProvider.mcp.tool,
    {
      title: "Update Provider",
      description: "Patch one provider record.",
      inputSchema: {
        providerId: z.string(),
        kind: providerKindSchema.optional(),
        name: z.string().optional(),
        enabled: z.boolean().optional(),
        base_url: z.string().optional(),
        api_key: z.string().nullable().optional(),
        api_key_env: z.string().nullable().optional()
      },
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ providerId, ...patch }) => jsonToolResult(
      await writeCapabilities.updateProvider(providerId, patch as BenchLocalAgentPatchProviderRequest)
    )
  );

  server.registerTool(
    WRITE_CAPABILITY_DEFINITIONS.deleteProvider.mcp.tool,
    {
      title: "Delete Provider",
      description: "Delete a provider and its linked models.",
      inputSchema: {
        providerId: z.string()
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false }
    },
    async ({ providerId }) => jsonToolResult(await writeCapabilities.deleteProvider(providerId))
  );

  server.registerTool(
    WRITE_CAPABILITY_DEFINITIONS.duplicateProvider.mcp.tool,
    {
      title: "Duplicate Provider",
      description: "Duplicate one provider record without duplicating linked models.",
      inputSchema: {
        providerId: z.string()
      },
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ providerId }) => jsonToolResult(await writeCapabilities.duplicateProvider(providerId))
  );




  server.registerTool(
    WRITE_CAPABILITY_DEFINITIONS.createModel.mcp.tool,
    {
      title: "Create Model",
      description: "Create one model record.",
      inputSchema: {
        id: z.string().optional(),
        provider: z.string(),
        model: z.string(),
        label: z.string().optional(),
        group: z.string().optional(),
        enabled: z.boolean().optional()
      },
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async (input) => jsonToolResult(await writeCapabilities.createModel(input as BenchLocalAgentCreateModelRequest))
  );

  server.registerTool(
    WRITE_CAPABILITY_DEFINITIONS.updateModel.mcp.tool,
    {
      title: "Update Model",
      description: "Patch one model record.",
      inputSchema: {
        modelId: z.string(),
        id: z.string().optional(),
        provider: z.string().optional(),
        model: z.string().optional(),
        label: z.string().optional(),
        group: z.string().optional(),
        enabled: z.boolean().optional()
      },
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ modelId, ...patch }) => jsonToolResult(
      await writeCapabilities.updateModel(modelId, patch as BenchLocalAgentPatchModelRequest)
    )
  );

  server.registerTool(
    WRITE_CAPABILITY_DEFINITIONS.deleteModel.mcp.tool,
    {
      title: "Delete Model",
      description: "Delete one model record and remove it from tab selections.",
      inputSchema: {
        modelId: z.string()
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false }
    },
    async ({ modelId }) => jsonToolResult(await writeCapabilities.deleteModel(modelId))
  );

  server.registerTool(
    WRITE_CAPABILITY_DEFINITIONS.duplicateModel.mcp.tool,
    {
      title: "Duplicate Model",
      description: "Duplicate one model record.",
      inputSchema: {
        modelId: z.string()
      },
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ modelId }) => jsonToolResult(await writeCapabilities.duplicateModel(modelId))
  );



  server.registerTool(
    WRITE_CAPABILITY_DEFINITIONS.createTab.mcp.tool,
    {
      title: "Create Tab",
      description: "Create a workspace tab and optionally select a Bench Pack and models.",
      inputSchema: {
        workspaceId: z.string(),
        benchPackId: z.string().nullable().optional(),
        title: z.string().optional(),
        modelSelections: z.array(modelSelectionSchema).optional()
      },
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ workspaceId, ...input }) => jsonToolResult(await writeCapabilities.createTab(workspaceId, input))
  );

  server.registerTool(
    WRITE_CAPABILITY_DEFINITIONS.patchTab.mcp.tool,
    {
      title: "Patch Tab",
      description: "Patch tab title, focused scenario, selected models, sampling, execution mode, or runs per test.",
      inputSchema: {
        tabId: z.string(),
        title: z.string().optional(),
        focusedScenarioId: z.string().nullable().optional(),
        modelSelections: z.array(modelSelectionSchema).optional(),
        samplingOverrides: generationSchema.optional(),
        executionMode: executionModeSchema.optional(),
        runsPerTest: z.number().optional()
      },
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ tabId, ...patch }) => jsonToolResult(await writeCapabilities.patchTab(tabId, patch as BenchLocalAgentPatchTabRequest))
  );

  server.registerTool(
    WRITE_CAPABILITY_DEFINITIONS.selectBenchPack.mcp.tool,
    {
      title: "Select Bench Pack",
      description: "Select a Bench Pack for a tab.",
      inputSchema: {
        tabId: z.string(),
        benchPackId: z.string().nullable(),
        title: z.string().optional()
      },
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ tabId, ...input }) => {
      const request = input as BenchLocalAgentSelectBenchPackRequest;
      return jsonToolResult(await writeCapabilities.selectBenchPack(tabId, request));
    }
  );

  server.registerTool(
    WRITE_CAPABILITY_DEFINITIONS.selectModels.mcp.tool,
    {
      title: "Select Models",
      description: "Select models for a tab.",
      inputSchema: {
        tabId: z.string(),
        modelIds: z.array(z.string()).optional(),
        selections: z.array(modelSelectionSchema).optional()
      },
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ tabId, ...input }) => jsonToolResult(await writeCapabilities.selectModels(tabId, input as BenchLocalAgentSelectModelsRequest))
  );

  server.registerTool(
    WRITE_CAPABILITY_DEFINITIONS.setSampling.mcp.tool,
    {
      title: "Set Sampling",
      description: "Set tab sampling overrides.",
      inputSchema: {
        tabId: z.string(),
        samplingOverrides: generationSchema
      },
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ tabId, samplingOverrides }) => {
      const request: BenchLocalAgentSamplingRequest = {
        samplingOverrides: samplingOverrides as GenerationRequest
      };
      return jsonToolResult(await writeCapabilities.setSampling(tabId, request));
    }
  );

  server.registerTool(
    WRITE_CAPABILITY_DEFINITIONS.setExecutionMode.mcp.tool,
    {
      title: "Set Execution Mode",
      description: "Set tab execution mode and optionally runs per test.",
      inputSchema: {
        tabId: z.string(),
        executionMode: executionModeSchema,
        runsPerTest: z.number().optional()
      },
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ tabId, executionMode, runsPerTest }) => {
      const request: BenchLocalAgentExecutionModeRequest = {
        executionMode: executionMode as BenchLocalExecutionMode,
        runsPerTest
      };
      return jsonToolResult(await writeCapabilities.setExecutionMode(tabId, request));
    }
  );

  server.registerTool(
    WRITE_CAPABILITY_DEFINITIONS.setRunsPerTest.mcp.tool,
    {
      title: "Set Runs Per Test",
      description: "Set tab runs-per-test count.",
      inputSchema: {
        tabId: z.string(),
        runsPerTest: z.number()
      },
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ tabId, runsPerTest }) => {
      const request: BenchLocalAgentRunsPerTestRequest = { runsPerTest };
      return jsonToolResult(await writeCapabilities.setRunsPerTest(tabId, request));
    }
  );

  server.registerTool(
    WRITE_CAPABILITY_DEFINITIONS.startRun.mcp.tool,
    {
      title: "Start Run",
      description: "Start a benchmark run for a tab. Returns immediately; poll recent events for progress.",
      inputSchema: {
        tabId: z.string(),
        benchPackId: z.string().optional(),
        modelIds: z.array(z.string()).optional(),
        executionMode: executionModeSchema.optional(),
        runsPerTest: z.number().optional(),
        generation: generationSchema.optional()
      },
      annotations: { readOnlyHint: false, openWorldHint: true }
    },
    async ({ tabId, ...request }) => jsonToolResult(await writeCapabilities.startRun(tabId, request as BenchLocalAgentRunRequest))
  );

  server.registerTool(
    WRITE_CAPABILITY_DEFINITIONS.resumeRun.mcp.tool,
    {
      title: "Resume Run",
      description: "Resume a historical benchmark run. Returns immediately; poll recent events for progress.",
      inputSchema: {
        tabId: z.string(),
        runId: z.string(),
        executionMode: executionModeSchema.optional(),
        runsPerTest: z.number().optional(),
        generation: generationSchema.optional()
      },
      annotations: { readOnlyHint: false, openWorldHint: true }
    },
    async ({ tabId, runId, ...request }) => jsonToolResult(await writeCapabilities.resumeRun(tabId, runId, request as BenchLocalAgentResumeRunRequest))
  );

  server.registerTool(
    WRITE_CAPABILITY_DEFINITIONS.retryScenario.mcp.tool,
    {
      title: "Retry Scenario",
      description: "Retry one scenario/model cell from a saved run.",
      inputSchema: {
        tabId: z.string(),
        runId: z.string(),
        scenarioId: z.string(),
        modelId: z.string(),
        runsPerTest: z.number().optional(),
        generation: generationSchema.optional()
      },
      annotations: { readOnlyHint: false, openWorldHint: true }
    },
    async ({ tabId, runId, ...request }) => jsonToolResult(await writeCapabilities.retryScenario(tabId, runId, request as BenchLocalAgentRetryScenarioRequest))
  );

  server.registerTool(
    WRITE_CAPABILITY_DEFINITIONS.retryProviderErrors.mcp.tool,
    {
      title: "Retry Provider Errors",
      description: "Retry provider-error cells from a saved run.",
      inputSchema: {
        tabId: z.string(),
        runId: z.string(),
        runsPerTest: z.number().optional(),
        generation: generationSchema.optional()
      },
      annotations: { readOnlyHint: false, openWorldHint: true }
    },
    async ({ tabId, runId, ...request }) => jsonToolResult(
      await writeCapabilities.retryProviderErrors(tabId, runId, request as BenchLocalAgentRetryBatchRequest)
    )
  );

  server.registerTool(
    WRITE_CAPABILITY_DEFINITIONS.retryFailedResults.mcp.tool,
    {
      title: "Retry Failed Results",
      description: "Retry non-provider failed cells from a saved run.",
      inputSchema: {
        tabId: z.string(),
        runId: z.string(),
        runsPerTest: z.number().optional(),
        generation: generationSchema.optional()
      },
      annotations: { readOnlyHint: false, openWorldHint: true }
    },
    async ({ tabId, runId, ...request }) => jsonToolResult(
      await writeCapabilities.retryFailedResults(tabId, runId, request as BenchLocalAgentRetryBatchRequest)
    )
  );

  server.registerTool(
    WRITE_CAPABILITY_DEFINITIONS.stopRun.mcp.tool,
    {
      title: "Stop Run",
      description: "Stop the active run for a tab.",
      inputSchema: {
        tabId: z.string()
      },
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ tabId }) => jsonToolResult(await writeCapabilities.stopRun(tabId))
  );






  return server;
}
