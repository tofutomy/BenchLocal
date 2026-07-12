import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pathExists } from "../shared/file-system.js";

export type RuntimeHydrationOperations = {
  fs: Pick<typeof fs, "mkdir" | "rm" | "cp">;
  pathExists: typeof pathExists;
  resolveRuntimeRoot(): Promise<string>;
};

function getBenchLocalWorkspaceRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
}

async function resolveBenchLocalRuntimeRoot(): Promise<string> {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const packagedRoot = resourcesPath ? path.join(resourcesPath, "benchlocal-runtime") : undefined;
  if (packagedRoot && (await pathExists(packagedRoot))) return packagedRoot;

  const workspaceRoot = getBenchLocalWorkspaceRoot();
  if (await pathExists(workspaceRoot)) return workspaceRoot;
  throw new Error("BenchLocal runtime resources are unavailable for Bench Pack installation.");
}

const defaultOperations: RuntimeHydrationOperations = {
  fs,
  pathExists,
  resolveRuntimeRoot: resolveBenchLocalRuntimeRoot
};

/** 将运行 Bench Pack 所需的受控依赖复制到 staging 目录；operations 可由测试 stub 替换。 */
export async function hydrateBenchLocalRuntimeDependencies(
  rootDir: string,
  operations: RuntimeHydrationOperations = defaultOperations
): Promise<void> {
  const runtimeRoot = await operations.resolveRuntimeRoot();
  const nodeModulesRoot = path.join(rootDir, "node_modules");
  const scopedRoot = path.join(nodeModulesRoot, "@benchlocal");
  await operations.fs.mkdir(scopedRoot, { recursive: true });

  const requiredCopies = [
    [path.join(runtimeRoot, "packages/benchlocal-sdk"), path.join(scopedRoot, "sdk"), "@benchlocal/sdk"],
    [path.join(runtimeRoot, "packages/benchlocal-core"), path.join(scopedRoot, "core"), "@benchlocal/core"],
    [path.join(runtimeRoot, "node_modules/zod"), path.join(nodeModulesRoot, "zod"), "zod"],
    [path.join(runtimeRoot, "node_modules/smol-toml"), path.join(nodeModulesRoot, "smol-toml"), "smol-toml"]
  ] as const;

  for (const [source, target, label] of requiredCopies) {
    if (!(await operations.pathExists(source))) {
      throw new Error(`BenchLocal runtime dependency is missing from the app bundle: ${label}`);
    }
    await operations.fs.rm(target, { recursive: true, force: true });
    await operations.fs.cp(source, target, { recursive: true });
  }
}
