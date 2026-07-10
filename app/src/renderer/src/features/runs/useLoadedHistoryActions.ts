import type { Dispatch, SetStateAction } from "react";
import type { BenchLocalWorkspaceState, BenchPackRunHistoryEntry, BenchPackRunSummary } from "@core";
import type { HistoryModalState } from "../app/app-state";
import type { LiveRunState, LoadedHistoryEntry } from "./run-utils";

type UseLoadedHistoryActionsOptions = {
  workspaceState: BenchLocalWorkspaceState | null;
  loadedHistoryRuns: Record<string, LoadedHistoryEntry>;
  updateWorkspaceState: (updater: (current: BenchLocalWorkspaceState) => BenchLocalWorkspaceState) => void;
  setLoadedHistoryRuns: Dispatch<SetStateAction<Record<string, LoadedHistoryEntry>>>;
  setRunSummaries: Dispatch<SetStateAction<Record<string, BenchPackRunSummary>>>;
  setLiveRuns: Dispatch<SetStateAction<Record<string, LiveRunState>>>;
  setRunHistories: Dispatch<SetStateAction<Record<string, BenchPackRunHistoryEntry[]>>>;
  setHistoryModal: Dispatch<SetStateAction<HistoryModalState | null>>;
  setAppNotice: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
};

// 保持工作区加载标记、历史摘要和实时状态同步，避免历史删除后残留旧视图。
export function useLoadedHistoryActions(options: UseLoadedHistoryActionsOptions) {
  const clearTabs = (tabIds: string[]) => {
    if (tabIds.length === 0) return;

    options.updateWorkspaceState((current) => {
      for (const tabId of tabIds) {
        const tab = current.tabs[tabId];
        if (!tab) continue;
        tab.loadedRunId = null;
        tab.updatedAt = new Date().toISOString();
      }
      return current;
    });
    options.setLoadedHistoryRuns((current) => withoutTabs(current, tabIds));
    options.setRunSummaries((current) => withoutTabs(current, tabIds));
    options.setLiveRuns((current) => withoutTabs(current, tabIds));
  };

  const clearLoadedHistoryRun = (tabId: string) => clearTabs([tabId]);

  const clearLoadedHistoryForBenchPack = (benchPackId: string, runIds?: Set<string>) => {
    const tabIds = Object.values(options.workspaceState?.tabs ?? {})
      .filter((tab) => {
        const loadedRun = options.loadedHistoryRuns[tab.id];
        return tab.benchPackId === benchPackId && loadedRun && (!runIds || runIds.has(loadedRun.runId));
      })
      .map((tab) => tab.id);
    clearTabs(tabIds);
  };

  const deleteSelectedHistoryForBenchPack = async (benchPackId: string, benchPackName: string, runIds: string[]) => {
    try {
      const result = await window.benchlocal.benchPacks.deleteHistory({ benchPackId, runIds });
      const removedRunIds = new Set(result.removedRunIds);
      if (removedRunIds.size === 0) {
        options.setAppNotice("No selected test histories were found.");
        return;
      }

      options.setRunHistories((current) => ({
        ...current,
        [benchPackId]: (current[benchPackId] ?? []).filter((entry) => !removedRunIds.has(entry.runId))
      }));
      options.setHistoryModal((current) =>
        current?.benchPackId === benchPackId
          ? { ...current, entries: current.entries.filter((entry) => !removedRunIds.has(entry.runId)) }
          : current
      );
      clearLoadedHistoryForBenchPack(benchPackId, removedRunIds);
      options.setAppNotice(
        `Deleted ${removedRunIds.size} selected ${removedRunIds.size === 1 ? "history" : "histories"} for ${benchPackName}.`
      );
    } catch (error) {
      options.setError(error instanceof Error ? error.message : "Failed to delete Bench Pack history.");
    }
  };

  return { clearLoadedHistoryRun, clearLoadedHistoryForBenchPack, deleteSelectedHistoryForBenchPack };
}

function withoutTabs<T>(current: Record<string, T>, tabIds: string[]): Record<string, T> {
  const next = { ...current };
  for (const tabId of tabIds) delete next[tabId];
  return next;
}
