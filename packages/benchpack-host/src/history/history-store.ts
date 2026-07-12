import { promises as fs } from "node:fs";
import path from "node:path";
import {
  expandHomePath,
  type BenchLocalConfig,
  type BenchPackRunHistoryEntry,
  type BenchPackRunSummary
} from "@benchlocal/core";
import { pathExists, readJsonFile } from "../shared/file-system.js";

function getBenchPackRunRoot(config: BenchLocalConfig, benchPackId: string): string {
  return path.join(expandHomePath(config.run_storage_dir), benchPackId);
}

// History 文件只负责持久化和路径安全校验，summary 的业务归一化留在 public facade。
export async function listRunHistoryForBenchPack(
  config: BenchLocalConfig,
  benchPackId: string
): Promise<BenchPackRunHistoryEntry[]> {
  const runRoot = getBenchPackRunRoot(config, benchPackId);

  if (!(await pathExists(runRoot))) {
    return [];
  }

  const entries = await fs.readdir(runRoot, { withFileTypes: true });
  const summaries: Array<BenchPackRunHistoryEntry | null> = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const summaryPath = path.join(runRoot, entry.name, "summary.json");

        if (!(await pathExists(summaryPath))) {
          return null;
        }

        const summary = await readJsonFile<BenchPackRunSummary>(summaryPath);
        return {
          runId: summary.runId,
          runDir: summary.runDir,
          packType: summary.packType,
          packVersion: summary.packVersion,
          packEntry: summary.packEntry,
          packBuildId: summary.packBuildId,
          packManifestHash: summary.packManifestHash,
          benchPackId: summary.benchPackId,
          benchPackName: summary.benchPackName,
          executionMode: summary.executionMode,
          runsPerTest: summary.runsPerTest,
          startedAt: summary.startedAt,
          completedAt: summary.completedAt,
          modelCount: summary.modelCount,
          scenarioCount: summary.scenarioCount,
          cancelled: summary.cancelled,
          error: summary.error
        } satisfies BenchPackRunHistoryEntry;
      })
  );

  return summaries
    .filter((entry): entry is BenchPackRunHistoryEntry => entry !== null)
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}

export async function loadRunSummaryForBenchPack(
  config: BenchLocalConfig,
  benchPackId: string,
  runId: string
): Promise<BenchPackRunSummary> {
  const summaryPath = path.join(getBenchPackRunRoot(config, benchPackId), runId, "summary.json");

  if (!(await pathExists(summaryPath))) {
    throw new Error("Run history " + runId + " was not found for Bench Pack " + benchPackId + ".");
  }

  return readJsonFile<BenchPackRunSummary>(summaryPath);
}

export async function deleteRunHistoryForBenchPack(
  config: BenchLocalConfig,
  benchPackId: string,
  runIds: string[]
): Promise<{ removedRunIds: string[] }> {
  const uniqueRunIds = Array.from(new Set(runIds.map((runId) => runId.trim()).filter(Boolean)));
  const runRoot = path.resolve(getBenchPackRunRoot(config, benchPackId));
  const removedRunIds: string[] = [];

  for (const runId of uniqueRunIds) {
    if (runId !== path.basename(runId)) {
      throw new Error("Run history " + runId + " is not a valid run identifier.");
    }

    const runDir = path.resolve(runRoot, runId);

    if (!runDir.startsWith(runRoot + path.sep)) {
      throw new Error("Run history " + runId + " is not inside the Bench Pack run directory.");
    }

    if (await pathExists(runDir)) {
      await fs.rm(runDir, { recursive: true, force: true });
      removedRunIds.push(runId);
    }
  }

  return { removedRunIds };
}

export async function clearRunHistoryForBenchPack(
  config: BenchLocalConfig,
  benchPackId: string
): Promise<{ removed: boolean }> {
  const runRoot = getBenchPackRunRoot(config, benchPackId);
  await fs.rm(runRoot, { recursive: true, force: true });
  return { removed: true };
}
