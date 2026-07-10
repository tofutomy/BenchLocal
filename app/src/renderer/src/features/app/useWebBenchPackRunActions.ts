import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { BenchPackInspection, BenchPackRunSummary, BenchLocalWorkspaceState, BenchLocalWorkspaceTab } from "@core";
import type { ActiveRunEntry } from "./app-state";
import type { LiveRunState, LoadedHistoryEntry } from "../runs/run-utils";

type UseWebBenchPackRunActionsOptions = {
  loadedHistoryRuns: Record<string, LoadedHistoryEntry>;
  setRunSummaries: Dispatch<SetStateAction<Record<string, BenchPackRunSummary>>>;
  setLoadedHistoryRuns: Dispatch<SetStateAction<Record<string, LoadedHistoryEntry>>>;
  setActiveRuns: Dispatch<SetStateAction<Record<string, ActiveRunEntry>>>;
  setStoppingRuns: Dispatch<SetStateAction<Record<string, true>>>;
  setLiveRuns: Dispatch<SetStateAction<Record<string, LiveRunState>>>;
  updateWorkspaceState: (updater: (current: BenchLocalWorkspaceState) => BenchLocalWorkspaceState) => void;
  loadHistoryForBenchPack: (benchPackId: string) => Promise<void>;
};

// 收拢 Web Bench Pack 的运行生命周期，保持与表格运行编排相互独立。
export function useWebBenchPackRunActions({
  loadedHistoryRuns,
  setRunSummaries,
  setLoadedHistoryRuns,
  setActiveRuns,
  setStoppingRuns,
  setLiveRuns,
  updateWorkspaceState,
  loadHistoryForBenchPack
}: UseWebBenchPackRunActionsOptions) {
  const handleWebPackRunSummarySaved = useCallback(
    async (tabId: string, summary: BenchPackRunSummary) => {
      setRunSummaries((current) => ({ ...current, [tabId]: summary }));

      if (loadedHistoryRuns[tabId]) {
        updateWorkspaceState((current) => {
          const tab = current.tabs[tabId];
          if (!tab) {
            return current;
          }

          tab.loadedRunId = summary.runId;
          tab.updatedAt = new Date().toISOString();
          return current;
        });
      }

      setLoadedHistoryRuns((current) => {
        const existing = current[tabId];
        return existing
          ? { ...current, [tabId]: { ...existing, runId: summary.runId, startedAt: summary.startedAt } }
          : current;
      });
      await loadHistoryForBenchPack(summary.benchPackId);
    },
    [loadedHistoryRuns, setRunSummaries, updateWorkspaceState, setLoadedHistoryRuns, loadHistoryForBenchPack]
  );

  const startWebBenchPackState = useCallback(
    (tab: BenchLocalWorkspaceTab, inspection: BenchPackInspection) => {
      setActiveRuns((current) => ({ ...current, [tab.id]: { benchPackId: inspection.id, mode: "host" } }));
      setStoppingRuns((current) => {
        if (!current[tab.id]) return current;
        const next = { ...current };
        delete next[tab.id];
        return next;
      });
      setLiveRuns((current) => ({
        ...current,
        [tab.id]: current[tab.id] ?? { events: [], resultsByModel: {}, activeCellKeys: [] }
      }));
    },
    [setActiveRuns, setStoppingRuns, setLiveRuns]
  );

  const stopWebBenchPackState = useCallback(
    (tabId: string) => {
      setActiveRuns((current) => removeTabRunState(current, tabId));
      setStoppingRuns((current) => removeTabRunState(current, tabId));
      setLiveRuns((current) => removeTabRunState(current, tabId));
    },
    [setActiveRuns, setStoppingRuns, setLiveRuns]
  );

  const requestWebBenchPackStop = useCallback(
    (tabId: string) => setStoppingRuns((current) => ({ ...current, [tabId]: true })),
    [setStoppingRuns]
  );

  return { handleWebPackRunSummarySaved, startWebBenchPackState, stopWebBenchPackState, requestWebBenchPackStop };
}

function removeTabRunState<T>(current: Record<string, T>, tabId: string): Record<string, T> {
  if (!current[tabId]) return current;
  const next = { ...current };
  delete next[tabId];
  return next;
}
