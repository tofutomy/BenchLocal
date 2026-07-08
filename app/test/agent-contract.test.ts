import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..");

async function readProjectFile(relativePath: string): Promise<string> {
  return fs.readFile(path.join(repoRoot, relativePath), "utf8");
}

function readStringMatches(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

describe("Agent API contract", () => {
  it("keeps the documented HTTP and MCP entrypoints wired", async () => {
    const [agentServerSource, agentMcpSource] = await Promise.all([
      readProjectFile("src/main/agent-server.ts"),
      readProjectFile("src/main/agent-mcp.ts")
    ]);

    const pathnameChecks = new Set(readStringMatches(agentServerSource, /url\.pathname === "([^"]+)"/g));
    const mcpTools = new Set(readStringMatches(agentMcpSource, /"(benchlocal_[^"]+)"/g));

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
});

