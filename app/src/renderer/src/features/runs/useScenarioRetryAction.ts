import type { Dispatch, SetStateAction } from "react";
import type { BenchLocalWorkspaceState, BenchPackRunSummary } from "@core";
import type { ActiveRunEntry } from "../app/app-state";
import { detailModalKey, type DetailModalState } from "./ResultDetailModal";
import { getCellKey, type LiveRunState } from "./run-utils";

type Options = {
  workspaceState: BenchLocalWorkspaceState | null;
  activeRuns: Record<string, ActiveRunEntry>;
  hasUnsavedChanges: boolean;
  save: () => Promise<boolean>;
  loadHistoryForBenchPack: (benchPackId: string) => Promise<void>;
  setDetailModal: Dispatch<SetStateAction<DetailModalState | null>>;
  setLiveRuns: Dispatch<SetStateAction<Record<string, LiveRunState>>>;
  setRunSummaries: Dispatch<SetStateAction<Record<string, BenchPackRunSummary>>>;
  setAppNotice: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
};

// 管理详情弹窗发起的单元格重试及临时活动状态。
export function useScenarioRetryAction(options: Options) {
  const retryScenarioFromDetail = async (detail: DetailModalState) => {
    if (!options.workspaceState) return;
    if (!detail.runId) {
      options.setError("This scenario does not belong to a saved test run yet.");
      return;
    }
    const tab = options.workspaceState.tabs[detail.tabId];
    if (!tab || tab.benchPackId !== detail.benchPackId) {
      options.setError("The original tab for this test is no longer available.");
      return;
    }
    if (options.hasUnsavedChanges && !(await options.save())) return;

    const retryKey = detailModalKey(detail);
    const cellKey = getCellKey(detail.modelId, detail.scenarioId);
    options.setDetailModal((current) => (current && detailModalKey(current) === retryKey ? null : current));
    options.setLiveRuns((current) => {
      const existing = current[detail.tabId];
      return {
        ...current,
        [detail.tabId]: existing
          ? {
              ...existing,
              runId: existing.runId ?? detail.runId ?? undefined,
              activeCellKeys: existing.activeCellKeys.includes(cellKey) ? existing.activeCellKeys : [...existing.activeCellKeys, cellKey]
            }
          : { runId: detail.runId ?? undefined, events: [], resultsByModel: {}, activeCellKeys: [cellKey] }
      };
    });

    try {
      await window.benchlocal.benchPacks.retryScenario({
        tabId: detail.tabId,
        benchPackId: detail.benchPackId,
        runId: detail.runId,
        scenarioId: detail.scenarioId,
        modelId: detail.modelId,
        generation: tab.samplingOverrides
      });
      const summary = await window.benchlocal.benchPacks.loadHistory({ benchPackId: detail.benchPackId, runId: detail.runId });
      if (!options.activeRuns[detail.tabId]) {
        options.setRunSummaries((current) => ({ ...current, [detail.tabId]: summary }));
      }
      await options.loadHistoryForBenchPack(detail.benchPackId);
      options.setAppNotice(`Retested ${detail.scenarioId} for ${detail.modelLabel ?? detail.modelId}.`);
    } catch (error) {
      options.setLiveRuns((current) => {
        const existing = current[detail.tabId];
        if (!existing || !existing.activeCellKeys.includes(cellKey)) return current;
        return { ...current, [detail.tabId]: { ...existing, activeCellKeys: existing.activeCellKeys.filter((key) => key !== cellKey) } };
      });
      options.setError(error instanceof Error ? error.message : "Failed to retry the selected test.");
    }
  };

  return { retryScenarioFromDetail };
}
