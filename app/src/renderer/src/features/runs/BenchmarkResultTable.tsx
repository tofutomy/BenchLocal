import { type MutableRefObject, type RefObject } from "react";
import { formatDurationMs } from "./duration-format";
import { CircleAlert } from "lucide-react";
import type {
  BenchLocalModelConfig,
  ModelAvailability,
  ScenarioMeta,
  ScenarioResult,
  BenchPackRunSummary
} from "@core";
import { NoModelsCallout } from "./NoModelsCallout";
import { BenchmarkRetryActions } from "./BenchmarkRetryActions";
import { getModelAvailabilityView, type ModelAvailabilityView } from "../models/model-availability";
import { isProviderErrorResult, type LiveRunState, type RetryScenarioCell } from "./run-utils";
import type { DetailModalState } from "./ResultDetailModal";

type ResultTableModel = BenchLocalModelConfig & {
  displayLabel: string;
  alias?: string;
};

export type ModelHistoryOption = {
  runId: string;
  startedAt: string;
  completedAt: string;
};



function modelAvailabilityChipClass(availability: ModelAvailabilityView): string {
  switch (availability.status) {
    case "online":
      return "is-online";
    case "offline":
      return "is-offline";
    case "checking":
      return "is-checking";
    case "unknown":
    default:
      return "is-unknown";
  }
}

function modelAvailabilityLabel(availability: ModelAvailabilityView): string {
  switch (availability.status) {
    case "online":
      return "online";
    case "offline":
      return "offline";
    case "checking":
      return "checking";
    case "unknown":
    default:
      return "unknown";
  }
}

function modelAvailabilityTitle(availability: ModelAvailabilityView): string {
  const label = modelAvailabilityLabel(availability);
  return availability.details ? `${label}: ${availability.details}` : label;
}

