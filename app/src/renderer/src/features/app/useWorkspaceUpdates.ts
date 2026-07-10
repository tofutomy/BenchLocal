import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { BenchLocalWorkspaceState, BenchPackRunSummary } from "@core";
import type { LoadedHistoryEntry } from "../runs/run-utils";

type UseWorkspaceUpdatesOptions = {
  setWorkspaceState: Dispatch<SetStateAction<BenchLocalWorkspaceState | null>>;
  setRunSummaries: Dispatch<SetStateAction<Record<string, BenchPackRunSummary>>>;
  setLoadedHistoryRuns: Dispatch<SetStateAction<Record<string, LoadedHistoryEntry>>>;
};

// 处理外部工作区更新，并恢复已持久化运行的历史摘要与展示状态。
export function useWorkspaceUpdates({
  setWorkspaceState,
  setRunSummaries,
  setLoadedHistoryRuns
}: UseWorkspaceUpdatesOptions) {
  useEffect(() => {
    const loadUpdatedWorkspace = async (state: BenchLocalWorkspaceState) => {
      setWorkspaceState(state);
      const persistedRunEntries = await Promise.all(
        Object.values(state.tabs)
          .filter((tab) => tab.benchPackId && tab.loadedRunId)
          .map(async (tab) => {
            try {
              const summary = await window.benchlocal.benchPacks.loadHistory({
                benchPackId: tab.benchPackId as string,
                runId: tab.loadedRunId as string
              });
              return [tab.id, summary] as const;
            } catch {
              return null;
            }
          })
      );

      setRunSummaries((current) => ({
        ...current,
        ...Object.fromEntries(
          persistedRunEntries.filter((entry): entry is readonly [string, BenchPackRunSummary] => entry !== null)
        )
      }));
      setLoadedHistoryRuns((current) => ({
        ...current,
        ...Object.fromEntries(
          persistedRunEntries
            .filter((entry): entry is readonly [string, BenchPackRunSummary] => entry !== null)
            .map(([tabId, summary]) => [
              tabId,
              {
                runId: summary.runId,
                startedAt: summary.startedAt,
                mode: "history" as const
              }
            ])
        )
      }));
    };

    return window.benchlocal.workspaces.onUpdated(({ state }) => {
      void loadUpdatedWorkspace(state);
    });
  }, []);
}
