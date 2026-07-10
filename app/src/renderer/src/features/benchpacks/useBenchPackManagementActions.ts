import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { BenchLocalConfig, BenchPackRegistryEntry } from "@core";
import type { BenchPackVerifierStatus } from "@/shared/desktop-api";
import type { ActiveRunEntry, BenchPackMutationState, LoadState } from "../app/app-state";
import { THIRD_PARTY_INSTALL_MUTATION_ID } from "../app/app-state";
import { cloneConfig } from "../../shared/config-utils";
import { formatDesktopErrorMessage } from "../../shared/desktop-errors";
import { formatRegistryMutationError, formatRegistryWarning } from "./registry-errors";

type Options = {
  registryEntries: BenchPackRegistryEntry[];
  activeRuns: Record<string, ActiveRunEntry>;
  hasUnsavedChanges: boolean;
  settingsOpenRef: MutableRefObject<boolean>;
  save: () => Promise<boolean>;
  setLoadState: Dispatch<SetStateAction<LoadState | null>>;
  setDraft: Dispatch<SetStateAction<BenchLocalConfig | null>>;
  setBenchPackInspections: Dispatch<SetStateAction<Awaited<ReturnType<typeof window.benchlocal.benchPacks.list>>>>;
  setRegistryEntries: Dispatch<SetStateAction<BenchPackRegistryEntry[]>>;
  setRegistryWarning: Dispatch<SetStateAction<string | null>>;
  setVerifierStatuses: Dispatch<SetStateAction<Record<string, BenchPackVerifierStatus>>>;
  setBenchPackMutations: Dispatch<SetStateAction<Record<string, BenchPackMutationState>>>;
  setIsBusy: Dispatch<SetStateAction<boolean>>;
  setSettingsNotice: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
};

// 集中 Bench Pack 文件变更、状态刷新与进度清理。
export function useBenchPackManagementActions(options: Options) {
  const refreshBenchPackState = async (result?: LoadState) => {
    const nextLoadState = result ?? (await window.benchlocal.config.load());
    const inspections = await window.benchlocal.benchPacks.list();
    const verifierStatuses = await window.benchlocal.verifiers.list();
    let registry = options.registryEntries;
    try {
      registry = await window.benchlocal.benchPacks.registry();
      options.setRegistryWarning(null);
    } catch (error) {
      options.setRegistryWarning(formatRegistryWarning(error));
    }
    options.setLoadState(nextLoadState);
    options.setDraft(cloneConfig(nextLoadState.config));
    options.setBenchPackInspections(inspections);
    options.setRegistryEntries(registry);
    options.setVerifierStatuses(Object.fromEntries(verifierStatuses.map((status) => [status.benchPackId, status])));
  };

  const ensureReady = async () => !options.hasUnsavedChanges || options.save();
  const begin = (id: string, mutation: BenchPackMutationState) => {
    options.setIsBusy(true);
    options.setError(null);
    options.setBenchPackMutations((current) => ({ ...current, [id]: mutation }));
  };
  const finish = (...ids: string[]) => {
    options.setIsBusy(false);
    options.setBenchPackMutations((current) => {
      const next = { ...current };
      for (const id of ids) delete next[id];
      return next;
    });
  };

  const installBenchPack = async (benchPackId: string) => {
    if (!(await ensureReady())) return;
    begin(benchPackId, { benchPackId, action: "install", phase: "resolving", message: "Resolving Bench Pack from registry." });
    try {
      await refreshBenchPackState(await window.benchlocal.benchPacks.install({ benchPackId }));
      if (options.settingsOpenRef.current) options.setSettingsNotice(`Installed ${benchPackId}.`);
    } catch (error) {
      options.setError(formatRegistryMutationError("install", benchPackId, error));
    } finally {
      finish(benchPackId);
    }
  };

  const installBenchPackFromUrl = async (url: string) => {
    if (!(await ensureReady())) return;
    const normalizedUrl = url.trim();
    if (!normalizedUrl) { options.setError("Bench Pack URL is required."); return; }
    let installedId: string | null = null;
    begin(THIRD_PARTY_INSTALL_MUTATION_ID, {
      benchPackId: THIRD_PARTY_INSTALL_MUTATION_ID,
      action: "install",
      phase: "resolving",
      message: "Resolving Bench Pack from URL."
    });
    try {
      const result = await window.benchlocal.benchPacks.installFromUrl({ url: normalizedUrl });
      await refreshBenchPackState(result);
      installedId = Object.entries(result.config.benchpacks)
        .find(([, pack]) => pack.source === "archive" && pack.url === normalizedUrl)?.[0] ?? null;
      if (options.settingsOpenRef.current) {
        options.setSettingsNotice(installedId ? `Installed ${installedId}.` : "Installed third-party Bench Pack.");
      }
      return true;
    } catch (error) {
      options.setError(formatDesktopErrorMessage(error) || "Failed to install Bench Pack from URL.");
      return false;
    } finally {
      finish(THIRD_PARTY_INSTALL_MUTATION_ID, "third-party", ...(installedId ? [installedId] : []));
    }
  };

  const updateBenchPack = async (benchPackId: string) => {
    if (!(await ensureReady())) return;
    begin(benchPackId, { benchPackId, action: "update", phase: "resolving", message: "Resolving Bench Pack update." });
    try {
      await refreshBenchPackState(await window.benchlocal.benchPacks.update({ benchPackId }));
      if (options.settingsOpenRef.current) options.setSettingsNotice(`Updated ${benchPackId}.`);
    } catch (error) {
      options.setError(formatRegistryMutationError("update", benchPackId, error));
    } finally {
      finish(benchPackId);
    }
  };

  const uninstallInstalledBenchPack = async (benchPackId: string) => {
    if (!(await ensureReady())) return;
    if (Object.values(options.activeRuns).some((run) => run.benchPackId === benchPackId)) {
      options.setError("Stop active Bench Pack runs before uninstalling this pack.");
      return;
    }
    begin(benchPackId, { benchPackId, action: "uninstall", phase: "removing", message: "Removing Bench Pack." });
    try {
      await refreshBenchPackState(await window.benchlocal.benchPacks.uninstall({ benchPackId }));
      if (options.settingsOpenRef.current) options.setSettingsNotice(`Uninstalled ${benchPackId}.`);
    } catch (error) {
      options.setError(error instanceof Error ? error.message : `Failed to uninstall ${benchPackId}.`);
    } finally {
      finish(benchPackId);
    }
  };

  return { installBenchPack, installBenchPackFromUrl, updateBenchPack, uninstallInstalledBenchPack };
}
