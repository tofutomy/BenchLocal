import type { BenchPackManifest, BenchPackRegistryEntry } from "@benchlocal/core";
import { getBenchPackManifestType, isBenchPackManifest, isHttpsUrl } from "../inspect/manifest.js";

function getUrlOrigin(value: string): string {
  return new URL(value).origin;
}

/** 为未提供独立 manifest 的 Web registry 条目生成标准运行清单。 */
export function createWebBenchPackManifestFromRegistryEntry(entry: BenchPackRegistryEntry): BenchPackManifest {
  if (entry.source.type !== "web") throw new Error(`Bench Pack "${entry.id}" does not declare a web source.`);
  if (!isHttpsUrl(entry.source.entry)) throw new Error(`Web Bench Pack "${entry.id}" must use an https entry URL.`);

  return {
    schemaVersion: 1,
    protocolVersion: 1,
    type: "web",
    id: entry.id,
    name: entry.name,
    author: entry.author,
    version: entry.version,
    description: entry.description,
    entry: entry.source.entry,
    web: {
      bridgeVersion: 1,
      allowedOrigins: [getUrlOrigin(entry.source.entry)],
      permissions: [
        "models:list", "models:read", "inference:chat", "inference:stream",
        "runs:write", "history:read", "history:write", "artifacts:write"
      ],
      historyPlayback: true,
      buildId: entry.source.buildId
    },
    capabilities: {
      tools: entry.capabilities?.tools ?? true,
      multiTurn: entry.capabilities?.multiTurn ?? true,
      streamingProgress: true,
      verification: entry.capabilities?.verification ?? false
    }
  };
}

/** 获取并校验 Web Bench Pack manifest 与 registry 身份、版本的一致性。 */
export async function fetchWebBenchPackManifest(entry: BenchPackRegistryEntry): Promise<BenchPackManifest> {
  if (entry.source.type !== "web" || !entry.source.manifest) {
    return createWebBenchPackManifestFromRegistryEntry(entry);
  }
  if (!isHttpsUrl(entry.source.manifest)) throw new Error(`Web Bench Pack "${entry.id}" must use an https manifest URL.`);

  const response = await fetch(entry.source.manifest, { method: "GET", headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Failed to fetch Web Bench Pack manifest (${response.status}).`);
  const parsed = (await response.json()) as unknown;
  if (!isBenchPackManifest(parsed)) throw new Error(`Web Bench Pack "${entry.id}" returned an invalid manifest.`);
  if (getBenchPackManifestType(parsed) !== "web") throw new Error(`Web Bench Pack "${entry.id}" manifest must declare type "web".`);
  if (parsed.id !== entry.id) throw new Error(`Web Bench Pack manifest id "${parsed.id}" does not match registry id "${entry.id}".`);
  if (parsed.version !== entry.version) {
    throw new Error(`Web Bench Pack manifest version "${parsed.version}" does not match registry version "${entry.version}".`);
  }
  return parsed;
}