function formatModelHistoryTime(value: string): string {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function BenchmarkResultTable({
  tabId,
  benchPackId,
  scenarios,
  selectedModels,
  operationModelIds,
  onChangeOperationModelIds,
  modelHistoryOptionsById,
  loadingModelHistories,
  selectedHistoryRunIds,
  onSelectModelHistory,
  modelAvailabilityById,
  checkingModelAvailability,
  runSummary,
  liveRun,
  isReplayMode,
  isViewingHistory,
  highlightedScenarioId,
  stickyColumnShadow,
  hasHorizontalOverflow,
  scrollbarThumbWidth,
  scrollbarThumbOffset,
  hasLiveActivity,
  checkingAvailability,
  canRetryResultCells,
  providerErrorRetryCells,
  failedRetryCells,
  tableScrollViewportRef,
  tableScrollbarTrackRef,
  tableScrollbarDragRef,
  historyEntryCount,
  onOpenHistory,
  onEditModels,
  onEditModelAlias,
  onFocusScenario,
  onRefreshModelAvailability,
  onRetryCells,
  isRunning,
  isStopping,
  isRunButtonDisabled,
  runButtonLabel,
  onRun,
  onStop,
  onOpenDetail
}: {
  tabId: string;
  benchPackId: string;
  scenarios: ScenarioMeta[];
  selectedModels: ResultTableModel[];
  operationModelIds: string[];
  onChangeOperationModelIds: (modelIds: string[]) => void;
  modelHistoryOptionsById: Record<string, ModelHistoryOption[]>;
  loadingModelHistories: boolean;
  selectedHistoryRunIds: Record<string, string>;
  onSelectModelHistory: (modelId: string, runId: string) => void;
  modelAvailabilityById: Record<string, ModelAvailability>;
  checkingModelAvailability: Record<string, true>;
  runSummary: BenchPackRunSummary | null;
  liveRun: LiveRunState | null;
  isReplayMode: boolean;
  isViewingHistory: boolean;
  highlightedScenarioId: string | null;
  stickyColumnShadow: boolean;
  hasHorizontalOverflow: boolean;
  scrollbarThumbWidth: number;
  scrollbarThumbOffset: number;
  hasLiveActivity: boolean;
  checkingAvailability: boolean;
  canRetryResultCells: boolean;
  providerErrorRetryCells: RetryScenarioCell[];
  failedRetryCells: RetryScenarioCell[];
  tableScrollViewportRef: RefObject<HTMLDivElement | null>;
  tableScrollbarTrackRef: RefObject<HTMLDivElement | null>;
  tableScrollbarDragRef: MutableRefObject<{ startX: number; startScrollLeft: number } | null>;
  historyEntryCount: number;
  onOpenHistory: () => void;
  onEditModels: () => void;
  onEditModelAlias: (model: ResultTableModel) => void;
  onFocusScenario: (scenarioId: string) => void;
  onRefreshModelAvailability: () => void;
  onRetryCells: (cells: RetryScenarioCell[], label: string) => void;
  isRunning: boolean;
  isStopping: boolean;
  isRunButtonDisabled: boolean;
  runButtonLabel: string;
  onRun: () => void;
  onStop: () => void;
  onOpenDetail: (detail: DetailModalState) => void;
}) {
  const operationModelIdSet = new Set(operationModelIds);
  const allOperationModelsSelected = selectedModels.length > 0 && selectedModels.every((model) => operationModelIdSet.has(model.id));

  const toggleOperationModel = (modelId: string, selected: boolean) => {
    const next = new Set(operationModelIds);
    if (selected) next.add(modelId);
    else next.delete(modelId);
    onChangeOperationModelIds(selectedModels.map((model) => model.id).filter((id) => next.has(id)));
  };

  function renderResultCell(modelId: string, scenarioId: string) {
    const liveResult = liveRun?.resultsByModel[modelId]?.find((candidate) => candidate.scenarioId === scenarioId);
    const persistedResult = isReplayMode
      ? undefined
      : runSummary?.resultsByModel[modelId]?.find((candidate) => candidate.scenarioId === scenarioId);
    const result = liveResult ?? persistedResult;
    const model = selectedModels.find((candidate) => candidate.id === modelId);
    const isActive = liveRun?.activeCellKeys.includes(`${modelId}::${scenarioId}`) ?? false;

    if (isActive) {
      return (
        <div className="result-icon-shell result-loading">
          <span className="spinner" />
        </div>
      );
    }

    if (!result) {
      return (
        <div className={`result-icon-shell ${isActive ? "result-loading" : "result-idle"}`}>
          {isActive ? <span className="spinner" /> : <span style={{ fontSize: "0.75rem" }}>-</span>}
        </div>
      );
    }

    const isProviderError = isProviderErrorResult(result);
    const tone = isProviderError
      ? "result-provider-error"
      : result.status === "pass" ? "result-pass" : result.status === "partial" ? "result-partial" : "result-fail";
    const durationLabel = formatDurationMs(result.timings?.durationMs);
    const resultLabel = isProviderError ? "provider error" : result.status;

    return (
      <button
        type="button"
        onClick={() =>
          onOpenDetail({
            tabId,
            runId: liveRun?.runId ?? selectedHistoryRunIds[modelId] ?? runSummary?.runId ?? null,
            benchPackId,
            modelId,
            modelLabel: model?.displayLabel ?? model?.label,
            scenarioId,
            summary: result.summary,
            rawLog: result.rawLog,
            status: result.status,
            errorType: result.errorType,
            retryable: result.retryable,
            timings: result.timings
          })
        }
        className={`result-icon-button ${tone}${durationLabel ? " has-duration" : ""}`}
        title={durationLabel ? `${resultLabel} · ${durationLabel}` : resultLabel}
      >
        <span className="result-icon-mark">
          {isProviderError ? <CircleAlert size={14} strokeWidth={2.4} /> : result.status === "pass" ? "✓" : result.status === "partial" ? "!" : "×"}
        </span>
        {durationLabel ? <span className="result-duration">{durationLabel}</span> : null}
      </button>
    );
  }

  return (
    <section className="table-card table-card-document">
      {selectedModels.length === 0 ? (
        <NoModelsCallout
          historyEntryCount={historyEntryCount}
          hasLiveActivity={hasLiveActivity}
          onOpenHistory={onOpenHistory}
          onEditModels={onEditModels}
        />
      ) : (
        <>
          <div ref={tableScrollViewportRef} className="table-scroll">
            <table className="result-table">
              <colgroup>
                <col className="model-column" />
                <col className="history-column" />
                {scenarios.map((scenario) => (
                  <col key={scenario.id} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className={`scenario-row-label${stickyColumnShadow ? " has-scroll-shadow" : ""}`}>
                    <label className="model-operation-heading">
                      <input
                        type="checkbox"
                        aria-label="Select all comparison models for this operation"
                        checked={allOperationModelsSelected}
                        disabled={hasLiveActivity}
                        onChange={(event) =>
                          onChangeOperationModelIds(event.target.checked ? selectedModels.map((model) => model.id) : [])
                        }
                      />
                      <span>Model</span>
                    </label>
                  </th>
                  <th className="history-column-heading">History</th>
                  {scenarios.map((scenario) => (
                    <th
                      key={scenario.id}
                      className={`${scenario.id === highlightedScenarioId ? "active-column selected-column" : ""}`}
                    >
                      <div className="column-heading">
                        <button
                          type="button"
                          onClick={() => onFocusScenario(scenario.id)}
                          className="column-button"
                          title={`${scenario.id} · ${scenario.title}`}
                        >
                          <span className="scenario-id">{scenario.id}</span>
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedModels.map((model) => {
                  const availability = getModelAvailabilityView(model, modelAvailabilityById, checkingModelAvailability);

                  return (
                    <tr key={model.id}>
                      <td className={`scenario-row-label${stickyColumnShadow ? " has-scroll-shadow" : ""}`}>
                        <div className="model-cell">
                          <input
                            type="checkbox"
                            className="model-operation-checkbox"
                            aria-label={`Select ${model.displayLabel} for this operation`}
                            checked={operationModelIdSet.has(model.id)}
                            disabled={hasLiveActivity}
                            onChange={(event) => toggleOperationModel(model.id, event.target.checked)}
                          />
                          {isViewingHistory ? (
                            <div className="model-badge-wrap">
                              <span
                                className={`model-availability-dot ${modelAvailabilityChipClass(availability)}`}
                                title={modelAvailabilityTitle(availability)}
                              />
                              <div
                                className={`model-badge${isReplayMode ? "" : " model-badge-history"}`}
                                title={
                                  isReplayMode
                                    ? "Replay mode uses the models from the saved run."
                                    : "This history view uses the models from the saved run."
                                }
                              >
                                {model.displayLabel}
                              </div>
                            </div>
                          ) : (
                            <div className="model-badge-wrap">
                              <span
                                className={`model-availability-dot ${modelAvailabilityChipClass(availability)}`}
                                title={modelAvailabilityTitle(availability)}
                              />
                              <button
                                type="button"
                                className="model-badge model-badge-button"
                                onClick={() => onEditModelAlias(model)}
                                title="Edit model alias"
                              >
                                {model.displayLabel}
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="model-history-cell">
                        <select
                          className="model-history-select"
                          aria-label={`Select history for ${model.displayLabel}`}
                          value={selectedHistoryRunIds[model.id] ?? ""}
                          disabled={hasLiveActivity || loadingModelHistories || (modelHistoryOptionsById[model.id]?.length ?? 0) === 0}
                          onChange={(event) => onSelectModelHistory(model.id, event.target.value)}
                        >
                          {loadingModelHistories ? (
                            <option value="">Loading history...</option>
                          ) : (modelHistoryOptionsById[model.id]?.length ?? 0) === 0 ? (
                            <option value="">No history for this model</option>
                          ) : null}
                          {(modelHistoryOptionsById[model.id] ?? []).map((option) => (
                            <option key={option.runId} value={option.runId}>
                              {formatModelHistoryTime(option.startedAt)}
                            </option>
                          ))}
                        </select>
                      </td>
                      {scenarios.map((scenario) => (
                        <td
                          key={`${model.id}-${scenario.id}`}
                          className={`result-icon-cell ${scenario.id === highlightedScenarioId ? "active-column" : ""}`}
                        >
                          {renderResultCell(model.id, scenario.id)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {hasHorizontalOverflow ? (
            <div
              ref={tableScrollbarTrackRef}
              className="table-scrollbar"
              aria-hidden="true"
              onMouseDown={(event) => {
                const viewport = tableScrollViewportRef.current;
                const track = tableScrollbarTrackRef.current;

                if (!viewport || !track) {
                  return;
                }

                const rect = track.getBoundingClientRect();
                const clickX = event.clientX - rect.left;

                if (clickX >= scrollbarThumbOffset && clickX <= scrollbarThumbOffset + scrollbarThumbWidth) {
                  return;
                }

                const nextOffset = Math.max(
                  0,
                  Math.min(track.clientWidth - scrollbarThumbWidth, clickX - scrollbarThumbWidth / 2)
                );
                const nextScrollLeft =
                  (nextOffset / Math.max(1, track.clientWidth - scrollbarThumbWidth)) *
                  Math.max(0, viewport.scrollWidth - viewport.clientWidth);
                viewport.scrollLeft = nextScrollLeft;
              }}
            >
              <div
                className="table-scrollbar-thumb"
                style={{
                  width: `${scrollbarThumbWidth}px`,
                  transform: `translateX(${scrollbarThumbOffset}px)`
                }}
                onMouseDown={(event) => {
                  event.preventDefault();
                  const viewport = tableScrollViewportRef.current;

                  if (!viewport) {
                    return;
                  }

                  tableScrollbarDragRef.current = {
                    startX: event.clientX,
                    startScrollLeft: viewport.scrollLeft
                  };
                  document.body.style.userSelect = "none";
                }}
              />
            </div>
          ) : null}
          <BenchmarkRetryActions
            hasLiveActivity={hasLiveActivity}
            selectedModelCount={selectedModels.length}
            checkingAvailability={checkingAvailability}
            hasRunSummary={Boolean(runSummary)}
            canRetryResultCells={canRetryResultCells}
            providerErrorRetryCells={providerErrorRetryCells}
            failedRetryCells={failedRetryCells}
            isRunning={isRunning}
            isStopping={isStopping}
            isRunButtonDisabled={isRunButtonDisabled}
            runButtonLabel={runButtonLabel}
            onRefreshModelAvailability={onRefreshModelAvailability}
            onRetryCells={onRetryCells}
            onRun={onRun}
            onStop={onStop}
          />
        </>
      )}
    </section>
  );
}
