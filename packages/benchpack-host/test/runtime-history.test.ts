import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { BenchLocalConfig } from "@benchlocal/core";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearRunHistoryForBenchPack,
  deleteRunHistoryForBenchPack,
  listRunHistoryForBenchPack,
  loadRunSummaryForBenchPack
} from "../src/history/history-store.js";
import { loadConfiguredBenchPack } from "../src/runtime/load-runtime.js";

const temporaryRoots: string[] = [];

async function createConfig(): Promise<BenchLocalConfig> {
  const runStorageDir = await mkdtemp(path.join(tmpdir(), "benchlocal-history-"));
  temporaryRoots.push(runStorageDir);
  return {
    benchpacks: {},
    run_storage_dir: runStorageDir
  } as BenchLocalConfig;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("runtime loading boundary", () => {
  it("rejects an unknown configured Bench Pack before touching the file system", async () => {
    const config = await createConfig();

    await expect(loadConfiguredBenchPack(config, "missing-pack")).rejects.toThrow(
      'Unknown Bench Pack "missing-pack" in BenchLocal config.'
    );
  });
});

describe("history store boundary", () => {
  it("returns an empty collection and a stable missing-summary error for absent history", async () => {
    const config = await createConfig();

    await expect(listRunHistoryForBenchPack(config, "pack-a")).resolves.toEqual([]);
    await expect(loadRunSummaryForBenchPack(config, "pack-a", "run-a")).rejects.toThrow(
      "Run history run-a was not found for Bench Pack pack-a."
    );
  });

  it("rejects traversal identifiers before deleting files", async () => {
    const config = await createConfig();

    await expect(deleteRunHistoryForBenchPack(config, "pack-a", ["../outside"])).rejects.toThrow(
      "is not a valid run identifier"
    );
  });

  it("keeps clear idempotent when the Bench Pack has no history directory", async () => {
    const config = await createConfig();

    await expect(clearRunHistoryForBenchPack(config, "pack-a")).resolves.toEqual({ removed: true });
  });
});
