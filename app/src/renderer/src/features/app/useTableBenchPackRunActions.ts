import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type {
  BenchLocalConfig,
  BenchLocalWorkspaceState,
  BenchLocalWorkspaceTab,
  BenchPackInspection,
  BenchPackRunSummary
} from "@core";
import type { ConfirmDialogState } from "../../shared/components/ConfirmDialog";
import type { SettingsTab } from "../settings/SettingsScene";
import type { ResolvedTabModel } from "../models/model-config";
import { getModelLabelForMessage } from "../models/model-config";
import {
  countStoredRunResults,
  getCellKey,
  isRunSummaryComplete,
  normalizeRunsPerTest,
  supportsLiveScenarioColumnFocus,
  type LiveRunState,
  type LoadedHistoryEntry,
  type RetryScenarioCell
} from "../runs/run-utils";
import {
  buildHistoryModelSelections,
  buildReplayGroups,
  groupRetryCellsForExecutionMode,
  normalizeTabModelSelections,
  resolveHistoryModels,
  resolveTabModels
} from "../runs/run-state";
import { getRequiredVerifierRunBlocker } from "../runs/verifier-status";
import type {
  ActiveRunEntry,
  LiveScenarioFocusState,
  VerifierPreparationModalState
} from "./app-state";
import type { BenchPackVerifierStatus } from "@/shared/desktop-api";

type UseTableBenchPackRunActionsOptions = {
  draft: BenchLocalConfig | null;
  workspaceState: BenchLocalWorkspaceState | null;
  benchPackInspections: BenchPackInspection[];
  activeRuns: Record<string, ActiveRunEntry>;
  loadedHistoryRuns: Record<string, LoadedHistoryEntry>;
  runSummaries: Record<string, BenchPackRunSummary>;
  hasUnsavedChanges: boolean;
  replayRunTokensRef: MutableRefObject<Map<string, symbol>>;
  save: () => Promise<boolean>;
  updateWorkspaceState: (updater: (current: BenchLocalWorkspaceState) => BenchLocalWorkspaceState) => void;
  loadBenchPackInspections: () => Promise<void>;
  loadHistoryForBenchPack: (benchPackId: string) => Promise<void>;
  setError: Dispatch<SetStateAction<string | null>>;
  setAppNotice: Dispatch<SetStateAction<string | null>>;
  setSettingsTab: Dispatch<SetStateAction<SettingsTab>>;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState>>;
  setVerifierStatuses: Dispatch<SetStateAction<Record<string, BenchPackVerifierStatus>>>;
  setVerifierPreparationModal: Dispatch<SetStateAction<VerifierPreparationModalState | null>>;
  setActiveRuns: Dispatch<SetStateAction<Record<string, ActiveRunEntry>>>;
  setStoppingRuns: Dispatch<SetStateAction<Record<string, true>>>;
  setRunSummaries: Dispatch<SetStateAction<Record<string, BenchPackRunSummary>>>;
  setLiveRuns: Dispatch<SetStateAction<Record<string, LiveRunState>>>;
  setLiveScenarioFocus: Dispatch<SetStateAction<Record<string, LiveScenarioFocusState>>>;
  setLoadedHistoryRuns: Dispatch<SetStateAction<Record<string, LoadedHistoryEntry>>>;
};

