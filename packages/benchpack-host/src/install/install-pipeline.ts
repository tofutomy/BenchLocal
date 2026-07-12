import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type {
  BenchLocalConfig,
  BenchLocalBenchPackConfig,
  BenchPackManifest,
  BenchPackRegistryEntry
} from "@benchlocal/core";
import { expandHomePath, getConfigPath, saveConfigFile } from "@benchlocal/core";
import {
  reportInstallProgress,
  type BenchPackInstallAction,
  type BenchPackInstallProgress,
  type InstallProgressReporter
} from "../install-progress.js";
import {
  bootstrapVerifierConfig,
  getManifestVerifiers
} from "../verifier-config.js";
import { loadBenchPackRegistry } from "../registry/load-registry.js";
import {
  getBenchPackCompatibilityError,
  type BenchLocalRuntimeCompatibility
} from "../shared/compatibility.js";
import { pathExists } from "../shared/file-system.js";
import {
  cleanupBenchPackStaging,
  getBenchPackBaseDir,
  getBenchPackVersionsDir,
  removeBenchPackCurrentVersion,
  sanitizeBenchPackVersion,
  writeBenchPackCurrentVersion
} from "../shared/storage.js";
import {
  getBenchPackManifestType,
  isAllowedWebPackUrl,
  isBenchPackManifest,
  isHttpsUrl,
  readBenchPackManifest
} from "../inspect/manifest.js";
import { fetchWebBenchPackManifest } from "./manifest-validation.js";
import { hydrateBenchLocalRuntimeDependencies } from "./runtime-hydration.js";
import {
  commitStagedBenchPackInstall,
  stageBenchPackArchiveInstall,
  stageWebBenchPackManifestUrlInstall,
  stageWebBenchPackRegistryInstall
} from "./artifact-staging.js";

export type { BenchPackInstallProgress };

const execFileAsync = promisify(execFile);

function getGitHubArchiveUrl(repo: string, tag: string): string {
  return "https://codeload.github.com/" + repo + "/tar.gz/refs/tags/" + tag;
}

async function runTarCommand(args: string[], options?: { cwd?: string }): Promise<string> {
  const { stdout } = await execFileAsync("tar", args, {
    cwd: options?.cwd,
    maxBuffer: 8 * 1024 * 1024
  });

  return stdout.trim();
}

function bootstrapBenchPackConfigFromManifest(
  manifest: BenchPackManifest,
  entry: BenchPackRegistryEntry,
  existing?: BenchLocalBenchPackConfig
): BenchLocalBenchPackConfig {
  const verifierSpecs = getManifestVerifiers(manifest);
  const verifiers =
    verifierSpecs.length > 0
      ? Object.fromEntries(
          verifierSpecs.map((spec) => [
            spec.id,
            bootstrapVerifierConfig(spec, existing?.verifiers?.[spec.id] ?? existing?.sidecars?.[spec.id])
          ])
        )
      : undefined;

  return {
    enabled: existing?.enabled ?? true,
    source: "registry",
    repo: entry.source.type === "github" ? entry.source.repo : undefined,
    ref: entry.source.type === "github" ? entry.source.tag : undefined,
    version: entry.version,
    auto_update: existing?.auto_update,
    verifiers
  };
}

// 安装模块保留 staging -> validation -> activation 的顺序，避免结构迁移改变文件系统副作用。
export async function installBenchPackFromRegistry(
  config: BenchLocalConfig,
  benchPackId: string,
  reporter?: InstallProgressReporter,
  runtime?: BenchLocalRuntimeCompatibility
): Promise<BenchLocalConfig> {
  await reportInstallProgress(reporter, {
    benchPackId,
    action: "install",
    phase: "resolving",
    message: "Resolving Bench Pack from registry."
  });
  const registry = await loadBenchPackRegistry(config);
  const entry = registry.find((candidate) => candidate.id === benchPackId);

  if (!entry) {
    throw new Error(`Bench Pack "${benchPackId}" was not found in the official registry.`);
  }

  const baseDir = getBenchPackBaseDir(config, benchPackId);
  const staged = entry.source.type === "web"
    ? await stageWebBenchPackRegistryInstall(entry, reporter, "install", runtime)
    : await stageBenchPackArchiveInstall(
        entry.version,
        entry.source.type === "github" ? getGitHubArchiveUrl(entry.source.repo, entry.source.tag) : entry.source.url,
        reporter,
        "install",
        benchPackId,
        runtime
      );
  const rootDir = await commitStagedBenchPackInstall(config, benchPackId, entry.version, staged.stagedDir, staged.stagingRoot);
  const manifest = staged.manifest;
  await reportInstallProgress(reporter, {
    benchPackId,
    action: "install",
    phase: "activating",
    message: "Activating Bench Pack."
  });
  await writeBenchPackCurrentVersion(baseDir, path.basename(rootDir));
  const nextConfig: BenchLocalConfig = structuredClone(config);
  const existing = nextConfig.benchpacks[benchPackId];
  nextConfig.benchpacks[benchPackId] = bootstrapBenchPackConfigFromManifest(manifest, entry, existing);

  if (!nextConfig.default_benchpack) {
    nextConfig.default_benchpack = benchPackId;
  }

  await saveConfigFile(nextConfig, getConfigPath());
  await reportInstallProgress(reporter, {
    benchPackId,
    action: "install",
    phase: "complete",
    message: "Bench Pack installed."
  });
  return nextConfig;
}

