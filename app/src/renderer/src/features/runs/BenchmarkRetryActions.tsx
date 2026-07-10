import { CircleAlert, RotateCcw } from "lucide-react";

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
  onRefreshModelAvailability,
  onRetryCells
}: {
  hasLiveActivity: boolean;
  selectedModelCount: number;
  checkingAvailability: boolean;
  hasRunSummary: boolean;
  canRetryResultCells: boolean;
  providerErrorRetryCells: RetryScenarioCell[];
  failedRetryCells: RetryScenarioCell[];
  onRefreshModelAvailability: () => void;
  onRetryCells: (cells: RetryScenarioCell[], label: string) => void;
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
      </div>
    </div>
  );
}
