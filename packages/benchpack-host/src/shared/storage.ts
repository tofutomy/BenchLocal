// Bench Pack 目录和 current pointer 的文件操作集中在这里，保证安装与 inspection 使用同一套路径规则。
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { expandHomePath, type BenchLocalConfig } from "@benchlocal/core";
import { pathExists, readJsonFile } from "./file-system.js";

export function getBenchPackBaseDir(config: BenchLocalConfig, benchPackId: string): string {
  return path.join(expandHomePath(config.benchpack_storage_dir), benchPackId);
}

export function getBenchPackVersionsDir(baseDir: string): string {
  return path.join(baseDir, "versions");
}

function getBenchPackCurrentPointerPath(baseDir: string): string {
  return path.join(baseDir, "current.json");
}

export async function readBenchPackCurrentVersion(baseDir: string): Promise<string | null> {
  const pointerPath = getBenchPackCurrentPointerPath(baseDir);

  if (!(await pathExists(pointerPath))) {
    return null;
  }

  const parsed = await readJsonFile<{ version?: string }>(pointerPath);
  return typeof parsed.version === "string" && parsed.version.trim() ? parsed.version.trim() : null;
}

export async function writeBenchPackCurrentVersion(baseDir: string, version: string): Promise<void> {
  const pointerPath = getBenchPackCurrentPointerPath(baseDir);
  const tempPath = pointerPath + ".tmp-" + randomUUID().slice(0, 8);
  await fs.writeFile(
    tempPath,
    JSON.stringify(
      {
        version,
        updatedAt: new Date().toISOString()
      },
      null,
      2
    ),
    "utf8"
  );
  await fs.rename(tempPath, pointerPath);
}

export async function removeBenchPackCurrentVersion(baseDir: string): Promise<void> {
  await fs.rm(getBenchPackCurrentPointerPath(baseDir), { force: true });
}

export async function cleanupBenchPackStaging(baseDir: string): Promise<void> {
  if (!(await pathExists(baseDir))) {
    return;
  }

  const entries = await fs.readdir(baseDir, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.name.startsWith(".staging-"))
      .map((entry) => fs.rm(path.join(baseDir, entry.name), { recursive: true, force: true }))
  );
}

export function sanitizeBenchPackVersion(input: string): string {
  return input.replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || randomUUID().slice(0, 8);
}
