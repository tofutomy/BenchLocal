import type { Dispatch, SetStateAction } from "react";
import type {
  BenchLocalWorkspaceState,
  BenchLocalWorkspaceTab,
  BenchPackRunHistoryEntry,
  BenchPackRunSummary
} from "@core";
import type { LiveRunState, LoadedHistoryEntry } from "./run-utils";

type UseBenchPackHistoryActionsOptions = {
  activeTab: BenchLocalWorkspaceTab | null;
  updateWorkspaceState: (updater: (current: BenchLocalWorkspaceState) => BenchLocalWorkspaceState) => void;
  setRunHistories: Dispatch<SetStateAction<Record<string, BenchPackRunHistoryEntry[]>>>;
  setRunSummaries: Dispatch<SetStateAction<Record<string, BenchPackRunSummary>>>;
  setLiveRuns: Dispatch<SetStateAction<Record<string, LiveRunState>>>;
  setLoadedHistoryRuns: Dispatch<SetStateAction<Record<string, LoadedHistoryEntry>>>;
  setAppNotice: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
};

// 集中历史读取与恢复视图，保持工作区加载标记和 renderer 状态一致。
export function useBenchPackHistoryActions({
  activeTab,
  updateWorkspaceState,
  setRunHistories,
  setRunSummaries,
  setLiveRuns,
  setLoadedHistoryRuns,
  setAppNotice,
  setError
}: UseBenchPackHistoryActionsOptions) {
  const loadHistoryForBenchPack = async (benchPackId: string) => {
    try {
      const history = await window.benchlocal.benchPacks.history({ benchPackId });
      setRunHistories((current) => ({ ...current, [benchPackId]: history }));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to load Bench Pack history.");
    }
  };

  const restoreHistoryRun = async (benchPackId: string, runId: string, mode: "history" | "replay" = "history") => {
    if (!activeTab) return;
    const tabId = activeTab.id;

    try {
      const summary = await window.benchlocal.benchPacks.loadHistory({ benchPackId, runId });
      setRunSummaries((current) => ({ ...current, [tabId]: summary }));
      updateWorkspaceState((current) => {
        const tab = current.tabs[tabId];
        if (!tab) return current;
        tab.loadedRunId = summary.runId;
        if (summary.executionMode) tab.executionMode = summary.executionMode;
        tab.updatedAt = new Date().toISOString();
        return current;
      });
      setLiveRuns((current) => withoutTab(current, tabId));
      setLoadedHistoryRuns((current) => ({
        ...current,
        [tabId]: { runId, startedAt: summary.startedAt, mode }
      }));
      // 用浮动 toast 提示，避免旧版 history banner 挡住 Run。
      if (mode !== "replay") {
        setAppNotice(`Loaded test history from ${new Date(summary.startedAt).toLocaleString()}.`);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to load Bench Pack history.");
    }
  };

  return { loadHistoryForBenchPack, restoreHistoryRun };
}

function withoutTab<T>(current: Record<string, T>, tabId: string): Record<string, T> {
  if (!current[tabId]) return current;
  const next = { ...current };
  delete next[tabId];
  return next;
}
