import type {
  BenchLocalConfig,
  BenchPackRunHistoryEntry,
  BenchPackRunSummary
} from "@benchlocal/core";
import {
  clearRunHistoryForBenchPack as clearRunHistoryStore,
  deleteRunHistoryForBenchPack as deleteRunHistoryStore,
  listRunHistoryForBenchPack as listRunHistoryStore,
  loadRunSummaryForBenchPack as loadRunSummaryStore
} from "./history/history-store.js";
import { installBenchPackFromRegistry, updateBenchPackFromRegistry } from "./install/install-from-registry.js";
import { installBenchPackFromUrl } from "./install/install-from-url.js";
import { uninstallBenchPack } from "./install/uninstall.js";
import {
  inspectConfiguredBenchPacks
} from "./inspect/configured-packs.js";
import { loadBenchPackRegistry } from "./registry/load-registry.js";
import {
  normalizeRunSummaryProviderErrorClassification,
  resumeBenchPackRun,
  retryScenarioForBenchPackRun,
  runConfiguredBenchPack
} from "./runs/run-benchpack.js";
import { checkConfiguredModelAvailability } from "./runtime/model-resolution.js";
import {
  deleteConfiguredBenchPackVerifierImage,
  getConfiguredBenchPackVerifierStatus,
  startConfiguredBenchPackVerifiers,
  stopConfiguredBenchPackVerifiers
} from "./verifier/verifier-service.js";

export type { BenchPackInstallProgress } from "./install-progress.js";

export type BenchPackHostStatus = "idle" | "loading" | "ready" | "error";

export type LoadedBenchPackHandle = {
  benchPackId: string;
  entryPath: string;
};

export {
  checkConfiguredModelAvailability,
  deleteConfiguredBenchPackVerifierImage,
  getConfiguredBenchPackVerifierStatus,
  inspectConfiguredBenchPacks,
  installBenchPackFromRegistry,
  installBenchPackFromUrl,
  loadBenchPackRegistry,
  resumeBenchPackRun,
  retryScenarioForBenchPackRun,
  runConfiguredBenchPack,
  startConfiguredBenchPackVerifiers,
  stopConfiguredBenchPackVerifiers,
  uninstallBenchPack,
  updateBenchPackFromRegistry
};

export type { ConfiguredBenchPackVerifierStatus } from "./verifier/verifier-service.js";

export async function listRunHistoryForBenchPack(
  config: BenchLocalConfig,
  benchPackId: string
): Promise<BenchPackRunHistoryEntry[]> {
  // history store 只负责文件存取，public facade 保持原有返回契约。
  return listRunHistoryStore(config, benchPackId);
}

export async function loadRunSummaryForBenchPack(
  config: BenchLocalConfig,
  benchPackId: string,
  runId: string
): Promise<BenchPackRunSummary> {
  const summary = await loadRunSummaryStore(config, benchPackId, runId);
  return normalizeRunSummaryProviderErrorClassification(summary);
}

export async function deleteRunHistoryForBenchPack(
  config: BenchLocalConfig,
  benchPackId: string,
  runIds: string[]
): Promise<{ removedRunIds: string[] }> {
  return deleteRunHistoryStore(config, benchPackId, runIds);
}

export async function clearRunHistoryForBenchPack(
  config: BenchLocalConfig,
  benchPackId: string
): Promise<{ removed: boolean }> {
  return clearRunHistoryStore(config, benchPackId);
}

export function createBenchPackHost() {
  let status: BenchPackHostStatus = "idle";

  return {
    getStatus(): BenchPackHostStatus {
      return status;
    },
    async loadBenchPack(entryPath: string, benchPackId: string): Promise<LoadedBenchPackHandle> {
      status = "loading";
      status = "ready";

      return {
        benchPackId,
        entryPath
      };
    }
  };
}
