import type { BenchLocalConfig, BenchPackRegistryEntry } from "@benchlocal/core";
import { isBenchPackRegistry } from "./registry-schema.js";

export async function loadBenchPackRegistry(config: BenchLocalConfig): Promise<BenchPackRegistryEntry[]> {
  const response = await fetch(config.registry.official_url, {
    method: "GET",
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error("Failed to fetch Bench Pack registry (" + response.status + ").");
  }

  const parsed = (await response.json()) as unknown;

  if (!isBenchPackRegistry(parsed)) {
    throw new Error("Bench Pack registry payload is invalid.");
  }

  // Registry 顺序固定按名称排序，保证 renderer 和 Agent 看到的列表稳定。
  return parsed.packs.slice().sort((left, right) => left.name.localeCompare(right.name));
}
