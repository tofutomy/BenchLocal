// 推理端点 HTTP relay：为 Bench Pack 暴露本地 inference server，转发请求到上游 provider 并流式回传。
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { HostContext, InferenceEndpoint } from "@benchlocal/core";
import { getProviderDisplayName, normalizeBaseUrl } from "./model-availability.js";

type InferenceRoute = {
  modelId: string;
  providerId: string;
  upstreamBaseUrl: string;
  upstreamModel: string;
  upstreamAuthMode: "none" | "bearer";
  upstreamApiKey?: string;
  exposedModel: string;
};

export type InferenceRelay = {
  endpoints: InferenceEndpoint[];
  dispose(): Promise<void>;
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown inference relay error.";
}

function normalizeInferencePath(pathname: string): string {
  if (pathname === "/v1") {
    return "/";
  }

  if (pathname.startsWith("/v1/")) {
    return pathname.slice(3);
  }

  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

async function readIncomingBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks);
}

function writeJsonResponse(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
  headers?: Record<string, string>
): void {
  const body = Buffer.from(JSON.stringify(payload), "utf8");

  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(body.byteLength),
    ...headers
  });
  response.end(body);
}

function createUpstreamHeaders(request: IncomingMessage, route: InferenceRoute): Headers {
  const headers = new Headers();

  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) {
      continue;
    }

    const normalizedKey = key.toLowerCase();
    if (normalizedKey === "authorization" || normalizedKey === "content-length" || normalizedKey === "host") {
      continue;
    }

    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }

  if (route.upstreamAuthMode === "bearer" && route.upstreamApiKey) {
    headers.set("authorization", `Bearer ${route.upstreamApiKey}`);
  }

  return headers;
}

function toNodeHeaders(headers: Headers, overrides?: Record<string, string | undefined>): Record<string, string> {
  const result: Record<string, string> = {};

  headers.forEach((value, key) => {
    if (overrides && key in overrides && overrides[key] === undefined) {
      return;
    }

    result[key] = value;
  });

  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (value === undefined) {
      delete result[key];
      continue;
    }

    result[key] = value;
  }

  return result;
}

function rewriteResponseModel(payload: unknown, route: InferenceRoute): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  const record = payload as Record<string, unknown>;
  if (record.model !== route.upstreamModel) {
    return payload;
  }

  return {
    ...record,
    model: route.exposedModel
  };
}

