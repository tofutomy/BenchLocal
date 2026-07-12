import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BenchLocalExecutionMode,
  BenchLocalProviderConfig,
  BenchPackInspection,
  BenchPackRunHistoryEntry,
  BenchPackRunSummary,
  ModelAvailability,
} from "@core";
import type { BenchPackVerifierStatus } from "../../../../shared/desktop-api";
import { getTableScrollbarThumbWidth } from "../../shared/components/settings-primitives";
import { getProviderDisplayName, type ResolvedTabModel } from "../models/model-config";
import { BenchmarkResultTable, type ModelHistoryOption } from "./BenchmarkResultTable";
import { BenchmarkRunHeader } from "./BenchmarkRunHeader";
import { BenchmarkScoreboard } from "./BenchmarkScoreboard";
import { BenchmarkUnavailableState } from "./BenchmarkUnavailableState";
import { ResultShareCardModal, type ResultShareCardData } from "./ResultShareCardModal";
import { buildResultShareCardData } from "./share-card-data";
import { createShareCardBlob, renderShareCardPreviewCanvas, SHARE_CARD_PIXEL_HEIGHT, SHARE_CARD_PIXEL_WIDTH } from "./share-card-renderer";
import { ScenarioDetailPanel } from "./ScenarioDetailPanel";
import { TestResultsControls } from "./TestResultsControls";
import {
  EXECUTION_MODE_OPTIONS,
  RUNS_PER_TEST_OPTIONS,
  isProviderErrorResult,
  isRunSummaryComplete,
  normalizeRunsPerTest,
  supportsLiveScenarioColumnFocus,
  type BenchPackRunBlocker,
  type LiveRunState,
  type LoadedHistoryEntry,
  type RetryScenarioCell
} from "./run-utils";
import type { DetailModalState } from "./ResultDetailModal";

