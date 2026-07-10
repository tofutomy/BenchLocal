import { RotateCcw } from "lucide-react";
import { formatDurationMs } from "./duration-format";
import type { ScenarioResult } from "@core";
import { Modal } from "../../shared/components/Modal";

export type DetailModalState = {
  tabId: string;
  runId: string | null;
  benchPackId: string;
  modelId: string;
  modelLabel?: string;
  scenarioId: string;
  summary: string;
  rawLog: string;
  status: "pass" | "partial" | "fail";
  errorType?: ScenarioResult["errorType"];
  retryable?: boolean;
  timings?: ScenarioResult["timings"];
};

export function detailModalKey(detail: Pick<DetailModalState, "tabId" | "modelId" | "scenarioId">): string {
  return `${detail.tabId}::${detail.modelId}::${detail.scenarioId}`;
}
function detailStatusClass(detail: DetailModalState): string {
  if (detail.errorType === "provider_error") {
    return "status-idle";
  }

  switch (detail.status) {
    case "pass":
      return "status-done";
    case "partial":
      return "status-not-installed";
    case "fail":
    default:
      return "status-danger";
  }
}

export function ResultDetailModal({
  detail,
  onClose,
  onRetry
}: {
  detail: DetailModalState;
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <Modal
      title={`${detail.benchPackId} · ${detail.scenarioId}`}
      subtitle={`${detail.modelLabel ?? detail.modelId} · ${detail.summary}`}
      onClose={onClose}
      onSubmit={onClose}
      submitLabel="Close"
      leadingActions={
        <button
          type="button"
          className="ghost-button"
          onClick={onRetry}
          disabled={!detail.runId}
        >
          <RotateCcw size={14} />
          Retry
        </button>
      }
    >
      <div className="dialog-summary">
        <div className="dialog-summary-copy">
          <span className="dialog-summary-label">Status</span>
          <span className="dialog-summary-value">
            {detail.errorType === "provider_error" ? "Provider HTTP Error" : "Validation Result"}
          </span>
        </div>
        <span className={`status-chip ${detailStatusClass(detail)}`}>
          {detail.errorType === "provider_error" ? "provider error" : detail.status}
        </span>
      </div>
      {detail.timings?.durationMs !== undefined ? (
        <div className="dialog-summary">
          <div className="dialog-summary-copy">
            <span className="dialog-summary-label">Wall Time</span>
            <span className="dialog-summary-value">
              {formatDurationMs(detail.timings.durationMs)}
            </span>
          </div>
          {detail.timings.completedAt ? (
            <span className="status-chip status-idle">
              {new Date(detail.timings.completedAt).toLocaleTimeString()}
            </span>
          ) : null}
        </div>
      ) : null}
      <pre className="dialog-log">{detail.rawLog}</pre>
    </Modal>
  );
}
