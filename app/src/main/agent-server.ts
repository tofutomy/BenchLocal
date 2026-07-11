import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import type {
  BenchLocalAgentAccess,
  BenchLocalAgentAccessState,
  BenchLocalAgentEvent
} from "@core";
import { getBenchLocalHome, loadOrCreateConfig } from "@core";
import { benchLocalController, type BenchLocalController } from "./controller";
import { handleBenchLocalMcpRequest } from "./agent-mcp";
import {
  CapabilityNotFoundError,
  CapabilityValidationError,
  createReadOnlyAgentCapabilities,
  createWriteAgentCapabilities
} from "./agent/capabilities";

import { createAgentGuide } from "./agent/guide";
import {
  AgentHttpError,
  routeProviderModelWriteAgentHttp,
  routeReadOnlyAgentHttp,
  routeWorkspaceRunWriteAgentHttp
} from "./agent/http-router";
import { createOpenApiDocument } from "./agent/openapi";
type AgentSession = {
  token: string;
  createdAt: string;
};

type ConfigureAgentAccessInput = {
  enabled: boolean;
  access?: BenchLocalAgentAccess;
  port?: number;
};

const DEFAULT_AGENT_ACCESS = "localhost" as const;
const AGENT_SESSION_PATH = path.join(getBenchLocalHome(), "agent-session.json");
const MAX_JSON_BODY_BYTES = 1024 * 1024;
const MAX_RECENT_AGENT_EVENTS = 500;

function createToken(): string {
  return randomBytes(32).toString("base64url");
}

function normalizePort(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new HttpError(400, "Port must be an integer from 0 to 65535.");
  }

  return port === 0 ? undefined : port;
}

function normalizeAccess(value: unknown): BenchLocalAgentAccess | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (value === "localhost" || value === "local_network") {
    return value;
  }

  throw new HttpError(400, "Access must be either localhost or local_network.");
}

function getAgentHost(access: BenchLocalAgentAccess): "127.0.0.1" | "0.0.0.0" {
  return access === "local_network" ? "0.0.0.0" : "127.0.0.1";
}

function getAgentLocalClientHost(): "127.0.0.1" {
  return "127.0.0.1";
}

function isAllowedLocalOrigin(value: string | undefined): boolean {
  if (!value) {
    return true;
  }

  try {
    const origin = new URL(value);
    const hostname = origin.hostname.toLowerCase();
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendText(response: ServerResponse, statusCode: number, contentType: string, payload: string): void {
  response.writeHead(statusCode, {
    "content-type": `${contentType}; charset=utf-8`,
    "cache-control": "no-store"
  });
  response.end(payload);
}

function sendError(response: ServerResponse, error: unknown): void {
  const statusCode = error instanceof HttpError || error instanceof AgentHttpError || error instanceof CapabilityNotFoundError || error instanceof CapabilityValidationError ? error.statusCode : 500;
  const message = error instanceof Error ? error.message : "Internal server error.";

  sendJson(response, statusCode, {
    error: {
      message,
      statusCode
    }
  });
}

function decodePathSegments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
}

async function readJsonRequest(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;

    if (size > MAX_JSON_BODY_BYTES) {
      throw new HttpError(413, "JSON body is too large.");
    }

    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid JSON body.");
  }
}

class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}

class BenchLocalAgentServer {
  private server: Server | null = null;
  private session: AgentSession | null = null;
  private connectedClients = new Set<ServerResponse>();
  private recentEvents: BenchLocalAgentEvent[] = [];
  private enabled = false;
  private access: BenchLocalAgentAccess = DEFAULT_AGENT_ACCESS;
  private configuredPort: number | undefined;
  private port: number | undefined;
  private message: string | undefined;
  private startedAt: string | undefined;

  constructor(private readonly controller: BenchLocalController) {
    this.controller.onAgentEvent((event) => {
      this.recentEvents.push(event);

      if (this.recentEvents.length > MAX_RECENT_AGENT_EVENTS) {
        this.recentEvents.splice(0, this.recentEvents.length - MAX_RECENT_AGENT_EVENTS);
      }

      this.broadcastSse(event.type, event.eventId, event);
    });
  }