// 集中表格 Bench Pack 的完整运行生命周期，App 只负责注入跨域依赖与渲染场景。
export function useTableBenchPackRunActions({
  draft,
  workspaceState,
  benchPackInspections,
  activeRuns,
  loadedHistoryRuns,
  runSummaries,
  hasUnsavedChanges,
  replayRunTokensRef,
  save,
  updateWorkspaceState,
  loadBenchPackInspections,
  loadHistoryForBenchPack,
  setError,
  setAppNotice,
  setSettingsTab,
  setSettingsOpen,
  setConfirmDialog,
  setVerifierStatuses,
  setVerifierPreparationModal,
  setActiveRuns,
  setStoppingRuns,
  setRunSummaries,
  setLiveRuns,
  setLiveScenarioFocus,
  setLoadedHistoryRuns
}: UseTableBenchPackRunActionsOptions) {
  const runTab = async (tab: BenchLocalWorkspaceTab) => {
    setError(null);
    setAppNotice(null);

    if (!tab.benchPackId || !draft) {
      setError("Select a Bench Pack for this tab first.");
      return;
    }

    const benchPackId = tab.benchPackId;
    const selectedModels = resolveTabModels(tab, draft.models);
    const inspection = benchPackInspections.find((candidate) => candidate.id === benchPackId);

    if (inspection?.manifest) {
      try {
        const verifierStatusList = await window.benchlocal.verifiers.list();
        const nextVerifierStatuses = Object.fromEntries(verifierStatusList.map((status) => [status.benchPackId, status]));
        setVerifierStatuses(nextVerifierStatuses);

        const runBlocker = getRequiredVerifierRunBlocker(
          inspection.manifest,
          draft.benchpacks[benchPackId],
          nextVerifierStatuses[benchPackId]
        );

        if (runBlocker) {
          setConfirmDialog({
            title: runBlocker.title,
            subtitle: runBlocker.message,
            confirmLabel: runBlocker.actionLabel,
            onConfirm: () => {
              setSettingsTab("verification");
              setSettingsOpen(true);
            }
          });
          return;
        }
      } catch (verifierError) {
        setError(verifierError instanceof Error ? verifierError.message : "Failed to refresh verifier status.");
        return;
      }
    }

    if (selectedModels.length === 0) {
      setError("Select at least one enabled model for this tab before running the Bench Pack.");
      return;
    }

    if (hasUnsavedChanges && !(await save())) return;

    setActiveRuns((current) => ({ ...current, [tab.id]: { benchPackId, mode: "host" } }));
    setStoppingRuns((current) => removeTabRunState(current, tab.id));
    setLiveRuns((current) => ({
      ...current,
      [tab.id]: { events: [], resultsByModel: {}, activeCellKeys: [] }
    }));
    setRunSummaries((current) => removeTabRunState(current, tab.id));
    setLoadedHistoryRuns((current) => removeTabRunState(current, tab.id));

    try {
      const result = await window.benchlocal.benchPacks.run({
        tabId: tab.id,
        benchPackId,
        modelIds: selectedModels.map((model) => model.id),
        executionMode: tab.executionMode,
        runsPerTest: normalizeRunsPerTest(tab.runsPerTest),
        generation: tab.samplingOverrides
      });
      setRunSummaries((current) => ({ ...current, [tab.id]: result }));
      updateLoadedRun(tab.id, result.runId);
      if (!result.cancelled && !isRunSummaryComplete(result)) {
        const completedCells = countStoredRunResults(result);
        setAppNotice(
          completedCells > 0
            ? `Ran available models for ${result.benchPackName}. Resume after starting the remaining model servers.`
            : `No selected models are online for ${result.benchPackName}. Start a model server, then resume this test.`
        );
      } else if (!result.cancelled) {
        setAppNotice(`Completed ${result.benchPackName} across ${result.scenarioCount} scenarios and ${result.modelCount} model${result.modelCount === 1 ? "" : "s"}.`);
      }
      await loadBenchPackInspections();
      await loadHistoryForBenchPack(benchPackId);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : `Failed to run Bench Pack for ${benchPackId}.`);
    } finally {
      clearHostRunState(tab.id, true);
    }
  };

  const resetTabRunState = (tab: BenchLocalWorkspaceTab) => {
    setError(null);
    setAppNotice(null);
    setRunSummaries((current) => removeTabRunState(current, tab.id));
    setLiveRuns((current) => removeTabRunState(current, tab.id));
    setLoadedHistoryRuns((current) => removeTabRunState(current, tab.id));
    updateLoadedRun(tab.id, null);
    setAppNotice(`Reset "${tab.title}" to a fresh run state.`);
  };

  const resumeTabRun = async (tab: BenchLocalWorkspaceTab, runSummary: BenchPackRunSummary) => {
    setError(null);
    setAppNotice(null);

    if (!tab.benchPackId || !draft) {
      setError("Select a Bench Pack for this tab first.");
      return;
    }
    if (isRunSummaryComplete(runSummary)) {
      setError("This saved run is already complete.");
      return;
    }

    const benchPackId = tab.benchPackId;
    const previousLoadedHistory = loadedHistoryRuns[tab.id] ?? null;
    const previousTabModelSelections = structuredClone(tab.modelSelections);
    const previousExecutionMode = tab.executionMode;

    if (hasUnsavedChanges && !(await save())) return;

    const historicalSelections = buildHistoryModelSelections(runSummary, draft.models);
    updateWorkspaceState((current) => {
      const nextTab = current.tabs[tab.id];
      if (!nextTab) return current;
      nextTab.modelSelections = normalizeTabModelSelections(historicalSelections);
      nextTab.executionMode = runSummary.executionMode ?? nextTab.executionMode;
      nextTab.updatedAt = new Date().toISOString();
      return current;
    });

    setLoadedHistoryRuns((current) => removeTabRunState(current, tab.id));
    setActiveRuns((current) => ({ ...current, [tab.id]: { benchPackId, mode: "host" } }));
    setStoppingRuns((current) => removeTabRunState(current, tab.id));
    setLiveRuns((current) => ({
      ...current,
      [tab.id]: { runId: runSummary.runId, events: [], resultsByModel: {}, activeCellKeys: [] }
    }));

    try {
      const result = await window.benchlocal.benchPacks.resumeRun({
        tabId: tab.id,
        benchPackId,
        runId: runSummary.runId,
        executionMode: runSummary.executionMode ?? tab.executionMode,
        runsPerTest: normalizeRunsPerTest(runSummary.runsPerTest ?? tab.runsPerTest),
        generation: tab.samplingOverrides
      });
      setRunSummaries((current) => ({ ...current, [tab.id]: result }));
      updateLoadedRun(tab.id, result.runId);
      if (!result.cancelled) {
        setAppNotice(
          isRunSummaryComplete(result)
            ? `Completed ${result.benchPackName} across ${result.scenarioCount} scenarios and ${result.modelCount} model${result.modelCount === 1 ? "" : "s"}.`
            : `Resumed ${result.benchPackName}, but the run is still incomplete.`
        );
      }
      await loadBenchPackInspections();
      await loadHistoryForBenchPack(benchPackId);
    } catch (runError) {
      updateWorkspaceState((current) => {
        const nextTab = current.tabs[tab.id];
        if (!nextTab) return current;
        nextTab.modelSelections = structuredClone(previousTabModelSelections);
        nextTab.executionMode = previousExecutionMode;
        nextTab.updatedAt = new Date().toISOString();
        return current;
      });
      if (previousLoadedHistory) {
        setLoadedHistoryRuns((current) => ({ ...current, [tab.id]: previousLoadedHistory }));
      }
      setError(runError instanceof Error ? runError.message : `Failed to resume Bench Pack for ${benchPackId}.`);
    } finally {
      clearHostRunState(tab.id);
    }
  };

  const replayTabRun = async (tab: BenchLocalWorkspaceTab, runSummary: BenchPackRunSummary) => {
    if (!tab.benchPackId) {
      setError("Select a Bench Pack for this tab first.");
      return;
    }
    if (!isRunSummaryComplete(runSummary)) {
      setError("Replay is only available for completed test runs.");
      return;
    }

    const inspection = benchPackInspections.find((candidate) => candidate.id === tab.benchPackId);
    const scenarios = inspection?.scenarios ?? [];
    const modelIds = resolveHistoryModels(runSummary, draft?.models ?? []).map((model) => model.id);
    const replayGroups = buildReplayGroups(runSummary, scenarios, modelIds);
    const token = Symbol(`replay:${tab.id}`);
    replayRunTokensRef.current.set(tab.id, token);

    setError(null);
    setAppNotice(null);
    setActiveRuns((current) => ({ ...current, [tab.id]: { benchPackId: tab.benchPackId as string, mode: "replay" } }));
    setStoppingRuns((current) => removeTabRunState(current, tab.id));
    setLiveRuns((current) => ({
      ...current,
      [tab.id]: { runId: runSummary.runId, events: [], resultsByModel: {}, activeCellKeys: [] }
    }));
    setLiveScenarioFocus((current) => ({
      ...current,
      [tab.id]: { liveScenarioId: null, autoFollow: supportsLiveScenarioColumnFocus(runSummary.executionMode ?? tab.executionMode) }
    }));

    try {
      for (const group of replayGroups) {
        if (replayRunTokensRef.current.get(tab.id) !== token) return;

        const nextActiveCellKeys = group.map((cell) => getCellKey(cell.modelId, cell.scenarioId));
        const leadScenarioId = group[0]?.scenarioId ?? null;
        setLiveRuns((current) => {
          const existing = current[tab.id];
          return {
            ...current,
            [tab.id]: {
              runId: runSummary.runId,
              events: existing?.events ?? [],
              resultsByModel: existing?.resultsByModel ?? {},
              activeCellKeys: nextActiveCellKeys
            }
          };
        });
        if (leadScenarioId && supportsLiveScenarioColumnFocus(runSummary.executionMode ?? tab.executionMode)) {
          setLiveScenarioFocus((current) => ({
            ...current,
            [tab.id]: { liveScenarioId: leadScenarioId, autoFollow: true }
          }));
        }
        await wait(1000);
        if (replayRunTokensRef.current.get(tab.id) !== token) return;

        setLiveRuns((current) => {
          const existing = current[tab.id];
          const nextResultsByModel = { ...(existing?.resultsByModel ?? {}) };
          for (const cell of group) {
            nextResultsByModel[cell.modelId] = [
              ...(nextResultsByModel[cell.modelId] ?? []).filter((candidate) => candidate.scenarioId !== cell.scenarioId),
              cell.result
            ];
          }
          return {
            ...current,
            [tab.id]: { runId: runSummary.runId, events: existing?.events ?? [], resultsByModel: nextResultsByModel, activeCellKeys: [] }
          };
        });
      }
      setAppNotice(`Replayed ${runSummary.benchPackName}.`);
    } finally {
      if (replayRunTokensRef.current.get(tab.id) === token) replayRunTokensRef.current.delete(tab.id);
      setActiveRuns((current) => removeTabRunState(current, tab.id));
      setStoppingRuns((current) => removeTabRunState(current, tab.id));
    }
  };

  const stopTabRun = async (tabId: string) => {
    const activeRun = activeRuns[tabId];
    if (activeRun?.mode === "replay") {
      replayRunTokensRef.current.delete(tabId);
      setActiveRuns((current) => removeTabRunState(current, tabId));
      setStoppingRuns((current) => removeTabRunState(current, tabId));
      setLiveRuns((current) => ({
        ...current,
        [tabId]: { ...(current[tabId] ?? { events: [], resultsByModel: {}, activeCellKeys: [] }), activeCellKeys: [] }
      }));
      setAppNotice("Stopped replay.");
      return;
    }

    setStoppingRuns((current) => ({ ...current, [tabId]: true }));
    try {
      const result = await window.benchlocal.benchPacks.stop({ tabId });
      if (!result.stopped) {
        setAppNotice("That Bench Pack run was no longer active.");
        setActiveRuns((current) => removeTabRunState(current, tabId));
        setStoppingRuns((current) => removeTabRunState(current, tabId));
      }
      // 主进程会发送取消完成事件，避免在这里重复提示停止成功。
    } catch (stopError) {
      setStoppingRuns((current) => removeTabRunState(current, tabId));
      setError(stopError instanceof Error ? stopError.message : "Failed to stop Bench Pack run.");
    }
  };

  const retryScenarioCells = async (
    tab: BenchLocalWorkspaceTab,
    inspection: BenchPackInspection,
    models: ResolvedTabModel[],
    cells: RetryScenarioCell[],
    label: string
  ) => {
    if (cells.length === 0 || !workspaceState) return;
    if (!tab.benchPackId) {
      setError("This tab does not have a Bench Pack selected.");
      return;
    }
    const benchPackId = tab.benchPackId;
    const summary = runSummaries[tab.id];
    if (!summary?.runId) {
      setError("Run this Bench Pack before retrying individual results.");
      return;
    }
    if (hasUnsavedChanges && !(await save())) return;

    const activeCellKeys = cells.map((cell) => getCellKey(cell.modelId, cell.scenarioId));
    setLiveRuns((current) => {
      const existing = current[tab.id];
      const mergedActiveKeys = Array.from(new Set([...(existing?.activeCellKeys ?? []), ...activeCellKeys]));
      return {
        ...current,
        [tab.id]: {
          runId: existing?.runId ?? summary.runId,
          events: existing?.events ?? [],
          resultsByModel: existing?.resultsByModel ?? {},
          activeCellKeys: mergedActiveKeys
        }
      };
    });

    const retryGroups = groupRetryCellsForExecutionMode(cells, tab.executionMode, inspection.scenarios ?? [], models);
    const failures: string[] = [];
    const retryCell = async (cell: RetryScenarioCell) => {
      try {
        await window.benchlocal.benchPacks.retryScenario({
          tabId: tab.id,
          benchPackId: benchPackId,
          runId: summary.runId,
          scenarioId: cell.scenarioId,
          modelId: cell.modelId,
          runsPerTest: normalizeRunsPerTest(tab.runsPerTest),
          generation: tab.samplingOverrides
        });
      } catch {
        failures.push(`${getModelLabelForMessage(cell.modelId, models)} / ${cell.scenarioId}`);
      }
    };

    try {
      for (const group of retryGroups) await Promise.all(group.map((cell) => retryCell(cell)));
      const refreshedSummary = await window.benchlocal.benchPacks.loadHistory({ benchPackId: benchPackId, runId: summary.runId });
      if (!activeRuns[tab.id]) setRunSummaries((current) => ({ ...current, [tab.id]: refreshedSummary }));
      await loadHistoryForBenchPack(benchPackId);
      setAppNotice(`Retried ${cells.length - failures.length}/${cells.length} ${label}.`);
      if (failures.length > 0) {
        setError(`Some retries did not complete: ${failures.slice(0, 3).join(", ")}${failures.length > 3 ? "..." : ""}`);
      }
    } finally {
      setLiveRuns((current) => {
        const existing = current[tab.id];
        if (!existing) return current;
        return { ...current, [tab.id]: { ...existing, activeCellKeys: existing.activeCellKeys.filter((key) => !activeCellKeys.includes(key)) } };
      });
    }
  };

  const updateLoadedRun = (tabId: string, runId: string | null) => {
    updateWorkspaceState((current) => {
      const nextTab = current.tabs[tabId];
      if (!nextTab) return current;
      nextTab.loadedRunId = runId;
      nextTab.updatedAt = new Date().toISOString();
      return current;
    });
  };

  const clearHostRunState = (tabId: string, clearLoadedHistory = false) => {
    setVerifierPreparationModal((current) => (current?.tabId === tabId ? null : current));
    setActiveRuns((current) => removeTabRunState(current, tabId));
    setStoppingRuns((current) => removeTabRunState(current, tabId));
    setLiveRuns((current) => removeTabRunState(current, tabId));
    if (clearLoadedHistory) {
      setLoadedHistoryRuns((current) => removeTabRunState(current, tabId));
    }
  };

  return { runTab, resetTabRunState, resumeTabRun, replayTabRun, stopTabRun, retryScenarioCells };
}

function removeTabRunState<T>(current: Record<string, T>, tabId: string): Record<string, T> {
  if (!current[tabId]) return current;
  const next = { ...current };
  delete next[tabId];
  return next;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
