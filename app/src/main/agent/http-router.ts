import type {
  BenchLocalAgentCreateTabRequest,
  BenchLocalAgentCreateModelRequest,
  BenchLocalAgentCreateProviderRequest,
  BenchLocalAgentExecutionModeRequest,
  BenchLocalAgentPatchModelRequest,
  BenchLocalAgentPatchProviderRequest,
  BenchLocalAgentPatchTabRequest,
  BenchLocalAgentResumeRunRequest,
  BenchLocalAgentRetryBatchRequest,
  BenchLocalAgentRetryScenarioRequest,
  BenchLocalAgentRunRequest,
  BenchLocalAgentRunsPerTestRequest,
  BenchLocalAgentSamplingRequest,
  BenchLocalAgentSelectBenchPackRequest,
  BenchLocalAgentSelectModelsRequest
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

// 工作区、页签和运行命令共享同一套能力注册表，避免 server 重复维护路由状态码。
export async function routeWorkspaceRunWriteAgentHttp(
  method: string | undefined,
  segments: string[],
  readCapabilities: ReadOnlyAgentCapabilities,
  writeCapabilities: WriteAgentCapabilities,
  readBody: ReadBody
): Promise<AgentHttpRouteResult | null> {
  if (method === "POST" && segments.join("/") === "models/availability/refresh") {
    const body = await readBody();
    assertOnlyKeys(body, ["modelIds"]);
    return { statusCode: 200, payload: await readCapabilities.refreshModelAvailability(body as { modelIds?: unknown }) };
  }
  if (method === "POST" && segments.length === 3 && segments[0] === "workspaces" && segments[2] === "tabs") {
    const body = await readBody();
    assertOnlyKeys(body, ["benchPackId", "title", "modelSelections"]);
    return {
      statusCode: WRITE_CAPABILITY_DEFINITIONS.createTab.http.successStatus,
      payload: await writeCapabilities.createTab(segments[1], body as BenchLocalAgentCreateTabRequest)
    };
  }
  if (segments[0] !== "tabs" || segments.length < 2) return null;
  const tabId = segments[1];

  if (method === "PATCH" && segments.length === 2) {
    const body = await readBody();
    assertOnlyKeys(body, ["title", "focusedScenarioId", "modelSelections", "samplingOverrides", "executionMode", "runsPerTest"]);
    return {
      statusCode: WRITE_CAPABILITY_DEFINITIONS.patchTab.http.successStatus,
      payload: await writeCapabilities.patchTab(tabId, body as BenchLocalAgentPatchTabRequest)
    };
  }

  const tabCommands = {
    "select-benchpack": ["selectBenchPack", ["benchPackId", "title"]],
    "select-models": ["selectModels", ["modelIds", "selections"]],
    sampling: ["setSampling", ["samplingOverrides"]],
    "execution-mode": ["setExecutionMode", ["executionMode", "runsPerTest"]],
    "runs-per-test": ["setRunsPerTest", ["runsPerTest"]]
  } as const;
  if (method === "POST" && segments.length === 3 && segments[2] in tabCommands) {
    const command = tabCommands[segments[2] as keyof typeof tabCommands];
    const body = await readBody();
    assertOnlyKeys(body, [...command[1]]);
    const handlers = {
      selectBenchPack: () => writeCapabilities.selectBenchPack(tabId, body as BenchLocalAgentSelectBenchPackRequest),
      selectModels: () => writeCapabilities.selectModels(tabId, body as BenchLocalAgentSelectModelsRequest),
      setSampling: () => writeCapabilities.setSampling(tabId, body as BenchLocalAgentSamplingRequest),
      setExecutionMode: () => writeCapabilities.setExecutionMode(tabId, body as BenchLocalAgentExecutionModeRequest),
      setRunsPerTest: () => writeCapabilities.setRunsPerTest(tabId, body as BenchLocalAgentRunsPerTestRequest)
    };
    return {
      statusCode: WRITE_CAPABILITY_DEFINITIONS[command[0]].http.successStatus,
      payload: await handlers[command[0]]()
    };
  }
  if (method === "POST" && segments.length === 5 && segments.slice(2).join("/") === "models/availability/refresh") {
    const body = await readBody();
    assertOnlyKeys(body, ["modelIds"]);
    return { statusCode: 200, payload: await readCapabilities.refreshModelAvailability({ tabId, ...(body as { modelIds?: unknown }) }) };
  }
  if (method === "POST" && segments.length === 3 && segments[2] === "runs") {
    const body = await readBody();
    assertOnlyKeys(body, ["benchPackId", "modelIds", "executionMode", "runsPerTest", "generation"]);
    return {
      statusCode: WRITE_CAPABILITY_DEFINITIONS.startRun.http.successStatus,
      payload: await writeCapabilities.startRun(tabId, body as BenchLocalAgentRunRequest)
    };
  }
  if (method === "POST" && segments.length === 4 && segments[2] === "runs" && segments[3] === "stop") {
    return { statusCode: WRITE_CAPABILITY_DEFINITIONS.stopRun.http.successStatus, payload: await writeCapabilities.stopRun(tabId) };
  }
  if (method !== "POST" || segments.length !== 5 || segments[2] !== "runs") return null;

  const runId = segments[3];
  const action = segments[4];
  if (action === "resume") {
    const body = await readBody();
    assertOnlyKeys(body, ["executionMode", "runsPerTest", "generation"]);
    return {
      statusCode: WRITE_CAPABILITY_DEFINITIONS.resumeRun.http.successStatus,
      payload: await writeCapabilities.resumeRun(tabId, runId, body as BenchLocalAgentResumeRunRequest)
    };
  }
  if (action === "retry-scenario") {
    const body = await readBody();
    assertOnlyKeys(body, ["scenarioId", "modelId", "runsPerTest", "generation"]);
    return {
      statusCode: WRITE_CAPABILITY_DEFINITIONS.retryScenario.http.successStatus,
      payload: await writeCapabilities.retryScenario(tabId, runId, body as BenchLocalAgentRetryScenarioRequest)
    };
  }
  if (action === "retry-provider-errors" || action === "retry-failed-results") {
    const body = await readBody();
    assertOnlyKeys(body, ["runsPerTest", "generation"]);
    const capabilityKey = action === "retry-provider-errors" ? "retryProviderErrors" : "retryFailedResults";
    const result = await writeCapabilities[capabilityKey](tabId, runId, body as BenchLocalAgentRetryBatchRequest);
    return {
      statusCode: result.accepted ? WRITE_CAPABILITY_DEFINITIONS[capabilityKey].http.successStatus : 200,
      payload: result
    };
  }
  return null;
}
