// Registry payload 的运行时校验集中在这里，避免 transport 和安装流程重复解析。
import type { BenchPackRegistry, BenchPackRegistryEntry } from "@benchlocal/core";

export function isBenchPackRegistryEntry(value: unknown): value is BenchPackRegistryEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const source = candidate.source as Record<string, unknown> | undefined;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.version === "string" &&
    typeof source === "object" &&
    source !== null &&
    ((source.type === "github" && typeof source.repo === "string" && typeof source.tag === "string") ||
      (source.type === "archive" && typeof source.url === "string") ||
      (source.type === "web" &&
        typeof source.entry === "string" &&
        (source.manifest === undefined || typeof source.manifest === "string") &&
        (source.integrity === undefined || typeof source.integrity === "string") &&
        (source.buildId === undefined || typeof source.buildId === "string")))
  );
}

export function isBenchPackRegistry(value: unknown): value is BenchPackRegistry {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return candidate.schemaVersion === 1 && Array.isArray(candidate.packs) && candidate.packs.every(isBenchPackRegistryEntry);
}
