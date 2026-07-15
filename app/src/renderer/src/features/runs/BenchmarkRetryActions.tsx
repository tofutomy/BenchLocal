import { CircleAlert, Play, RotateCcw, Square } from "lucide-react";

type RetryScenarioCell = {
  modelId: string;
  scenarioId: string;
};

export function BenchmarkRetryActions({
  hasLiveActivity,
  selectedModelCount,
  checkingAvailability,
  hasRunSummary,
  canRetryResultCells,
  providerErrorRetryCells,
  failedRetryCells,
  isRunning,
  isStopping,
  isRunButtonDisabled,
  runButtonLabel,
  onRefreshModelAvailability,
  onRetryCells,
  onRun,
  onStop
}: {
  hasLiveActivity: boolean;
  selectedModelCount: number;
  checkingAvailability: boolean;
  hasRunSummary: boolean;
  canRetryResultCells: boolean;
  providerErrorRetryCells: RetryScenarioCell[];
  failedRetryCells: RetryScenarioCell[];
  isRunning: boolean;
  isStopping: boolean;
  isRunButtonDisabled: boolean;
  runButtonLabel: string;
  onRefreshModelAvailability: () => void;
  onRetryCells: (cells: RetryScenarioCell[], label: string) => void;
  onRun: () => void;
  onStop: () => void;
}) {
  return (
    <div className="table-retry-actions">
      <div className="table-retry-actions-left">
        <button
          type="button"
          className="ghost-button ghost-button-compact"
          disabled={hasLiveActivity || selectedModelCount === 0}
          onClick={onRefreshModelAvailability}
        >
          <RotateCcw size={14} />
          {checkingAvailability ? "Checking..." : "Refresh Status"}
        </button>
      </div>
      <div className="table-retry-actions-right">
        {hasRunSummary ? (
          <>
            <button
              type="button"
              className="ghost-button ghost-button-compact"
              disabled={!canRetryResultCells || providerErrorRetryCells.length === 0}
              onClick={() => onRetryCells(providerErrorRetryCells, "provider errors")}
            >
              <CircleAlert size={14} />
              Retry Provider Errors
            </button>
            <button
              type="button"
              className="ghost-button ghost-button-compact"
              disabled={!canRetryResultCells || failedRetryCells.length === 0}
              onClick={() => onRetryCells(failedRetryCells, "failed results")}
            >
              <RotateCcw size={14} />
              Retry Failed Results
            </button>
          </>
        ) : null}
        {/* 模型列表下方也放 Run，长列表时不必滚回顶部 */}
        <button
          type="button"
          onClick={isRunning ? onStop : onRun}
          disabled={isRunButtonDisabled}
          className={isRunning ? "button-warn" : "primary-button"}
        >
          {isRunning ? <Square size={15} /> : <Play size={15} />}
          {isStopping ? "Stopping..." : runButtonLabel}
        </button>
      </div>
    </div>
  );
}
