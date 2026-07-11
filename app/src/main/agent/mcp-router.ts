import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BenchLocalAgentEvent } from "@core";
import type { BenchLocalController } from "../controller";
import { createReadOnlyAgentCapabilities, createWriteAgentCapabilities } from "./capabilities";
import { registerBenchLocalMcpReadTools } from "./mcp-read-tools";
import { registerBenchLocalMcpResources } from "./mcp-resources";
import { registerBenchLocalMcpWriteTools } from "./mcp-write-tools";

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
  registerBenchLocalMcpWriteTools(server, writeCapabilities);
  return server;
}
