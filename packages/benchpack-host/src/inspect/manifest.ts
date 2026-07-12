// Manifest 与 Web bridge 校验保持纯函数，供 inspection、install 和 runtime 共同复用。
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type {
  BenchPackManifest,
  WebBenchPackBridgePermission,
  WebBenchPackManifestConfig
} from "@benchlocal/core";
import { isBenchPackCompatibilityRequirements } from "../shared/compatibility.js";

export function getBenchPackManifestType(manifest: BenchPackManifest): "table" | "web" {
  return manifest.type ?? "table";
}

export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isAllowedWebPackUrl(value: string): boolean {
  try {
    const url = new URL(value);

    if (url.protocol === "https:") {
      return true;
    }

    return (
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1")
    );
  } catch {
    return false;
  }
}

function isWebBenchPackBridgePermission(value: unknown): value is WebBenchPackBridgePermission {
  return (
    value === "models:list" ||
    value === "models:read" ||
    value === "inference:chat" ||
    value === "inference:stream" ||
    value === "runs:write" ||
    value === "history:read" ||
    value === "history:write" ||
    value === "artifacts:write"
  );
}

function isWebBenchPackManifestConfig(value: unknown): value is WebBenchPackManifestConfig {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    candidate.bridgeVersion === 1 &&
    Array.isArray(candidate.allowedOrigins) &&
    candidate.allowedOrigins.every((origin) => typeof origin === "string" && isAllowedWebPackUrl(origin)) &&
    Array.isArray(candidate.permissions) &&
    candidate.permissions.every(isWebBenchPackBridgePermission) &&
    (candidate.historyPlayback === undefined || typeof candidate.historyPlayback === "boolean") &&
    (candidate.buildId === undefined || typeof candidate.buildId === "string") &&
    (candidate.manifestHash === undefined || typeof candidate.manifestHash === "string")
  );
}

export function isBenchPackManifest(value: unknown): value is BenchPackManifest {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const manifestType = candidate.type ?? "table";
  return (
    candidate.schemaVersion === 1 &&
    candidate.protocolVersion === 1 &&
    (manifestType === "table" || manifestType === "web") &&
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.version === "string" &&
    typeof candidate.entry === "string" &&
    (manifestType !== "web" || (isAllowedWebPackUrl(candidate.entry) && isWebBenchPackManifestConfig(candidate.web))) &&
    (candidate.requirements === undefined || isBenchPackCompatibilityRequirements(candidate.requirements)) &&
    typeof candidate.capabilities === "object" &&
    candidate.capabilities !== null &&
    ("verification" in (candidate.capabilities as Record<string, unknown>) ||
      "sidecars" in (candidate.capabilities as Record<string, unknown>))
  );
}

export async function readBenchPackManifest(rootDir: string): Promise<BenchPackManifest> {
  const manifestPath = path.join(rootDir, "benchlocal.pack.json");
  const raw = await fs.readFile(manifestPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  if (!isBenchPackManifest(parsed)) {
    throw new Error("Invalid benchlocal.pack.json manifest.");
  }

  return parsed;
}

export function normalizeBenchPackModule(module: Record<string, unknown>): Record<string, unknown> {
  let current: Record<string, unknown> = module;

  while (
    current.default &&
    typeof current.default === "object" &&
    current.default !== null &&
    typeof current.listScenarios !== "function"
  ) {
    current = current.default as Record<string, unknown>;
  }

  return current;
}

export async function importFreshModule(entryPath: string): Promise<Record<string, unknown>> {
  const stats = await fs.stat(entryPath);
  const url = pathToFileURL(entryPath);
  url.searchParams.set("mtime", String(stats.mtimeMs));
  return (await import(url.href)) as Record<string, unknown>;
}
