// configured-pack inspection 只负责解析安装根目录和 manifest，不启动 verifier 或执行 run。
import path from "node:path";
import {
  expandHomePath,
  type BenchLocalConfig,
  type BenchLocalBenchPackConfig,
  type BenchPackInspection,
  type BenchPackManifest
} from "@benchlocal/core";
import {
  getBenchPackCompatibilityError,
  type BenchLocalRuntimeCompatibility
} from "../shared/compatibility.js";
import { pathExists } from "../shared/file-system.js";
import {
  getBenchPackBaseDir,
  getBenchPackVersionsDir,
  readBenchPackCurrentVersion
} from "../shared/storage.js";
import {
  getBenchPackManifestType,
  importFreshModule,
  isBenchPackManifest,
  normalizeBenchPackModule,
  readBenchPackManifest
} from "./manifest.js";

async function resolveInstalledBenchPackRoot(
  config: BenchLocalConfig,
  benchPackId: string
): Promise<string | undefined> {
  const baseDir = getBenchPackBaseDir(config, benchPackId);

  if (!(await pathExists(baseDir))) {
    return undefined;
  }

  const currentVersion = await readBenchPackCurrentVersion(baseDir);

  if (currentVersion) {
    const versionDir = path.join(getBenchPackVersionsDir(baseDir), currentVersion);

    if (await pathExists(versionDir)) {
      return versionDir;
    }
  }

  const legacyManifestPath = path.join(baseDir, "benchlocal.pack.json");
  if (await pathExists(legacyManifestPath)) {
    return baseDir;
  }

  return undefined;
}

export async function resolveConfiguredBenchPackRoot(
  config: BenchLocalConfig,
  benchPackId: string,
  benchPack: BenchLocalBenchPackConfig
): Promise<string | undefined> {
  if (benchPack.source === "local") {
    return benchPack.path ? expandHomePath(benchPack.path) : undefined;
  }

  if (
    benchPack.source === "registry" ||
    benchPack.source === "archive" ||
    benchPack.source === "github" ||
    benchPack.source === "git"
  ) {
    return resolveInstalledBenchPackRoot(config, benchPackId);
  }

  return undefined;
}

async function inspectBenchPack(
  benchPackId: string,
  config: BenchLocalConfig,
  benchPackConfig: BenchLocalBenchPackConfig,
  runtime?: BenchLocalRuntimeCompatibility
): Promise<BenchPackInspection> {
  const rootDir = await resolveConfiguredBenchPackRoot(config, benchPackId, benchPackConfig);

  if (!rootDir) {
    return {
      id: benchPackId,
      source: benchPackConfig.source,
      status: "not_installed",
      error: "Bench Pack root could not be resolved from config."
    };
  }

  if (!(await pathExists(rootDir))) {
    return {
      id: benchPackId,
      source: benchPackConfig.source,
      rootDir,
      status: "not_installed",
      error: "Bench Pack install directory does not exist."
    };
  }

  const manifestPath = path.join(rootDir, "benchlocal.pack.json");

  if (!(await pathExists(manifestPath))) {
    return {
      id: benchPackId,
      source: benchPackConfig.source,
      rootDir,
      status: "manifest_missing",
      error: "benchlocal.pack.json is missing."
    };
  }

  let manifest: BenchPackManifest;

  try {
    manifest = await readBenchPackManifest(rootDir);
  } catch (error) {
    return {
      id: benchPackId,
      source: benchPackConfig.source,
      rootDir,
      status: "invalid_manifest",
      error: error instanceof Error ? error.message : "Failed to parse Bench Pack manifest."
    };
  }

  const compatibilityError = getBenchPackCompatibilityError(manifest, runtime);

  if (compatibilityError) {
    return {
      id: benchPackId,
      source: benchPackConfig.source,
      rootDir,
      status: "incompatible" as BenchPackInspection["status"],
      manifest,
      error: compatibilityError
    };
  }

  if (getBenchPackManifestType(manifest) === "web") {
    return {
      id: benchPackId,
      source: benchPackConfig.source,
      rootDir,
      status: "ready",
      manifest,
      scenarioCount: 0,
      scenarios: []
    };
  }

  const entryPath = path.resolve(rootDir, manifest.entry);

  if (!(await pathExists(entryPath))) {
    return {
      id: benchPackId,
      source: benchPackConfig.source,
      rootDir,
      status: "entry_missing",
      manifest,
      error: "Bench Pack entry is missing: " + entryPath
    };
  }

  try {
    const loaded = normalizeBenchPackModule(await importFreshModule(entryPath));
    const listScenarios = loaded.listScenarios;
    const runtimeManifest = isBenchPackManifest(loaded.manifest) ? loaded.manifest : manifest;
    const runtimeCompatibilityError = getBenchPackCompatibilityError(runtimeManifest, runtime);

    if (runtimeCompatibilityError) {
      return {
        id: benchPackId,
        source: benchPackConfig.source,
        rootDir,
        status: "incompatible" as BenchPackInspection["status"],
        manifest: runtimeManifest,
        error: runtimeCompatibilityError
      };
    }

    if (typeof listScenarios !== "function") {
      return {
        id: benchPackId,
        source: benchPackConfig.source,
        rootDir,
        status: "load_error",
        manifest: runtimeManifest,
        error: "Bench Pack entry does not export a listScenarios function."
      };
    }

    const scenarios = await (listScenarios as () => Promise<BenchPackInspection["scenarios"]>)();

    return {
      id: benchPackId,
      source: benchPackConfig.source,
      rootDir,
      status: "ready",
      manifest: runtimeManifest,
      scenarioCount: scenarios?.length ?? 0,
      scenarios
    };
  } catch (error) {
    return {
      id: benchPackId,
      source: benchPackConfig.source,
      rootDir,
      status: "load_error",
      manifest,
      error: error instanceof Error ? error.message : "Failed to load bench pack entry."
    };
  }
}

export async function inspectConfiguredBenchPacks(
  config: BenchLocalConfig,
  runtime?: BenchLocalRuntimeCompatibility
): Promise<BenchPackInspection[]> {
  return Promise.all(
    Object.entries(config.benchpacks).map(async ([benchPackId, benchPackConfig]) =>
      inspectBenchPack(benchPackId, config, benchPackConfig, runtime)
    )
  );
}