export async function startInferenceRelay(
  providers: HostContext["providers"],
  models: HostContext["models"],
  secrets: HostContext["secrets"],
  logger: HostContext["logger"]
): Promise<InferenceRelay> {
  if (models.length === 0) {
    return {
      endpoints: [],
      async dispose() {}
    };
  }

  const providerMap = new Map(providers.map((provider) => [provider.id, provider]));
  const secretMap = new Map(secrets.map((secret) => [secret.providerId, secret]));
  const failedEndpoints: InferenceEndpoint[] = [];
  const routes: InferenceRoute[] = [];

  for (const model of models) {
    const provider = providerMap.get(model.provider);
    const providerName = getProviderDisplayName(provider, model.provider);

    if (!provider) {
      failedEndpoints.push({
        modelId: model.id,
        providerId: model.provider,
        transport: "openai_compatible",
        status: "failed",
        details: `Provider "${providerName}" was not found.`
      });
      continue;
    }

    if (!provider.enabled) {
      failedEndpoints.push({
        modelId: model.id,
        providerId: model.provider,
        transport: "openai_compatible",
        status: "failed",
        details: `Provider "${providerName}" is configured but disabled.`
      });
      continue;
    }

    const upstreamApiKey = secretMap.get(provider.id)?.value;
    if (provider.authMode === "bearer" && !upstreamApiKey) {
      failedEndpoints.push({
        modelId: model.id,
        providerId: model.provider,
        transport: "openai_compatible",
        status: "failed",
        details: `Provider "${providerName}" requires an API key, but no secret is available.`
      });
      continue;
    }

    routes.push({
      modelId: model.id,
      providerId: provider.id,
      upstreamBaseUrl: normalizeBaseUrl(provider.baseUrl),
      upstreamModel: model.model,
      upstreamAuthMode: provider.authMode,
      upstreamApiKey,
      exposedModel: model.id
    });
  }

  if (routes.length === 0) {
    return {
      endpoints: failedEndpoints,
      async dispose() {}
    };
  }

  const relayToken = `benchlocal_${randomUUID()}`;
  const routeMap = new Map(routes.map((route) => [route.exposedModel, route]));
  const runningModelPayload = routes.map((route) => ({
    id: route.exposedModel,
    object: "model",
    created: 0,
    owned_by: route.providerId
  }));

  const server = createServer(async (request, response) => {
    const requestId = randomUUID().slice(0, 8);

    try {
      const authorization = request.headers.authorization;
      const providedToken = typeof authorization === "string" ? authorization.replace(/^Bearer\s+/i, "").trim() : "";

      if (providedToken !== relayToken) {
        writeJsonResponse(
          response,
          401,
          {
            error: {
              message: "BenchLocal inference relay rejected the request.",
              type: "invalid_request_error"
            }
          },
          {
            "www-authenticate": "Bearer"
          }
        );
        return;
      }

      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      const normalizedPath = normalizeInferencePath(requestUrl.pathname);

      if (request.method === "GET" && (normalizedPath === "/models" || normalizedPath === "/")) {
        writeJsonResponse(response, 200, {
          object: "list",
          data: runningModelPayload
        });
        return;
      }

      const rawBody = await readIncomingBody(request);
      let route: InferenceRoute | undefined;
      let outboundBody = rawBody;

      if (request.method !== "GET" && request.method !== "HEAD" && request.method !== "DELETE") {
        const contentType = String(request.headers["content-type"] ?? "");
        if (!contentType.toLowerCase().includes("application/json")) {
          writeJsonResponse(response, 415, {
            error: {
              message: "BenchLocal inference relay currently supports JSON request bodies only.",
              type: "invalid_request_error"
            }
          });
          return;
        }

        let parsedBody: unknown;
        try {
          parsedBody = rawBody.length > 0 ? JSON.parse(rawBody.toString("utf8")) : {};
        } catch {
          writeJsonResponse(response, 400, {
            error: {
              message: "BenchLocal inference relay received invalid JSON.",
              type: "invalid_request_error"
            }
          });
          return;
        }

        if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
          writeJsonResponse(response, 400, {
            error: {
              message: "BenchLocal inference relay expected a JSON object request body.",
              type: "invalid_request_error"
            }
          });
          return;
        }

        const modelId = typeof (parsedBody as Record<string, unknown>).model === "string" ? String((parsedBody as Record<string, unknown>).model) : "";
        route = routeMap.get(modelId);

        if (!route) {
          writeJsonResponse(response, 404, {
            error: {
              message: `Model "${modelId || "unknown"}" is not exposed by the BenchLocal inference relay.`,
              type: "invalid_request_error"
            }
          });
          return;
        }

        outboundBody = Buffer.from(
          JSON.stringify({
            ...(parsedBody as Record<string, unknown>),
            model: route.upstreamModel
          }),
          "utf8"
        );
      } else {
        const queryModelId = requestUrl.searchParams.get("model");
        route = queryModelId ? routeMap.get(queryModelId) : routes[0];

        if (!route) {
          writeJsonResponse(response, 503, {
            error: {
              message: "No running models are currently exposed by the BenchLocal inference relay.",
              type: "server_error"
            }
          });
          return;
        }
      }

      const upstreamUrl = new URL(normalizedPath.replace(/^\//, ""), route.upstreamBaseUrl);
      upstreamUrl.search = requestUrl.search;

      const upstreamResponse = await fetch(upstreamUrl, {
        method: request.method ?? "GET",
        headers: createUpstreamHeaders(request, route),
        body: outboundBody.length > 0 ? outboundBody.toString("utf8") : undefined
      });

      const contentType = upstreamResponse.headers.get("content-type") ?? "";
      if (contentType.toLowerCase().includes("application/json")) {
        const rawText = await upstreamResponse.text();
        let responseBody = rawText;

        try {
          const parsed = JSON.parse(rawText);
          responseBody = JSON.stringify(rewriteResponseModel(parsed, route));
        } catch {
          responseBody = rawText;
        }

        response.writeHead(
          upstreamResponse.status,
          toNodeHeaders(upstreamResponse.headers, {
            "content-encoding": undefined,
            "content-length": String(Buffer.byteLength(responseBody)),
            "transfer-encoding": undefined
          })
        );
        response.end(responseBody);
        return;
      }

      response.writeHead(upstreamResponse.status, toNodeHeaders(upstreamResponse.headers));
      if (!upstreamResponse.body) {
        response.end();
        return;
      }

      await pipeline(Readable.fromWeb(upstreamResponse.body as never), response);
    } catch (error) {
      logger.error("Inference relay request failed.", {
        error: toErrorMessage(error),
        requestId
      });

      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : undefined);
        return;
      }

      writeJsonResponse(response, 502, {
        error: {
          message: "BenchLocal inference relay failed to reach the upstream provider.",
          type: "server_error",
          details: toErrorMessage(error)
        }
      });
    }
  });

  try {
    const address = await new Promise<ReturnType<typeof server.address>>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "0.0.0.0", () => resolve(server.address()));
    });

    if (!address || typeof address === "string") {
      throw new Error("BenchLocal inference relay failed to bind to a local TCP port.");
    }

    const baseUrl = `http://127.0.0.1:${address.port}/v1/`;
    const dockerBaseUrl = `http://host.docker.internal:${address.port}/v1/`;
    logger.info("Started BenchLocal inference relay.", {
      baseUrl,
      dockerBaseUrl,
      modelCount: routes.length
    });

    return {
      endpoints: [
        ...routes.map((route) => ({
          modelId: route.modelId,
          providerId: route.providerId,
          transport: "openai_compatible" as const,
          status: "running" as const,
          baseUrl,
          dockerBaseUrl,
          authMode: "bearer" as const,
          apiKey: relayToken,
          exposedModel: route.exposedModel
        })),
        ...failedEndpoints
      ],
      async dispose() {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        });
        logger.info("Stopped BenchLocal inference relay.", {
          baseUrl,
          dockerBaseUrl
        });
      }
    };
  } catch (error) {
    logger.error("Failed to start BenchLocal inference relay.", {
      error: toErrorMessage(error)
    });

    return {
      endpoints: [
        ...routes.map((route) => ({
          modelId: route.modelId,
          providerId: route.providerId,
          transport: "openai_compatible" as const,
          status: "failed" as const,
          details: `BenchLocal inference relay failed to start: ${toErrorMessage(error)}`
        })),
        ...failedEndpoints
      ],
      async dispose() {}
    };
  }
}


