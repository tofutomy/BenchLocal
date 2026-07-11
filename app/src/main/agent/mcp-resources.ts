import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
  READ_ONLY_CAPABILITY_DEFINITIONS,
  type ReadOnlyAgentCapabilities
} from "./capabilities";
import { jsonResource, textResource } from "./mcp-content";

export type BenchLocalMcpResourceOptions = {
  getAgentGuide: () => string;
  getOpenApiDocument: () => unknown;
};

// Resources 和 prompt 只依赖只读能力，独立注册后不再耦合工具命令实现。
export function registerBenchLocalMcpResources(
  server: McpServer,
  capabilities: ReadOnlyAgentCapabilities,
  options: BenchLocalMcpResourceOptions
): void {
  server.registerResource(
    "benchlocal-agent-guide",
    "benchlocal://agent/guide",
    {
      title: "BenchLocal Agent Guide",
      description: "Agent-readable BenchLocal control instructions.",
      mimeType: "text/markdown"
    },
    async (uri) => textResource(uri.href, "text/markdown", options.getAgentGuide())
  );

  server.registerResource(
    "benchlocal-openapi",
    "benchlocal://agent/openapi",
    {
      title: "BenchLocal OpenAPI Document",
      description: "OpenAPI description for the HTTP Agent API.",
      mimeType: "application/json"
    },
    async (uri) => jsonResource(uri.href, options.getOpenApiDocument())
  );

  const resources = [
    ["benchlocal-config", READ_ONLY_CAPABILITY_DEFINITIONS.config.mcp.resource, "BenchLocal Config", "Redacted BenchLocal configuration.", capabilities.config],
    ["benchlocal-workspaces", READ_ONLY_CAPABILITY_DEFINITIONS.workspaces.mcp.resource, "BenchLocal Workspaces", "Workspace and tab state.", capabilities.workspaces],
    ["benchlocal-benchpacks", READ_ONLY_CAPABILITY_DEFINITIONS.benchPacks.mcp.resource, "BenchLocal Bench Packs", "Installed Bench Packs and scenario metadata.", capabilities.benchPacks],
    ["benchlocal-providers", READ_ONLY_CAPABILITY_DEFINITIONS.providers.mcp.resource, "BenchLocal Providers", "Configured providers with secrets redacted.", capabilities.providers],
    ["benchlocal-models", READ_ONLY_CAPABILITY_DEFINITIONS.models.mcp.resource, "BenchLocal Models", "Configured benchmark models.", capabilities.models],
    ["benchlocal-active-runs", READ_ONLY_CAPABILITY_DEFINITIONS.activeRuns.mcp.resource, "BenchLocal Active Runs", "Currently active benchmark runs.", capabilities.activeRuns],
    ["benchlocal-recent-events", READ_ONLY_CAPABILITY_DEFINITIONS.recentEvents.mcp.resource, "BenchLocal Recent Events", "Recent Agent API events for progress polling.", capabilities.recentEvents]
  ] as const;

  for (const [name, uri, title, description, load] of resources) {
    server.registerResource(
      name,
      uri,
      { title, description, mimeType: "application/json" },
      async (resourceUri) => jsonResource(resourceUri.href, await load())
    );
  }

  server.registerPrompt(
    "benchlocal-run-benchpack",
    {
      title: "Run a BenchLocal Bench Pack",
      description: "Recommended workflow for selecting a Bench Pack, selecting models, and starting a run.",
      argsSchema: {
        benchPackId: z.string().describe("Bench Pack id, for example toolcall-15."),
        modelIds: z.string().describe("Comma-separated model ids to select for the run."),
        workspaceId: z.string().optional().describe("Workspace id. If omitted, inspect benchlocal://state/workspaces first.")
      }
    },
    async ({ benchPackId, modelIds, workspaceId }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: [
            "Use BenchLocal MCP tools to run a benchmark.",
            workspaceId ? `Workspace: ${workspaceId}` : "First read benchlocal://state/workspaces and choose the active workspace.",
            `Bench Pack: ${benchPackId}`,
            `Models: ${modelIds}`,
            "Create or update a tab, select the Bench Pack, select the models, refresh availability, then call benchlocal_start_run.",
            "Poll benchlocal_get_recent_events or read benchlocal://state/events/recent while the UI shows progress in real time."
          ].join("\n")
        }
      }]
    })
  );
}
