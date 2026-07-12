import type { Dispatch, SetStateAction } from "react";
import type {
  BenchLocalConfig,
  BenchLocalWorkspaceState,
  BenchLocalWorkspaceTab,
  BenchPackInspection,
  BenchPackRunHistoryEntry,
  BenchPackRunSummary,
  ModelAvailability
} from "@core";
import type { BenchPackVerifierStatus } from "@/shared/desktop-api";
import { BenchmarkSection } from "../runs/BenchmarkSection";
import type { DetailModalState } from "../runs/ResultDetailModal";
import {
  isRunSummaryComplete,
  normalizeRunsPerTest,
  supportsLiveScenarioColumnFocus,
  type BenchPackRunBlocker,
  type LiveRunState,
  type LoadedHistoryEntry,
  type RetryScenarioCell
} from "../runs/run-utils";
import { createSamplingForm } from "../models/SamplingModal";
import type { ResolvedTabModel } from "../models/model-config";
import type { SettingsTab } from "../settings/SettingsScene";
import {
  DEFAULT_BENCHLOCAL_GENERATION,
  type HistoryModalState,
  type LiveScenarioFocusState,
  type ModelAliasModalState,
  type SamplingModalState,
  type TabModelsModalState
} from "./app-state";

export function AppTableBenchPackPane({
  activeTab,
  activeInspection,
  draft,
  activeVerifierStatus,
  activeRunBlocker,
  activeDisplayModels,
  modelAvailabilityById,
  checkingModelAvailability,
  activeRunSummary,
  runHistories,
  activeLiveRun,
  activeLoadedHistory,
  activeRuns,
  activeLiveScenarioFocus,
  stoppingRuns,
  setLiveScenarioFocus,
  updateWorkspaceState,
  setTabModelsModal,
  setSamplingModal,
  setHistoryModal,
  setModelAliasModal,
  setSettingsTab,
  setSettingsOpen,
  loadVerifierStatuses,
  refreshModelAvailability,
  clearLoadedHistoryRun,
  resetTabRunState,
  replayTabRun,
  resumeTabRun,
  runTab,
  stopTabRun,
  retryScenarioCells,
  setDetailModal
}: {
  activeTab: BenchLocalWorkspaceTab;
  activeInspection: BenchPackInspection;
  draft: BenchLocalConfig;
  activeVerifierStatus: BenchPackVerifierStatus | null;
  activeRunBlocker: BenchPackRunBlocker | null;
  activeDisplayModels: ResolvedTabModel[];
  modelAvailabilityById: Record<string, ModelAvailability>;
  checkingModelAvailability: Record<string, true>;
  activeRunSummary: BenchPackRunSummary | null;
  runHistories: Record<string, BenchPackRunHistoryEntry[]>;
  activeLiveRun: LiveRunState | null;
  activeLoadedHistory: LoadedHistoryEntry | null;
  activeRuns: Record<string, unknown>;
  activeLiveScenarioFocus: LiveScenarioFocusState | null;
  stoppingRuns: Record<string, true>;
  setLiveScenarioFocus: Dispatch<SetStateAction<Record<string, LiveScenarioFocusState>>>;
  updateWorkspaceState: (updater: (current: BenchLocalWorkspaceState) => BenchLocalWorkspaceState) => void;
  setTabModelsModal: Dispatch<SetStateAction<TabModelsModalState | null>>;
  setSamplingModal: Dispatch<SetStateAction<SamplingModalState | null>>;
  setHistoryModal: Dispatch<SetStateAction<HistoryModalState | null>>;
  setModelAliasModal: Dispatch<SetStateAction<ModelAliasModalState | null>>;
  setSettingsTab: (tab: SettingsTab) => void;
  setSettingsOpen: (open: boolean) => void;
  loadVerifierStatuses: () => Promise<void>;
  refreshModelAvailability: (models: ResolvedTabModel[]) => Promise<void>;
  clearLoadedHistoryRun: (tabId: string) => void;
  resetTabRunState: (tab: BenchLocalWorkspaceTab) => void;
  replayTabRun: (tab: BenchLocalWorkspaceTab, runSummary: BenchPackRunSummary) => Promise<void>;
  resumeTabRun: (tab: BenchLocalWorkspaceTab, runSummary: BenchPackRunSummary) => Promise<void>;
  runTab: (tab: BenchLocalWorkspaceTab, operationModelIds?: string[]) => Promise<void>;
  stopTabRun: (tabId: string) => Promise<void>;
  retryScenarioCells: (
    tab: BenchLocalWorkspaceTab,
    inspection: BenchPackInspection,
    models: ResolvedTabModel[],
    cells: RetryScenarioCell[],
    label: string
  ) => Promise<void>;
  setDetailModal: (detail: DetailModalState) => void;
}) {
  return (
    <div className="tabbed-workspace-pane table-benchpack-pane is-active">
      <BenchmarkSection
        tabId={activeTab.id}
        inspection={activeInspection}
        verifierStatus={activeVerifierStatus}
        runBlocker={activeRunBlocker}
        selectedModels={activeDisplayModels}
        modelAvailabilityById={modelAvailabilityById}
        checkingModelAvailability={checkingModelAvailability}
        providers={draft.providers}
        runSummary={activeRunSummary}
        historyEntries={runHistories[activeInspection.id] ?? []}
        liveRun={activeLiveRun}
        loadedHistory={activeLoadedHistory}
        focusedScenarioId={
          activeRuns[activeTab.id] &&
          supportsLiveScenarioColumnFocus(activeTab.executionMode) &&
          activeLiveScenarioFocus?.autoFollow &&
          activeLiveScenarioFocus.liveScenarioId
            ? activeLiveScenarioFocus.liveScenarioId
            : activeTab.focusedScenarioId
        }
        onFocusScenario={(scenarioId) => {
          if (activeRuns[activeTab.id] && supportsLiveScenarioColumnFocus(activeTab.executionMode)) {
            setLiveScenarioFocus((current) => {
              const existing = current[activeTab.id];
              const liveScenarioId = existing?.liveScenarioId ?? null;

              return {
                ...current,
                [activeTab.id]: {
                  liveScenarioId,
                  autoFollow: liveScenarioId === scenarioId
                }
              };
            });
          }

          updateWorkspaceState((current) => {
            const tab = current.tabs[activeTab.id];
            if (!tab) {
              return current;
            }
            tab.focusedScenarioId = scenarioId;
            tab.updatedAt = new Date().toISOString();
            return current;
          });
        }}
        onEditModels={() =>
          setTabModelsModal({
            tabId: activeTab.id,
            selections: structuredClone(activeTab.modelSelections)
          })
        }
        onEditSampling={() =>
          setSamplingModal({
            tabId: activeTab.id,
            benchPackId: activeInspection.id,
            benchPackName: activeInspection.manifest?.name ?? activeInspection.id,
            defaults: {
              ...DEFAULT_BENCHLOCAL_GENERATION,
              ...(activeInspection.manifest?.samplingDefaults ?? {})
            },
            form: createSamplingForm(activeTab.samplingOverrides)
          })
        }
        executionMode={activeTab.executionMode}
        runsPerTest={normalizeRunsPerTest(activeTab.runsPerTest)}
        isViewingHistory={Boolean(activeLoadedHistory)}
        onOpenHistory={() =>
          setHistoryModal({
            benchPackId: activeInspection.id,
            benchPackName: activeInspection.manifest?.name ?? activeInspection.id,
            entries: runHistories[activeInspection.id] ?? []
          })
        }
        onEditModelAlias={(model) =>
          setModelAliasModal({
            tabId: activeTab.id,
            modelId: model.id,
            baseLabel: model.label,
            alias: model.alias ?? ""
          })
        }
        onChangeExecutionMode={(executionMode) =>
          updateWorkspaceState((current) => {
            const tab = current.tabs[activeTab.id];
            if (!tab) {
              return current;
            }
            tab.executionMode = executionMode;
            tab.updatedAt = new Date().toISOString();
            return current;
          })
        }
        onChangeRunsPerTest={(runsPerTest) =>
          updateWorkspaceState((current) => {
            const tab = current.tabs[activeTab.id];
            if (!tab) {
              return current;
            }
            tab.runsPerTest = runsPerTest;
            tab.updatedAt = new Date().toISOString();
            return current;
          })
        }
        isRunning={Boolean(activeRuns[activeTab.id])}
        isStopping={Boolean(stoppingRuns[activeTab.id])}
        onOpenVerification={() => {
          setSettingsTab("verification");
          setSettingsOpen(true);
        }}
        onRefreshVerification={() => void loadVerifierStatuses()}
        onRefreshModelAvailability={() => void refreshModelAvailability(activeDisplayModels)}
        onClearHistory={() => clearLoadedHistoryRun(activeTab.id)}
        onStartOver={() => resetTabRunState(activeTab)}
        onRun={(operationModelIds) =>
          void (
            activeLoadedHistory?.mode === "replay" && activeRunSummary
              ? replayTabRun(activeTab, activeRunSummary)
              : activeRunSummary && !isRunSummaryComplete(activeRunSummary)
              ? resumeTabRun(activeTab, activeRunSummary)
              : runTab(activeTab, operationModelIds)
          )
        }
        onStop={() => void stopTabRun(activeTab.id)}
        onRetryCells={(cells, label) =>
          void retryScenarioCells(activeTab, activeInspection, activeDisplayModels, cells, label)
        }
        onOpenDetail={setDetailModal}
      />
    </div>
  );
}
