import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { BenchLocalController } from "../controller";
import {
  READ_ONLY_CAPABILITY_DEFINITIONS,
  type ReadOnlyAgentCapabilities
} from "./capabilities";
import { jsonToolResult } from "./mcp-content";

// 只读工具集中注册，输入 schema 和 capability handler 保持一一对应。
export function registerBenchLocalMcpReadTools(
  server: McpServer,
  controller: BenchLocalController,
  capabilities: ReadOnlyAgentCapabilities
): void {
  server.registerTool(
    "benchlocal_get_health",
    {
      title: "Get BenchLocal Health",
      description: "Return BenchLocal version metadata.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => jsonToolResult({ ok: true, ...(await controller.getRuntimeCompatibility()) })
  );

  server.registerTool(
    READ_ONLY_CAPABILITY_DEFINITIONS.config.mcp.tool,
    {
      title: "Get Redacted Config",
      description: "Return BenchLocal config with provider secrets redacted.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => jsonToolResult(await capabilities.config())
  );

  server.registerTool(
    READ_ONLY_CAPABILITY_DEFINITIONS.workspaces.mcp.tool,
    {
      title: "List Workspaces",
      description: "Return workspace and tab state.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => jsonToolResult(await capabilities.workspaces())
  );

  server.registerTool(
    READ_ONLY_CAPABILITY_DEFINITIONS.benchPacks.mcp.tool,
    {
      title: "List Bench Packs",
      description: "Return installed Bench Packs and scenario metadata.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => jsonToolResult(await capabilities.benchPacks())
  );

  server.registerTool(
    READ_ONLY_CAPABILITY_DEFINITIONS.benchPackRegistry.mcp.tool,
    {
      title: "List Bench Pack Registry",
      description: "Return registry entries for installable Bench Packs.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => jsonToolResult(await capabilities.benchPackRegistry())
  );

  server.registerTool(
    READ_ONLY_CAPABILITY_DEFINITIONS.providers.mcp.tool,
    {
      title: "List Providers",
      description: "Return configured providers with secrets redacted.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => jsonToolResult(await capabilities.providers())
  );

  server.registerTool(
    READ_ONLY_CAPABILITY_DEFINITIONS.provider.mcp.tool,
    {
      title: "Get Provider",
      description: "Return one configured provider with secrets redacted.",
      inputSchema: {
        providerId: z.string()
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ providerId }) => jsonToolResult(await capabilities.provider(providerId))
  );

  server.registerTool(
    READ_ONLY_CAPABILITY_DEFINITIONS.discoverProviderModels.mcp.tool,
    {
      title: "Discover Provider Models",
      description: "Discover provider models when the provider supports model browsing.",
      inputSchema: {
        providerId: z.string()
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ providerId }) => jsonToolResult(await capabilities.discoverProviderModels(providerId))
  );

  server.registerTool(
    READ_ONLY_CAPABILITY_DEFINITIONS.models.mcp.tool,
    {
      title: "List Models",
      description: "Return configured benchmark models.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => jsonToolResult(await capabilities.models())
  );

  server.registerTool(
    READ_ONLY_CAPABILITY_DEFINITIONS.model.mcp.tool,
    {
      title: "Get Model",
      description: "Return one configured benchmark model.",
      inputSchema: {
        modelId: z.string()
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ modelId }) => jsonToolResult(await capabilities.model(modelId))
  );

  server.registerTool(
    READ_ONLY_CAPABILITY_DEFINITIONS.modelAvailability.mcp.tool,
    {
      title: "Check Model Availability",
      description: "Check availability for all models or selected model ids.",
      inputSchema: {
        modelIds: z.array(z.string()).optional()
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ modelIds }) => jsonToolResult(await capabilities.modelAvailability(modelIds))
  );

  server.registerTool(
    READ_ONLY_CAPABILITY_DEFINITIONS.refreshModelAvailability.mcp.tool,
    {
      title: "Refresh Model Availability",
      description: "Refresh model availability globally or for a tab's selected models.",
      inputSchema: {
        tabId: z.string().optional(),
        modelIds: z.array(z.string()).optional()
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ tabId, modelIds }) => jsonToolResult(await capabilities.refreshModelAvailability({ tabId, modelIds }))
  );

  server.registerTool(
    READ_ONLY_CAPABILITY_DEFINITIONS.activeRuns.mcp.tool,
    {
      title: "List Active Runs",
      description: "Return active benchmark runs.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => jsonToolResult(await capabilities.activeRuns())
  );

  server.registerTool(
    READ_ONLY_CAPABILITY_DEFINITIONS.runHistory.mcp.tool,
    {
      title: "List Run History",
      description: "Return run history for a Bench Pack.",
      inputSchema: {
        benchPackId: z.string()
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ benchPackId }) => jsonToolResult(await capabilities.runHistory(benchPackId))
  );

  server.registerTool(
    READ_ONLY_CAPABILITY_DEFINITIONS.runSummary.mcp.tool,
    {
      title: "Get Run Summary",
      description: "Return a saved run summary.",
      inputSchema: {
        benchPackId: z.string(),
        runId: z.string()
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ benchPackId, runId }) => jsonToolResult(await capabilities.runSummary(benchPackId, runId))
  );

  server.registerTool(
    READ_ONLY_CAPABILITY_DEFINITIONS.verifiers.mcp.tool,
    {
      title: "List Verifiers",
      description: "Return verifier runtime status.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => jsonToolResult(await capabilities.verifiers())
  );

  server.registerTool(
    READ_ONLY_CAPABILITY_DEFINITIONS.recentEvents.mcp.tool,
    {
      title: "Get Recent Events",
      description: "Return recent Agent API events for polling run progress.",
      inputSchema: {
        limit: z.number().optional()
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ limit }) => jsonToolResult(await capabilities.recentEvents(limit))
  );

}