  async initialize(): Promise<BenchLocalAgentAccessState> {
    const { config } = await loadOrCreateConfig();
    const envEnabled = process.env.BENCHLOCAL_AGENT_API === "1";
    const envPort = normalizePort(process.env.BENCHLOCAL_AGENT_PORT);
    const envAccess = normalizeAccess(process.env.BENCHLOCAL_AGENT_ACCESS);
    this.enabled = envEnabled || config.agent?.enabled === true;
    this.access = envAccess ?? config.agent?.access ?? DEFAULT_AGENT_ACCESS;
    this.configuredPort = envPort ?? config.agent?.port;

    if (this.enabled) {
      await this.start();
    } else {
      await this.ensureSession();
    }

    return this.getState();
  }

  getState(options?: { includeToken?: boolean }): BenchLocalAgentAccessState {
    const token = options?.includeToken === false ? undefined : this.session?.token;

    return {
      enabled: this.enabled,
      running: Boolean(this.server),
      access: this.access,
      host: getAgentHost(this.access),
      configuredPort: this.configuredPort,
      port: this.port,
      baseUrl: this.port ? `http://${getAgentLocalClientHost()}:${this.port}` : undefined,
      token,
      connectedClients: this.connectedClients.size,
      message: this.message,
      startedAt: this.startedAt
    };
  }

  async configure(input: ConfigureAgentAccessInput): Promise<BenchLocalAgentAccessState> {
    this.enabled = input.enabled;
    this.access = input.access ?? this.access ?? DEFAULT_AGENT_ACCESS;
    this.configuredPort = input.port;

    const { config } = await loadOrCreateConfig();
    await this.controller.saveConfig({
      ...config,
      agent: {
        enabled: input.enabled,
        access: this.access,
        ...(input.port ? { port: input.port } : {})
      }
    });

    if (this.enabled) {
      await this.restart();
    } else {
      await this.stop();
    }

    this.emitState();
    return this.getState();
  }

  async regenerateToken(): Promise<BenchLocalAgentAccessState> {
    this.session = {
      token: createToken(),
      createdAt: new Date().toISOString()
    };
    await this.saveSession();
    this.emitState();
    return this.getState();
  }

  async stop(): Promise<BenchLocalAgentAccessState> {
    for (const client of this.connectedClients) {
      client.end();
    }
    this.connectedClients.clear();

    const server = this.server;
    this.server = null;
    this.port = undefined;
    this.startedAt = undefined;

    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }

