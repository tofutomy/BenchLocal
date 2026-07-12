// verifier 健康探测：向 healthcheck 端点发 GET 请求，支持可取消的退避重试等待容器就绪。
import type { VerifierEndpoint } from "@benchlocal/core";
import { throwIfAborted, waitForAbortableDelay } from "../shared/abort.js";

/** 探测 verifier 健康端点；未声明 healthcheck 时沿用协议约定视为可用。 */
export async function probeVerifier(url: string, healthcheckPath?: string): Promise<VerifierEndpoint["status"]> {
  if (!healthcheckPath) return "running";

  try {
    const path = healthcheckPath.startsWith("/") ? healthcheckPath : `/${healthcheckPath}`;
    const response = await fetch(`${url}${path}`, { method: "GET" });
    return response.ok ? "running" : "stopped";
  } catch {
    return "stopped";
  }
}

/** 在启动容器后按可取消的退避周期等待 verifier 就绪。 */
export async function waitForVerifierReady(
  url: string,
  healthcheckPath?: string,
  options?: { attempts?: number; delayMs?: number; abortSignal?: AbortSignal }
): Promise<boolean> {
  const attempts = options?.attempts ?? 12;
  const delayMs = options?.delayMs ?? 500;

  for (let index = 0; index < attempts; index += 1) {
    throwIfAborted(options?.abortSignal);
    if ((await probeVerifier(url, healthcheckPath)) === "running") return true;
    await waitForAbortableDelay(delayMs, options?.abortSignal);
  }
  return false;
}
