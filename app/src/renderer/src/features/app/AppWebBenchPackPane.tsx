import { WebBenchPackSection } from "../benchpacks/WebBenchPackSection";
import { getProviderDisplayName } from "../models/model-config";
import { getModelAvailabilityView } from "../models/model-availability";
import { createSamplingForm } from "../models/SamplingModal";
import { resolveTabModels } from "../runs/run-state";
import type { LoadedHistoryEntry } from "../runs/run-utils";
import type { BenchPackRunSummary, BenchPackInspection, BenchLocalConfig, BenchLocalWorkspaceTab, ModelAvailability } from "@core";
import type { ActiveRunEntry, SamplingModalState, TabModelsModalState } from "./app-state";
import { DEFAULT_BENCHLOCAL_GENERATION } from "./app-state";

type AppWebBenchPackPaneProps = {
  tab: BenchLocalWorkspaceTab;
  activeTabId: string | null;
  draft: BenchLocalConfig;
  inspections: BenchPackInspection[];
  modelAvailabilityById: Record<string, ModelAvailability>;
  checkingModelAvailability: Record<string, true>;
  runSummaries: Record<string, BenchPackRunSummary>;
  loadedHistoryRuns: Record<string, LoadedHistoryEntry>;
  activeRuns: Record<string, ActiveRunEntry>;
  stoppingRuns: Record<string, true>;
  setTabModelsModal: (state: TabModelsModalState | null) => void;
  setSamplingModal: (state: SamplingModalState | null) => void;
  startWebBenchPackState: (tab: BenchLocalWorkspaceTab, inspection: BenchPackInspection) => void;
  stopWebBenchPackState: (tabId: string) => void;
  requestWebBenchPackStop: (tabId: string) => void;
  handleWebPackRunSummarySaved: (tabId: string, summary: BenchPackRunSummary) => Promise<void>;
  clearLoadedHistoryRun: (tabId: string) => void;
};

// Web Bench Pack 的单标签展示与交互编排，避免 App 维护每个标签的 JSX 细节。
export function AppWebBenchPackPane({
  tab,
  activeTabId,
  draft,
  inspections,
  modelAvailabilityById,
  checkingModelAvailability,
  runSummaries,
  loadedHistoryRuns,
  activeRuns,
  stoppingRuns,
  setTabModelsModal,
  setSamplingModal,
  startWebBenchPackState,
  stopWebBenchPackState,
  requestWebBenchPackStop,
  handleWebPackRunSummarySaved,
  clearLoadedHistoryRun
}: AppWebBenchPackPaneProps) {
  if (!tab.benchPackId) {
    return null;
  }

  const inspection = inspections.find((candidate) => candidate.id === tab.benchPackId);

  if (!inspection || (inspection.manifest?.type ?? "table") !== "web") {
    return null;
  }

  const isActive = tab.id === activeTabId;
  const tabRunSummary = runSummaries[tab.id] ?? null;
  const tabLoadedHistory = loadedHistoryRuns[tab.id] ?? null;

  return (
    <div
      className={`tabbed-workspace-pane web-benchpack-pane${isActive ? " is-active" : " is-inactive"}`}
      aria-hidden={!isActive}
    >
      <WebBenchPackSection
        tab={tab}
        inspection={inspection}
        selectedModels={resolveTabModels(tab, draft.models)}
        providers={draft.providers}
        modelAvailabilityById={modelAvailabilityById}
        checkingModelAvailability={checkingModelAvailability}
        getProviderDisplayName={getProviderDisplayName}
        getModelAvailabilityView={getModelAvailabilityView}
        runSummary={tabRunSummary}
        loadedHistory={tabLoadedHistory}
        isRunning={Boolean(activeRuns[tab.id])}
        isStopping={Boolean(stoppingRuns[tab.id])}
        onStartState={() => startWebBenchPackState(tab, inspection)}
        onStopState={() => stopWebBenchPackState(tab.id)}
        onRequestStop={() => requestWebBenchPackStop(tab.id)}
        onEditModels={() =>
          setTabModelsModal({
            tabId: tab.id,
            selections: structuredClone(tab.modelSelections)
          })
        }
        onEditSampling={() =>
          setSamplingModal({
            tabId: tab.id,
            benchPackId: inspection.id,
            benchPackName: inspection.manifest?.name ?? inspection.id,
            defaults: {
              ...DEFAULT_BENCHLOCAL_GENERATION,
              ...(inspection.manifest?.samplingDefaults ?? {})
            },
            form: createSamplingForm(tab.samplingOverrides)
          })
        }
        onHistorySaved={(summary) => void handleWebPackRunSummarySaved(tab.id, summary)}
        onClearHistory={() => clearLoadedHistoryRun(tab.id)}
      />
    </div>
  );
}