export function BenchmarkSection({
  tabId,
  inspection,
  verifierStatus,
  runBlocker,
  selectedModels,
  persistedOperationModelIds,
  onChangeOperationModelIds,
  modelAvailabilityById,
  checkingModelAvailability,
  providers,
  runSummary,
  historyEntries,
  liveRun,
  loadedHistory,
  focusedScenarioId,
  onFocusScenario,
  onEditModels,
  onEditSampling,
  onEditModelAlias,
  executionMode,
  runsPerTest,
  isViewingHistory,
  onChangeExecutionMode,
  onChangeRunsPerTest,
  onOpenHistory,
  isRunning,
  isStopping,
  onOpenVerification,
  onRefreshVerification,
  onRefreshModelAvailability,
  onClearHistory,
  onStartOver,
  onRun,
  onStop,
  onRetryCells,
  onOpenDetail
}: {
  tabId: string;
  inspection: BenchPackInspection;
  verifierStatus: BenchPackVerifierStatus | null;
  runBlocker: BenchPackRunBlocker | null;
  selectedModels: ResolvedTabModel[];
  persistedOperationModelIds?: string[];
  onChangeOperationModelIds: (modelIds: string[]) => void;
  modelAvailabilityById: Record<string, ModelAvailability>;
  checkingModelAvailability: Record<string, true>;
  providers: Record<string, BenchLocalProviderConfig>;
  runSummary: BenchPackRunSummary | null;
  historyEntries: BenchPackRunHistoryEntry[];
  liveRun: LiveRunState | null;
  loadedHistory: LoadedHistoryEntry | null;
  focusedScenarioId: string | null;
  onFocusScenario: (scenarioId: string) => void;
  onEditModels: () => void;
  onEditSampling: () => void;
  onEditModelAlias: (model: ResolvedTabModel) => void;
  executionMode: BenchLocalExecutionMode;
  runsPerTest: number;
  isViewingHistory: boolean;
  onChangeExecutionMode: (executionMode: BenchLocalExecutionMode) => void;
  onChangeRunsPerTest: (runsPerTest: number) => void;
  onOpenHistory: () => void;
  isRunning: boolean;
  isStopping: boolean;
  onOpenVerification: () => void;
  onRefreshVerification: () => void;
  onRefreshModelAvailability: () => void;
  onClearHistory: () => void;
  onStartOver: () => void;
  onRun: (modelIds: string[]) => void;
  onStop: () => void;
  onRetryCells: (cells: RetryScenarioCell[], label: string) => void;
  onOpenDetail: (detail: DetailModalState) => void;
}) {
  const [runModeOpen, setRunModeOpen] = useState(false);
  const [runsPerTestOpen, setRunsPerTestOpen] = useState(false);
  const [shareCardData, setShareCardData] = useState<ResultShareCardData | null>(null);
  const [historySummariesByRunId, setHistorySummariesByRunId] = useState<Record<string, BenchPackRunSummary>>({});
  const [modelHistoryRunIdsByTab, setModelHistoryRunIdsByTab] = useState<Record<string, Record<string, string>>>({});
  const [loadingModelHistories, setLoadingModelHistories] = useState(false);
  const runModeRef = useRef<HTMLDivElement | null>(null);
  const runsPerTestRef = useRef<HTMLDivElement | null>(null);
  const tableScrollViewportRef = useRef<HTMLDivElement | null>(null);
  const tableScrollbarTrackRef = useRef<HTMLDivElement | null>(null);
  const tableScrollbarDragRef = useRef<{
    startX: number;
    startScrollLeft: number;
  } | null>(null);
  const [tableScrollMetrics, setTableScrollMetrics] = useState({
    clientWidth: 0,
    scrollWidth: 0,
    scrollLeft: 0
  });
  const scenarios = inspection.scenarios ?? [];
  const availableModelIds = useMemo(() => selectedModels.map((model) => model.id), [selectedModels]);
  const operationModelIds = persistedOperationModelIds ?? availableModelIds;
  const operationModelIdSet = useMemo(() => new Set(operationModelIds), [operationModelIds]);
  const operationModelCount = selectedModels.filter((model) => operationModelIdSet.has(model.id)).length;
  const selectedHistoryRunIds = modelHistoryRunIdsByTab[tabId] ?? {};
  const modelHistoryOptionsById = useMemo(() => {
    const next: Record<string, ModelHistoryOption[]> = {};
    for (const model of selectedModels) {
      next[model.id] = Object.values(historySummariesByRunId)
        .filter((summary) => Boolean(summary.resultsByModel[model.id]))
        .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
        .map((summary) => ({ runId: summary.runId, startedAt: summary.startedAt, completedAt: summary.completedAt }));
    }
    return next;
  }, [historySummariesByRunId, selectedModels]);
  const displayRunSummary = useMemo(() => {
    const sourceSummaries = selectedModels
      .map((model) => historySummariesByRunId[selectedHistoryRunIds[model.id]])
      .filter((summary): summary is BenchPackRunSummary => Boolean(summary));
    const base = runSummary ?? sourceSummaries[0] ?? null;
    if (!base) return null;

    // 显示摘要按模型组合，允许同一张对比表同时使用不同运行批次的结果。
    const resultsByModel = Object.fromEntries(
      selectedModels.map((model) => {
        const source = historySummariesByRunId[selectedHistoryRunIds[model.id]] ?? runSummary;
        return [model.id, source?.resultsByModel[model.id] ?? []];
      })
    );
    const scores = Object.fromEntries(
      selectedModels.flatMap((model) => {
        const source = historySummariesByRunId[selectedHistoryRunIds[model.id]] ?? runSummary;
        const score = source?.scores[model.id];
        return score ? [[model.id, score]] : [];
      })
    );
    return { ...base, modelCount: selectedModels.length, resultsByModel, scores };
  }, [historySummariesByRunId, runSummary, selectedHistoryRunIds, selectedModels]);
  const currentScenario = scenarios.find((scenario) => scenario.id === focusedScenarioId) ?? scenarios[0] ?? null;
  const highlightedScenarioId = supportsLiveScenarioColumnFocus(executionMode)
    ? currentScenario?.id ?? null
    : focusedScenarioId;
  const hasRetryActivity = (liveRun?.activeCellKeys.length ?? 0) > 0;
  const isReplayMode = loadedHistory?.mode === "replay";
  const isResumableRun = Boolean(runSummary) && !isRunSummaryComplete(runSummary) && !isRunning;
  const canStartOver = isResumableRun && !isViewingHistory && !hasRetryActivity && !isStopping;
  const replayRevealedCellCount = Object.values(liveRun?.resultsByModel ?? {}).reduce(
    (total, results) => total + results.length,
    0
  );
  const replayTotalCellCount = Object.values(runSummary?.resultsByModel ?? {}).reduce(
    (total, results) => total + results.length,
    0
  );
  const currentExecutionModeLabel =
    EXECUTION_MODE_OPTIONS.find((option) => option.value === executionMode)?.label ?? "Run Mode";
  const currentRunsPerTest = normalizeRunsPerTest(runsPerTest);
  const canReplayRun = isReplayMode && Boolean(runSummary) && isRunSummaryComplete(runSummary);
  const runButtonLabel = isRunning
    ? "Stop"
    : canReplayRun
      ? "Replay"
      : isResumableRun
        ? "Resume Test"
        : `Run Selected (${operationModelCount})`;
  const hasLiveActivity = isRunning || hasRetryActivity;
  const hasCompletedReplay =
    isReplayMode &&
    !hasLiveActivity &&
    replayTotalCellCount > 0 &&
    replayRevealedCellCount >= replayTotalCellCount;
  const canStartFreshRun = inspection.status === "ready" && operationModelCount > 0;
  const canResumeRun = Boolean(runSummary) && isResumableRun;
  const isRunButtonDisabled = isRunning
    ? false
    : hasRetryActivity || isStopping || !(canReplayRun || canResumeRun || (!isViewingHistory && canStartFreshRun));
  const hasHorizontalOverflow = tableScrollMetrics.scrollWidth > tableScrollMetrics.clientWidth + 1;
  const stickyColumnShadow = tableScrollMetrics.scrollLeft > 2;
  const scrollbarThumbWidth = hasHorizontalOverflow ? getTableScrollbarThumbWidth(tableScrollMetrics) : 0;
  const scrollbarThumbOffset =
    hasHorizontalOverflow && tableScrollbarTrackRef.current
      ? ((tableScrollMetrics.scrollLeft / Math.max(1, tableScrollMetrics.scrollWidth - tableScrollMetrics.clientWidth)) *
          Math.max(0, tableScrollbarTrackRef.current.clientWidth - scrollbarThumbWidth))
      : 0;
  const completedResultCells = selectedModels.flatMap((model) =>
    scenarios.flatMap((scenario) => {
      const result = displayRunSummary?.resultsByModel[model.id]?.find((candidate) => candidate.scenarioId === scenario.id);
      return result ? [{ modelId: model.id, scenarioId: scenario.id, runId: selectedHistoryRunIds[model.id], result }] : [];
    })
  );
  const providerErrorRetryCells = completedResultCells
    .filter(({ result }) => isProviderErrorResult(result))
    .map(({ modelId, scenarioId, runId }) => ({ modelId, scenarioId, runId }));
  const failedRetryCells = completedResultCells
    .filter(({ result }) => result.status === "fail" && !isProviderErrorResult(result))
    .map(({ modelId, scenarioId, runId }) => ({ modelId, scenarioId, runId }));
  const canRetryResultCells =
    Boolean(runSummary?.runId) && !isReplayMode && !hasLiveActivity && !isStopping && inspection.status === "ready";
  const checkingAvailability = selectedModels.some((model) => Boolean(checkingModelAvailability[model.id]));
  const runSummaryComplete = isRunSummaryComplete(runSummary);
  const runStateClass = isRunning ? "status-live" : runSummary ? runSummaryComplete ? "status-done" : "status-preview" : "status-idle";
  const runStateLabel = hasLiveActivity ? "Live" : runSummary && !runSummaryComplete ? "Incomplete" : runSummary ? "Done" : "Idle";

  useEffect(() => {
    let cancelled = false;
    const loadModelHistories = async () => {
      setLoadingModelHistories(true);
      try {
        const summaries = await Promise.all(
          historyEntries.map((entry) =>
            window.benchlocal.benchPacks.loadHistory({ benchPackId: inspection.id, runId: entry.runId })
          )
        );
        if (cancelled) return;
        setHistorySummariesByRunId(Object.fromEntries(summaries.map((summary) => [summary.runId, summary])));
        setModelHistoryRunIdsByTab((current) => {
          const existing = current[tabId] ?? {};
          const next = { ...existing };
          for (const model of selectedModels) {
            const selectedStillExists = summaries.some(
              (summary) => summary.runId === next[model.id] && Boolean(summary.resultsByModel[model.id])
            );
            if (selectedStillExists) continue;
            const latest = summaries
              .filter((summary) => Boolean(summary.resultsByModel[model.id]))
              .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0];
            if (latest) next[model.id] = latest.runId;
            else delete next[model.id];
          }
          return { ...current, [tabId]: next };
        });
      } catch {
        // 历史列表可能在删除或清理时变化，下一次列表刷新会重新建立模型索引。
      } finally {
        if (!cancelled) setLoadingModelHistories(false);
      }
    };
    void loadModelHistories();
    return () => {
      cancelled = true;
    };
  }, [historyEntries, inspection.id, selectedModels, tabId]);

  useEffect(() => {
    if (!runSummary) return;
    setHistorySummariesByRunId((current) => ({ ...current, [runSummary.runId]: runSummary }));
    setModelHistoryRunIdsByTab((current) => {
      const next = { ...(current[tabId] ?? {}) };
      for (const modelId of Object.keys(runSummary.resultsByModel)) next[modelId] = runSummary.runId;
      return { ...current, [tabId]: next };
    });
  }, [runSummary, tabId]);

  useEffect(() => {
    // 将操作勾选持久化到 Tab，并自动清理已移除模型、补入新模型。
    const existing = persistedOperationModelIds;
    const normalized = existing ? existing.filter((modelId) => availableModelIds.includes(modelId)) : availableModelIds;
    if (!existing || normalized.length !== existing.length || normalized.some((id, index) => id !== existing[index])) {
      onChangeOperationModelIds(normalized);
    }
  }, [availableModelIds, persistedOperationModelIds, onChangeOperationModelIds]);

  useEffect(() => {
    if (!runModeOpen && !runsPerTestOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideRunMode = runModeRef.current?.contains(target);
      const insideRunsPerTest = runsPerTestRef.current?.contains(target);

      if (!insideRunMode) {
        setRunModeOpen(false);
      }

      if (!insideRunsPerTest) {
        setRunsPerTestOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setRunModeOpen(false);
        setRunsPerTestOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [runModeOpen, runsPerTestOpen]);

  useEffect(() => {
    const viewport = tableScrollViewportRef.current;
    if (!viewport) {
      return;
    }

    const updateMetrics = () => {
      setTableScrollMetrics({
        clientWidth: viewport.clientWidth,
        scrollWidth: viewport.scrollWidth,
        scrollLeft: viewport.scrollLeft
      });
    };

    const syncFromViewport = () => {
      updateMetrics();
    };

    updateMetrics();
    viewport.addEventListener("scroll", syncFromViewport);
    window.addEventListener("resize", updateMetrics);

    return () => {
      viewport.removeEventListener("scroll", syncFromViewport);
      window.removeEventListener("resize", updateMetrics);
    };
  }, [selectedModels.length, scenarios.length, runSummary, liveRun]);

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      const viewport = tableScrollViewportRef.current;
      const track = tableScrollbarTrackRef.current;
      const drag = tableScrollbarDragRef.current;

      if (!viewport || !track || !drag) {
        return;
      }

      const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      const maxThumbOffset = Math.max(1, track.clientWidth - getTableScrollbarThumbWidth(tableScrollMetrics));
      const deltaX = event.clientX - drag.startX;
      const nextScrollLeft = Math.min(
        maxScrollLeft,
        Math.max(0, drag.startScrollLeft + (deltaX / maxThumbOffset) * maxScrollLeft)
      );
      viewport.scrollLeft = nextScrollLeft;
    };

    const handleUp = () => {
      tableScrollbarDragRef.current = null;
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [tableScrollMetrics]);

  if (inspection.status !== "ready") {
    return (
      <BenchmarkUnavailableState
        inspection={inspection}
        selectedModelCount={selectedModels.length}
        isRunning={isRunning}
        onEditModels={onEditModels}
      />
    );
  }
  return (
    <section className="workspace-panel">
      <BenchmarkRunHeader
        inspection={inspection}
        selectedModelCount={selectedModels.length}
        operationModelCount={operationModelCount}
        historyEntryCount={historyEntries.length}
        loadedHistory={loadedHistory}
        runBlocker={runBlocker}
        verifierStatus={verifierStatus}
        runStateClass={runStateClass}
        runStateLabel={runStateLabel}
        canStartOver={canStartOver}
        isRunning={isRunning}
        isStopping={isStopping}
        isRunButtonDisabled={isRunButtonDisabled}
        runButtonLabel={runButtonLabel}
        onOpenHistory={onOpenHistory}
        onClearHistory={onClearHistory}
        onStartOver={onStartOver}
        onRun={() => onRun(operationModelIds)}
        onStop={onStop}
        onOpenVerification={onOpenVerification}
        onRefreshVerification={onRefreshVerification}
      />
      <div className="workspace-grid">
        <div className="workspace-document">
          <ScenarioDetailPanel scenario={currentScenario} hasRunSummary={Boolean(runSummary)} />
          <TestResultsControls
            runModeRef={runModeRef}
            runsPerTestRef={runsPerTestRef}
            runModeOpen={runModeOpen}
            runsPerTestOpen={runsPerTestOpen}
            executionMode={executionMode}
            executionModeOptions={EXECUTION_MODE_OPTIONS}
            currentExecutionModeLabel={currentExecutionModeLabel}
            runsPerTestOptions={RUNS_PER_TEST_OPTIONS}
            currentRunsPerTest={currentRunsPerTest}
            hasLiveActivity={hasLiveActivity}
            onToggleRunMode={() => {
              setRunModeOpen((current) => !current);
              setRunsPerTestOpen(false);
            }}
            onToggleRunsPerTest={() => {
              setRunsPerTestOpen((current) => !current);
              setRunModeOpen(false);
            }}
            onChangeExecutionMode={(nextExecutionMode) => {
              onChangeExecutionMode(nextExecutionMode);
              setRunModeOpen(false);
            }}
            onChangeRunsPerTest={(nextRunsPerTest) => {
              onChangeRunsPerTest(nextRunsPerTest);
              setRunsPerTestOpen(false);
            }}
            onEditSampling={onEditSampling}
            onEditModels={onEditModels}
          />
          <BenchmarkResultTable
            tabId={tabId}
            benchPackId={inspection.id}
            scenarios={scenarios}
            selectedModels={selectedModels}
            operationModelIds={operationModelIds}
            onChangeOperationModelIds={onChangeOperationModelIds}
            modelAvailabilityById={modelAvailabilityById}
            checkingModelAvailability={checkingModelAvailability}
            runSummary={displayRunSummary}
            modelHistoryOptionsById={modelHistoryOptionsById}
            loadingModelHistories={loadingModelHistories}
            selectedHistoryRunIds={selectedHistoryRunIds}
            onSelectModelHistory={(modelId, runId) =>
              setModelHistoryRunIdsByTab((current) => ({
                ...current,
                [tabId]: { ...(current[tabId] ?? {}), [modelId]: runId }
              }))
            }
            liveRun={liveRun}
            isReplayMode={isReplayMode}
            isViewingHistory={isViewingHistory}
            highlightedScenarioId={highlightedScenarioId}
            stickyColumnShadow={stickyColumnShadow}
            hasHorizontalOverflow={hasHorizontalOverflow}
            scrollbarThumbWidth={scrollbarThumbWidth}
            scrollbarThumbOffset={scrollbarThumbOffset}
            hasLiveActivity={hasLiveActivity}
            checkingAvailability={checkingAvailability}
            canRetryResultCells={canRetryResultCells}
            providerErrorRetryCells={providerErrorRetryCells.filter((cell) => operationModelIdSet.has(cell.modelId))}
            failedRetryCells={failedRetryCells.filter((cell) => operationModelIdSet.has(cell.modelId))}
            tableScrollViewportRef={tableScrollViewportRef}
            tableScrollbarTrackRef={tableScrollbarTrackRef}
            tableScrollbarDragRef={tableScrollbarDragRef}
            historyEntryCount={historyEntries.length}
            onOpenHistory={onOpenHistory}
            onEditModels={onEditModels}
            onEditModelAlias={onEditModelAlias}
            onFocusScenario={onFocusScenario}
            onRefreshModelAvailability={onRefreshModelAvailability}
            onRetryCells={onRetryCells}
            onOpenDetail={onOpenDetail}
          />
          {displayRunSummary && !hasLiveActivity && (!isReplayMode || hasCompletedReplay) ? (
            <BenchmarkScoreboard
              runSummary={displayRunSummary}
              selectedModels={selectedModels}
              providers={providers}
              executionMode={executionMode}
              executionModeOptions={EXECUTION_MODE_OPTIONS}
              currentExecutionModeLabel={currentExecutionModeLabel}
              getProviderDisplayName={getProviderDisplayName}
              buildShareCardData={buildResultShareCardData}
              onShare={setShareCardData}
            />
          ) : null}
        </div>
      </div>
      {shareCardData ? (
        <ResultShareCardModal
          data={shareCardData}
          pixelWidth={SHARE_CARD_PIXEL_WIDTH}
          pixelHeight={SHARE_CARD_PIXEL_HEIGHT}
          onClose={() => setShareCardData(null)}
          renderCanvas={renderShareCardPreviewCanvas}
          createBlob={createShareCardBlob}
        />
      ) : null}
    </section>
  );
}