    this.message = this.enabled ? "Agent API is stopped." : "Agent API is disabled.";
    this.emitState();
    return this.getState();
  }

  private async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  private async start(): Promise<void> {
    await this.ensureSession();

    if (this.server) {
      return;
    }

    const server = createServer((request, response) => {
      void this.handleRequest(request, response).catch((error) => {
        sendError(response, error);
      });
    });

    const requestedPort = this.configuredPort ?? 0;
    const host = getAgentHost(this.access);

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(requestedPort, host, () => {
        server.off("error", reject);
        resolve();
      });
    });

    const address = server.address();

    if (!address || typeof address === "string") {
      server.close();
      throw new Error("Failed to resolve local agent API address.");
    }

    this.server = server;
    this.port = address.port;
    this.startedAt = new Date().toISOString();
    this.message = `Agent API is listening on http://${host}:${this.port}.`;
    this.emitState();
  }

  private async ensureSession(): Promise<AgentSession> {
    if (this.session) {
      return this.session;
    }

    try {
      const raw = await fs.readFile(AGENT_SESSION_PATH, "utf8");
      const parsed = JSON.parse(raw) as Partial<AgentSession>;

      if (typeof parsed.token === "string" && parsed.token.trim()) {
        this.session = {
          token: parsed.token,
          createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : new Date().toISOString()
        };
        return this.session;
      }
    } catch {
      // Create a fresh token below.
    }

    this.session = {
      token: createToken(),
      createdAt: new Date().toISOString()
    };
    await this.saveSession();
    return this.session;
  }

  private async saveSession(): Promise<void> {
    if (!this.session) {
      return;
    }

    await fs.mkdir(path.dirname(AGENT_SESSION_PATH), { recursive: true });
    const tempPath = `${AGENT_SESSION_PATH}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(this.session, null, 2), { encoding: "utf8", mode: 0o600 });
    await fs.rename(tempPath, AGENT_SESSION_PATH);
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", `http://${getAgentHost(this.access)}`);
    const segments = decodePathSegments(url.pathname);

    if (request.method === "GET" && url.pathname === "/v1/health") {
      const metadata = await this.controller.getRuntimeCompatibility();
      sendJson(response, 200, {
        ok: true,
        benchLocalVersion: metadata.benchLocalVersion,
        agent: this.getState({ includeToken: false }),
        docs: {
          agentGuide: "/v1/agent-guide",
          openapi: "/v1/openapi.json",
          mcp: "/mcp"
        }
      });
      return;
    }

    await this.requireAuth(request);

    if (url.pathname === "/mcp" || url.pathname === "/v1/mcp") {
      this.requireLocalOrigin(request);
      await handleBenchLocalMcpRequest(this.controller, {
        getAgentGuide: () => createAgentGuide(this.port),
        getOpenApiDocument: () => createOpenApiDocument(this.port),
        getRecentEvents: () => [...this.recentEvents]
      }, request, response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/events") {
      this.openSse(response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/agent-guide") {
      sendText(response, 200, "text/markdown", createAgentGuide(this.port));
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/openapi.json") {
      sendJson(response, 200, createOpenApiDocument(this.port));
      return;
    }

    if (segments[0] !== "v1") {
      throw new HttpError(404, "Unknown endpoint.");
    }

    await this.routeV1(request, response, segments.slice(1));
  }

  private async requireAuth(request: IncomingMessage): Promise<void> {
    const session = await this.ensureSession();
    const authorization = request.headers.authorization ?? "";
    const expected = `Bearer ${session.token}`;

    if (authorization !== expected) {
      throw new HttpError(401, "Unauthorized.");
    }
  }

  private requireLocalOrigin(request: IncomingMessage): void {
    if (!isAllowedLocalOrigin(request.headers.origin)) {
      throw new HttpError(403, "MCP requests must use a localhost Origin header or omit Origin.");
    }
  }

  private openSse(response: ServerResponse): void {
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
      "x-accel-buffering": "no"
    });
    response.write(": BenchLocal agent event stream\n\n");
    this.connectedClients.add(response);
    this.emitState();

    response.on("close", () => {
      this.connectedClients.delete(response);
      this.emitState();
    });
  }

  private broadcastSse(eventName: string, eventId: string, payload: unknown): void {
    const data = JSON.stringify(payload);

    for (const client of this.connectedClients) {
      client.write(`id: ${eventId}\n`);
      client.write(`event: ${eventName}\n`);
      client.write(`data: ${data}\n\n`);
    }
  }

  private emitState(): void {
    this.controller.emitAgentEvent("agent.state.updated", this.getState({ includeToken: false }));
  }


  private createReadOnlyCapabilities() {
    return createReadOnlyAgentCapabilities(this.controller, () => [...this.recentEvents]);
  }

  private createWriteCapabilities() {
    return createWriteAgentCapabilities(this.controller, {
      onBackgroundError: (operation, error) => {
        const label = operation === "retryBatch" ? "retry batch" : operation;
        console.error(`[benchlocal] agent-started ${label} failed`, error);
      }
    });
  }

  private async routeV1(request: IncomingMessage, response: ServerResponse, segments: string[]): Promise<void> {
    const readCapabilities = this.createReadOnlyCapabilities();
    const writeCapabilities = this.createWriteCapabilities();
    const route = await routeReadOnlyAgentHttp(request.method, segments, readCapabilities)
      ?? await routeProviderModelWriteAgentHttp(
        request.method,
        segments,
        writeCapabilities,
        () => readJsonRequest(request)
      )
      ?? await routeWorkspaceRunWriteAgentHttp(
        request.method, segments, readCapabilities, writeCapabilities, () => readJsonRequest(request)
      );
    if (!route) throw new HttpError(404, "Unknown endpoint.");
    sendJson(response, route.statusCode, route.payload);
  }
}

export const agentServer = new BenchLocalAgentServer(benchLocalController);
