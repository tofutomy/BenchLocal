import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { BenchLocalController } from "./controller";
import {
  createBenchLocalMcpServer,
  type BenchLocalMcpOptions
} from "./agent/mcp-router";

function sendMcpMethodNotAllowed(response: ServerResponse): void {
  response.writeHead(405, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed."
    },
    id: null
  }));
}

// HTTP 入口只管理 MCP transport 生命周期，工具和资源注册集中在 mcp-router。
export async function handleBenchLocalMcpRequest(
  controller: BenchLocalController,
  options: BenchLocalMcpOptions,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  if (request.method !== "POST") {
    sendMcpMethodNotAllowed(response);
    return;
  }

  const server = createBenchLocalMcpServer(controller, options);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  });
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    void transport.close();
    void server.close();
  };

  response.on("close", close);

  try {
    await server.connect(transport);
    await transport.handleRequest(request, response);
  } finally {
    close();
  }
}
