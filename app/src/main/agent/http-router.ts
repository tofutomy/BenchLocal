import type {
  BenchLocalAgentCreateModelRequest,
  BenchLocalAgentCreateProviderRequest,
  BenchLocalAgentPatchModelRequest,
  BenchLocalAgentPatchProviderRequest
} from "@core";
import {
  WRITE_CAPABILITY_DEFINITIONS,
  type ReadOnlyAgentCapabilities,
  type createWriteAgentCapabilities
} from "./capabilities";

export type AgentHttpRouteResult = {
  statusCode: number;
  payload: unknown;
};
export class AgentHttpError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
  }
}

type WriteAgentCapabilities = ReturnType<typeof createWriteAgentCapabilities>;
type ReadBody = () => Promise<unknown>;

function assertOnlyKeys(value: unknown, allowedKeys: string[]): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AgentHttpError(400, "Expected a JSON object.");
  }

  const unknownKeys = Object.keys(value).filter((key) => !allowedKeys.includes(key));
  if (unknownKeys.length > 0) {
    throw new AgentHttpError(
      400,
      `Unknown field${unknownKeys.length === 1 ? "" : "s"}: ${unknownKeys.join(", ")}`
    );
  }
}


// 只读 HTTP 映射集中匹配，server 仅保留认证、协议写回和写命令分派。
export async function routeReadOnlyAgentHttp(
  method: string | undefined,
  segments: string[],
  capabilities: ReadOnlyAgentCapabilities
): Promise<AgentHttpRouteResult | null> {
  if (method !== "GET") return null;

  const ok = (payload: unknown): AgentHttpRouteResult => ({ statusCode: 200, payload });

  if (segments.length === 1 && segments[0] === "config") return ok(await capabilities.config());
  if (segments.length === 1 && segments[0] === "workspaces") return ok(await capabilities.workspaces());
  if (segments.length === 1 && segments[0] === "benchpacks") return ok(await capabilities.benchPacks());
  if (segments.length === 2 && segments[0] === "benchpacks" && segments[1] === "registry") {
    return ok(await capabilities.benchPackRegistry());
  }
  if (segments.length === 1 && segments[0] === "providers") return ok(await capabilities.providers());
  if (segments.length === 2 && segments[0] === "providers") return ok(await capabilities.provider(segments[1]));
  if (segments.length === 4 && segments[0] === "providers" && segments[2] === "models" && segments[3] === "discover") {
    return ok(await capabilities.discoverProviderModels(segments[1]));
  }
  if (segments.length === 1 && segments[0] === "models") return ok(await capabilities.models());
  if (segments.length === 2 && segments[0] === "models" && segments[1] === "availability") {
    return ok(await capabilities.modelAvailability());
  }
  if (segments.length === 2 && segments[0] === "models") return ok(await capabilities.model(segments[1]));
  if (segments.length === 2 && segments[0] === "runs" && segments[1] === "active") {
    return ok(await capabilities.activeRuns());
  }
  if (segments.length === 1 && segments[0] === "verifiers") return ok(await capabilities.verifiers());
  if (segments.length === 3 && segments[0] === "benchpacks" && segments[2] === "history") {
    return ok(await capabilities.runHistory(segments[1]));
  }
  if (segments.length === 4 && segments[0] === "benchpacks" && segments[2] === "history") {
    return ok(await capabilities.runSummary(segments[1], segments[3]));
  }

  return null;
}

export async function routeProviderModelWriteAgentHttp(
  method: string | undefined,
  segments: string[],
  capabilities: WriteAgentCapabilities,
  readBody: ReadBody
): Promise<AgentHttpRouteResult | null> {
  if (method === "POST" && segments.length === 1 && segments[0] === "providers") {
    const body = await readBody();
    assertOnlyKeys(body, ["id", "kind", "name", "enabled", "base_url", "api_key", "api_key_env"]);
    return {
      statusCode: WRITE_CAPABILITY_DEFINITIONS.createProvider.http.successStatus,
      payload: await capabilities.createProvider(body as BenchLocalAgentCreateProviderRequest)
    };
  }

  if (segments.length === 2 && segments[0] === "providers") {
    const providerId = segments[1];
    if (method === "PATCH") {
      const body = await readBody();
      assertOnlyKeys(body, ["kind", "name", "enabled", "base_url", "api_key", "api_key_env"]);
      return {
        statusCode: WRITE_CAPABILITY_DEFINITIONS.updateProvider.http.successStatus,
        payload: await capabilities.updateProvider(providerId, body as BenchLocalAgentPatchProviderRequest)
      };
    }
    if (method === "DELETE") {
      return {
        statusCode: WRITE_CAPABILITY_DEFINITIONS.deleteProvider.http.successStatus,
        payload: await capabilities.deleteProvider(providerId)
      };
    }
  }

  if (method === "POST" && segments.length === 3 && segments[0] === "providers" && segments[2] === "duplicate") {
    return {
      statusCode: WRITE_CAPABILITY_DEFINITIONS.duplicateProvider.http.successStatus,
      payload: await capabilities.duplicateProvider(segments[1])
    };
  }

  if (method === "POST" && segments.length === 1 && segments[0] === "models") {
    const body = await readBody();
    assertOnlyKeys(body, ["id", "provider", "model", "label", "group", "enabled"]);
    return {
      statusCode: WRITE_CAPABILITY_DEFINITIONS.createModel.http.successStatus,
      payload: await capabilities.createModel(body as BenchLocalAgentCreateModelRequest)
    };
  }

  if (segments.length === 2 && segments[0] === "models") {
    const modelId = segments[1];
    if (method === "PATCH") {
      const body = await readBody();
      assertOnlyKeys(body, ["id", "provider", "model", "label", "group", "enabled"]);
      return {
        statusCode: WRITE_CAPABILITY_DEFINITIONS.updateModel.http.successStatus,
        payload: await capabilities.updateModel(modelId, body as BenchLocalAgentPatchModelRequest)
      };
    }
    if (method === "DELETE") {
      return {
        statusCode: WRITE_CAPABILITY_DEFINITIONS.deleteModel.http.successStatus,
        payload: await capabilities.deleteModel(modelId)
      };
    }
  }

  if (method === "POST" && segments.length === 3 && segments[0] === "models" && segments[2] === "duplicate") {
    return {
      statusCode: WRITE_CAPABILITY_DEFINITIONS.duplicateModel.http.successStatus,
      payload: await capabilities.duplicateModel(segments[1])
    };
  }

  return null;
}
