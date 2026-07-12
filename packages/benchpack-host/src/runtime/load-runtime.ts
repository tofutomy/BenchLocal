// Bench Pack 动态加载：解析安装路径、校验 manifest 兼容性、import entrypoint 并 normalize runtime surface。
import path from "node:path";
import type { BenchLocalConfig, BenchPackManifest, BenchPackRuntime } from "@benchlocal/core";
import { resolveConfiguredBenchPackRoot } from "../inspect/configured-packs.js";
import {
  getBenchPackManifestType,
  importFreshModule,
  isBenchPackManifest,
  normalizeBenchPackModule,
  readBenchPackManifest
} from "../inspect/manifest.js";
import { getBenchPackCompatibilityError, type BenchLocalRuntimeCompatibility } from "../shared/compatibility.js";
import { pathExists } from "../shared/file-system.js";

export type LoadedBenchPackRuntime = BenchPackRuntime;

function normalizeLoadedBenchPack(module: Record<string, unknown>): LoadedBenchPackRuntime {
  const normalized = normalizeBenchPackModule(module) as Record<string, unknown>;
  if (
    typeof normalized.listScenarios !== "function" ||
    typeof normalized.prepare !== "function" ||
    typeof normalized.scoreModelResults !== "function" ||
    !normalized.manifest
  ) {
    throw new Error("Bench Pack entry does not implement the BenchLocal runtime surface.");
  }
  return normalized as unknown as LoadedBenchPackRuntime;
}

/** 加载已配置的 Node Bench Pack，并在执行场景前完成路径、manifest 与兼容性校验。 */
export async function loadConfiguredBenchPack(
  config: BenchLocalConfig,
  benchPackId: string,
  runtime?: BenchLocalRuntimeCompatibility
): Promise<{ rootDir: string; manifest: BenchPackManifest; benchPack: LoadedBenchPackRuntime }> {
  const benchPackConfig = config.benchpacks[benchPackId];
  if (!benchPackConfig) throw new Error(`Unknown Bench Pack "${benchPackId}" in BenchLocal config.`);

  const rootDir = await resolveConfiguredBenchPackRoot(config, benchPackId, benchPackConfig);
  if (!rootDir || !(await pathExists(rootDir))) {
    throw new Error(`Bench Pack "${benchPackId}" is not installed at a resolvable path.`);
  }

  const manifest = await readBenchPackManifest(rootDir);
  const compatibilityError = getBenchPackCompatibilityError(manifest, runtime);
  if (compatibilityError) throw new Error(compatibilityError);
  if (getBenchPackManifestType(manifest) === "web") {
    throw new Error(`Web Bench Pack "${benchPackId}" must be opened in the interactive web surface.`);
  }

  const entryPath = path.resolve(rootDir, manifest.entry);
  if (!(await pathExists(entryPath))) throw new Error(`Bench Pack entry is missing: ${entryPath}`);

  const imported = await importFreshModule(entryPath);
  const benchPack = normalizeLoadedBenchPack(imported);
  const runtimeManifest = isBenchPackManifest(benchPack.manifest) ? benchPack.manifest : manifest;
  const runtimeCompatibilityError = getBenchPackCompatibilityError(runtimeManifest, runtime);
  if (runtimeCompatibilityError) throw new Error(runtimeCompatibilityError);

  return { rootDir, manifest: runtimeManifest, benchPack };
}