export async function updateBenchPackFromRegistry(
  config: BenchLocalConfig,
  benchPackId: string,
  reporter?: InstallProgressReporter,
  runtime?: BenchLocalRuntimeCompatibility
): Promise<BenchLocalConfig> {
  if (!config.benchpacks[benchPackId]) {
    throw new Error(`Bench Pack "${benchPackId}" is not installed.`);
  }

  await reportInstallProgress(reporter, {
    benchPackId,
    action: "update",
    phase: "resolving",
    message: "Resolving Bench Pack update."
  });
  const registry = await loadBenchPackRegistry(config);
  const entry = registry.find((candidate) => candidate.id === benchPackId);

  if (!entry) {
    throw new Error(`Bench Pack "${benchPackId}" was not found in the official registry.`);
  }

  const baseDir = getBenchPackBaseDir(config, benchPackId);
  const staged = entry.source.type === "web"
    ? await stageWebBenchPackRegistryInstall(entry, reporter, "update", runtime)
    : await stageBenchPackArchiveInstall(
        entry.version,
        entry.source.type === "github" ? getGitHubArchiveUrl(entry.source.repo, entry.source.tag) : entry.source.url,
        reporter,
        "update",
        benchPackId,
        runtime
      );
  await reportInstallProgress(reporter, {
    benchPackId,
    action: "update",
    phase: "removing",
    message: "Replacing installed Bench Pack."
  });
  const rootDir = await commitStagedBenchPackInstall(config, benchPackId, entry.version, staged.stagedDir, staged.stagingRoot, {
    replaceExisting: true
  });
  const manifest = staged.manifest;
  await reportInstallProgress(reporter, {
    benchPackId,
    action: "update",
    phase: "activating",
    message: "Activating updated Bench Pack."
  });
  await writeBenchPackCurrentVersion(baseDir, path.basename(rootDir));

  const nextConfig: BenchLocalConfig = structuredClone(config);
  const existing = nextConfig.benchpacks[benchPackId];
  nextConfig.benchpacks[benchPackId] = bootstrapBenchPackConfigFromManifest(manifest, entry, existing);
  await saveConfigFile(nextConfig, getConfigPath());
  await reportInstallProgress(reporter, {
    benchPackId,
    action: "update",
    phase: "complete",
    message: "Bench Pack updated."
  });
  return nextConfig;
}

export async function installBenchPackFromUrl(
  config: BenchLocalConfig,
  archiveUrl: string,
  reporter?: InstallProgressReporter,
  runtime?: BenchLocalRuntimeCompatibility
): Promise<BenchLocalConfig> {
  const normalizedUrl = archiveUrl.trim();

  if (!normalizedUrl) {
    throw new Error("Bench Pack URL is required.");
  }

  try {
    const parsed = new URL(normalizedUrl);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Bench Pack URL must use http:// or https://.");
    }
  } catch {
    throw new Error("Bench Pack URL must be a valid http:// or https:// URL.");
  }

  await reportInstallProgress(reporter, {
    benchPackId: "third-party",
    action: "install",
    phase: "resolving",
    message: "Resolving Bench Pack from URL."
  });

  const staged =
    (await stageWebBenchPackManifestUrlInstall(normalizedUrl, reporter, "install", runtime)) ??
    (await stageBenchPackArchiveInstall("url", normalizedUrl, reporter, "install", "third-party", runtime));
  const manifest = staged.manifest;
  const benchPackId = manifest.id;
  const rootDir = await commitStagedBenchPackInstall(config, benchPackId, manifest.version, staged.stagedDir, staged.stagingRoot);

  await reportInstallProgress(reporter, {
    benchPackId,
    action: "install",
    phase: "activating",
    message: "Activating Bench Pack."
  });
  await writeBenchPackCurrentVersion(getBenchPackBaseDir(config, benchPackId), path.basename(rootDir));

  const nextConfig: BenchLocalConfig = structuredClone(config);
  const existing = nextConfig.benchpacks[benchPackId];
  nextConfig.benchpacks[benchPackId] = {
    enabled: existing?.enabled ?? true,
    source: "archive",
    url: normalizedUrl,
    version: manifest.version,
    auto_update: existing?.auto_update,
    verifiers:
      getManifestVerifiers(manifest).length > 0
        ? Object.fromEntries(
            getManifestVerifiers(manifest).map((spec) => [
              spec.id,
              bootstrapVerifierConfig(spec, existing?.verifiers?.[spec.id] ?? existing?.sidecars?.[spec.id])
            ])
          )
        : undefined
  };

  if (!nextConfig.default_benchpack) {
    nextConfig.default_benchpack = benchPackId;
  }

  await saveConfigFile(nextConfig, getConfigPath());
  await reportInstallProgress(reporter, {
    benchPackId,
    action: "install",
    phase: "complete",
    message: "Bench Pack installed."
  });
  return nextConfig;
}

export async function uninstallBenchPack(
  config: BenchLocalConfig,
  benchPackId: string,
  reporter?: InstallProgressReporter
): Promise<BenchLocalConfig> {
  const rootDir = getBenchPackBaseDir(config, benchPackId);
  await reportInstallProgress(reporter, {
    benchPackId,
    action: "uninstall",
    phase: "removing",
    message: "Removing Bench Pack."
  });

  const nextConfig: BenchLocalConfig = structuredClone(config);
  delete nextConfig.benchpacks[benchPackId];

  if (nextConfig.default_benchpack === benchPackId) {
    nextConfig.default_benchpack = Object.keys(nextConfig.benchpacks)[0] ?? "";
  }

  await saveConfigFile(nextConfig, getConfigPath());
  await removeBenchPackCurrentVersion(rootDir);
  await fs.rm(rootDir, { recursive: true, force: true });
  await reportInstallProgress(reporter, {
    benchPackId,
    action: "uninstall",
    phase: "complete",
    message: "Bench Pack removed."
  });
  return nextConfig;
}

