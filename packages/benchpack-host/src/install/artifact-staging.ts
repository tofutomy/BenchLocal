import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { BenchLocalConfig, BenchPackManifest, BenchPackRegistryEntry } from "@benchlocal/core";
import { reportInstallProgress, type BenchPackInstallAction, type InstallProgressReporter } from "../install-progress.js";
import { getBenchPackCompatibilityError, type BenchLocalRuntimeCompatibility } from "../shared/compatibility.js";
import { pathExists } from "../shared/file-system.js";
import { cleanupBenchPackStaging, getBenchPackBaseDir, getBenchPackVersionsDir, sanitizeBenchPackVersion } from "../shared/storage.js";
import { getBenchPackManifestType, isAllowedWebPackUrl, isBenchPackManifest, readBenchPackManifest } from "../inspect/manifest.js";
import { fetchWebBenchPackManifest } from "./manifest-validation.js";
import { hydrateBenchLocalRuntimeDependencies } from "./runtime-hydration.js";

const execFileAsync = promisify(execFile);

async function runTarCommand(args: string[], options?: { cwd?: string }): Promise<string> {
  const { stdout } = await execFileAsync("tar", args, { cwd: options?.cwd, maxBuffer: 8 * 1024 * 1024 });
  return stdout.trim();
}

async function downloadBenchPackArchive(
  archiveUrl: string,
  archivePath: string,
  reporter: InstallProgressReporter | undefined,
  benchPackId: string,
  action: BenchPackInstallAction
): Promise<void> {
  await reportInstallProgress(reporter, {
    benchPackId,
    action,
    phase: "downloading",
    message: "Downloading Bench Pack artifact."
  });

  const response = await fetch(archiveUrl);

  if (!response.ok) {
    throw new Error(`Failed to download Bench Pack archive (${response.status}).`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(archivePath, buffer);
}

function isErrnoExceptionWithCode(error: unknown, code: string): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof (error as NodeJS.ErrnoException).code === "string" &&
    (error as NodeJS.ErrnoException).code === code
  );
}

async function moveDirectory(sourcePath: string, targetPath: string): Promise<void> {
  try {
    await fs.rename(sourcePath, targetPath);
    return;
  } catch (error) {
    if (!isErrnoExceptionWithCode(error, "EXDEV")) {
      throw error;
    }
  }

  try {
    await fs.cp(sourcePath, targetPath, {
      recursive: true,
      force: false,
      errorOnExist: true
    });
    await fs.rm(sourcePath, { recursive: true, force: true });
  } catch (error) {
    await fs.rm(targetPath, { recursive: true, force: true });
    throw error;
  }
}

