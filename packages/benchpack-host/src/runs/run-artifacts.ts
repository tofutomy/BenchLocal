// 运行产物目录与文件管理：创建 runId 目录、写入 summary/events/host-log、路径安全校验。
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { expandHomePath, type BenchLocalConfig, type BenchPackRunSummary } from "@benchlocal/core";

export type RunArtifacts = {
  runId: string;
  runDir: string;
  eventsPath: string;
  summaryPath: string;
  hostLogPath: string;
};

export async function createRunArtifacts(config: BenchLocalConfig, benchPackId: string): Promise<RunArtifacts> {
  const runId = `${benchPackId}-${new Date().toISOString().replaceAll(":", "-")}-${randomUUID().slice(0, 8)}`;
  const runDir = path.join(expandHomePath(config.run_storage_dir), benchPackId, runId);
  await fs.mkdir(runDir, { recursive: true });
  return {
    runId,
    runDir,
    eventsPath: path.join(runDir, "events.jsonl"),
    summaryPath: path.join(runDir, "summary.json"),
    hostLogPath: path.join(runDir, "host.log")
  };
}

export function getRunArtifactsForExistingRun(summary: BenchPackRunSummary): RunArtifacts {
  return {
    runId: summary.runId,
    runDir: summary.runDir,
    eventsPath: path.join(summary.runDir, "events.jsonl"),
    summaryPath: path.join(summary.runDir, "summary.json"),
    hostLogPath: path.join(summary.runDir, "host.log")
  };
}

export function getBenchPackRunRoot(config: BenchLocalConfig, benchPackId: string): string {
  return path.join(expandHomePath(config.run_storage_dir), benchPackId);
}

export async function appendJsonLine(targetPath: string, value: unknown): Promise<void> {
  await fs.appendFile(targetPath, `${JSON.stringify(value)}\n`, "utf8");
}

export async function appendTextLine(targetPath: string, value: string): Promise<void> {
  await fs.appendFile(targetPath, `${value}\n`, "utf8");
}

/** summary 归一化由 orchestration 注入，文件模块只负责原子边界内的序列化。 */
export async function writeRunSummary(
  summaryPath: string,
  summary: BenchPackRunSummary,
  normalize: (summary: BenchPackRunSummary) => BenchPackRunSummary
): Promise<void> {
  await fs.writeFile(summaryPath, JSON.stringify(normalize(summary), null, 2), "utf8");
}
