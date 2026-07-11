import type { ReadOnlyAgentCapabilities } from "./capabilities";

export type AgentHttpRouteResult = {
  statusCode: number;
  payload: unknown;
};

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