export async function stageBenchPackArchiveInstall(
  version: string,
  archiveUrl: string,
  reporter?: InstallProgressReporter,
  action: BenchPackInstallAction = "install",
  progressBenchPackId = "benchpack",
  runtime?: BenchLocalRuntimeCompatibility
): Promise<{ stagingRoot: string; stagedDir: string; manifest: BenchPackManifest }> {
  const stagingRoot = path.join(os.tmpdir(), `benchlocal-benchpack-${randomUUID().slice(0, 8)}`);
  const archivePath = path.join(stagingRoot, "package.tar.gz");
  const extractDir = path.join(stagingRoot, "extract");
  const versionKey = `${sanitizeBenchPackVersion(version)}-${randomUUID().slice(0, 8)}`;
  const versionStageDir = path.join(stagingRoot, versionKey);

  await fs.mkdir(stagingRoot, { recursive: true });

  try {
    await downloadBenchPackArchive(archiveUrl, archivePath, reporter, progressBenchPackId, action);
    await reportInstallProgress(reporter, {
      benchPackId: progressBenchPackId,
      action,
      phase: "extracting",
      message: "Extracting Bench Pack artifact."
    });
    await fs.mkdir(extractDir, { recursive: true });
    await runTarCommand(["-xzf", archivePath, "-C", extractDir]);

    const entries = await fs.readdir(extractDir, { withFileTypes: true });
    const topLevelDir =
      entries.length === 1 && entries[0]?.isDirectory()
        ? path.join(extractDir, entries[0].name)
        : extractDir;

    await fs.cp(topLevelDir, versionStageDir, { recursive: true });
    await reportInstallProgress(reporter, {
      benchPackId: progressBenchPackId,
      action,
      phase: "hydrating",
      message: "Preparing Bench Pack runtime."
    });
    await hydrateBenchLocalRuntimeDependencies(versionStageDir);
    await reportInstallProgress(reporter, {
      benchPackId: progressBenchPackId,
      action,
      phase: "validating",
      message: "Validating Bench Pack."
    });

    const manifest = await readBenchPackManifest(versionStageDir);
    const compatibilityError = getBenchPackCompatibilityError(manifest, runtime);

    if (compatibilityError) {
      throw new Error(compatibilityError);
    }

    if (getBenchPackManifestType(manifest) === "table") {
      const entryPath = path.resolve(versionStageDir, manifest.entry);

      if (!(await pathExists(entryPath))) {
        throw new Error(`Bench Pack entry is missing: ${entryPath}`);
      }
    }

    return {
      stagingRoot,
      stagedDir: versionStageDir,
      manifest
    };
  } catch (error) {
    await fs.rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function stageWebBenchPackRegistryInstall(
  entry: BenchPackRegistryEntry,
  reporter: InstallProgressReporter | undefined,
  action: BenchPackInstallAction,
  runtime?: BenchLocalRuntimeCompatibility
): Promise<{ stagingRoot: string; stagedDir: string; manifest: BenchPackManifest }> {
  const stagingRoot = path.join(os.tmpdir(), `benchlocal-web-benchpack-${randomUUID().slice(0, 8)}`);
  const versionKey = `${sanitizeBenchPackVersion(entry.version)}-${randomUUID().slice(0, 8)}`;
  const versionStageDir = path.join(stagingRoot, versionKey);

  await fs.mkdir(versionStageDir, { recursive: true });

  try {
    await reportInstallProgress(reporter, {
      benchPackId: entry.id,
      action,
      phase: "downloading",
      message: "Fetching Web Bench Pack manifest."
    });
    const manifest = await fetchWebBenchPackManifest(entry);
    await reportInstallProgress(reporter, {
      benchPackId: entry.id,
      action,
      phase: "validating",
      message: "Validating Web Bench Pack manifest."
    });
    const compatibilityError = getBenchPackCompatibilityError(manifest, runtime);

    if (compatibilityError) {
      throw new Error(compatibilityError);
    }

    await fs.writeFile(path.join(versionStageDir, "benchlocal.pack.json"), JSON.stringify(manifest, null, 2), "utf8");

    return {
      stagingRoot,
      stagedDir: versionStageDir,
      manifest
    };
  } catch (error) {
    await fs.rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}

function isLikelyJsonUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.pathname.toLowerCase().endsWith(".json");
  } catch {
    return false;
  }
}

export async function stageWebBenchPackManifestUrlInstall(
  manifestUrl: string,
  reporter: InstallProgressReporter | undefined,
  action: BenchPackInstallAction,
  runtime?: BenchLocalRuntimeCompatibility
): Promise<{ stagingRoot: string; stagedDir: string; manifest: BenchPackManifest } | null> {
  if (!isAllowedWebPackUrl(manifestUrl) || !isLikelyJsonUrl(manifestUrl)) {
    return null;
  }

  const stagingRoot = path.join(os.tmpdir(), `benchlocal-web-benchpack-${randomUUID().slice(0, 8)}`);

  try {
    await reportInstallProgress(reporter, {
      benchPackId: "third-party",
      action,
      phase: "downloading",
      message: "Fetching Web Bench Pack manifest."
    });

    const response = await fetch(manifestUrl, {
      method: "GET",
      headers: {
        accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Web Bench Pack manifest (${response.status}).`);
    }

    const parsed = (await response.json()) as unknown;

    if (!isBenchPackManifest(parsed) || getBenchPackManifestType(parsed) !== "web") {
      throw new Error("URL did not return a valid Web Bench Pack manifest.");
    }

    await reportInstallProgress(reporter, {
      benchPackId: parsed.id,
      action,
      phase: "validating",
      message: "Validating Web Bench Pack manifest."
    });

    const compatibilityError = getBenchPackCompatibilityError(parsed, runtime);

    if (compatibilityError) {
      throw new Error(compatibilityError);
    }

    const versionStageDir = path.join(stagingRoot, `${sanitizeBenchPackVersion(parsed.version)}-${randomUUID().slice(0, 8)}`);
    await fs.mkdir(versionStageDir, { recursive: true });
    await fs.writeFile(path.join(versionStageDir, "benchlocal.pack.json"), JSON.stringify(parsed, null, 2), "utf8");

    return {
      stagingRoot,
      stagedDir: versionStageDir,
      manifest: parsed
    };
  } catch (error) {
    await fs.rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function commitStagedBenchPackInstall(
  config: BenchLocalConfig,
  benchPackId: string,
  version: string,
  stagedDir: string,
  stagingRoot?: string,
  options?: {
    replaceExisting?: boolean;
  }
): Promise<string> {
  const baseDir = getBenchPackBaseDir(config, benchPackId);
  if (options?.replaceExisting) {
    await fs.rm(baseDir, { recursive: true, force: true });
  }
  await fs.mkdir(baseDir, { recursive: true });
  await fs.mkdir(getBenchPackVersionsDir(baseDir), { recursive: true });
  await cleanupBenchPackStaging(baseDir);
  const versionKey = `${sanitizeBenchPackVersion(version)}-${randomUUID().slice(0, 8)}`;
  const finalVersionDir = path.join(getBenchPackVersionsDir(baseDir), versionKey);

  await moveDirectory(stagedDir, finalVersionDir);
  if (stagingRoot) {
    await fs.rm(stagingRoot, { recursive: true, force: true });
  }
  return finalVersionDir;
}

