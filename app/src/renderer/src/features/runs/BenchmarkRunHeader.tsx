import { Play, RotateCcw, Square, Wrench } from "lucide-react";
import type { BenchPackInspection } from "@core";
import type { BenchPackVerifierStatus } from "../../../../shared/desktop-api";

type BenchmarkRunBlocker = {
  title: string;
  message: string;
  actionLabel: string;
};

type LoadedBenchmarkHistoryEntry = {
  runId: string;
  startedAt: string;
  mode?: "history" | "replay";
};

function getVerifierStatusTone(status: BenchPackVerifierStatus["verifiers"][number]["status"] | undefined): string {
  switch (status) {
    case "running":
      return "status-ready";
    case "missing_dependency":
      return "status-not-installed";
    case "dependency_not_running":
    case "failed":
      return "status-danger";
    default:
      return "status-idle";
  }
}

export function BenchmarkRunHeader({
  inspection,
  selectedModelCount,
  operationModelCount,
  historyEntryCount,
  loadedHistory,
  runBlocker,
  verifierStatus,
  runStateClass,
  runStateLabel,
  canStartOver,
  isRunning,
  isStopping,
  isRunButtonDisabled,
  runButtonLabel,
  onOpenHistory,
  onClearHistory,
  onStartOver,
  onRun,
  onStop,
  onOpenVerification,
  onRefreshVerification
}: {
  inspection: BenchPackInspection;
  selectedModelCount: number;
  operationModelCount: number;
  historyEntryCount: number;
  loadedHistory: LoadedBenchmarkHistoryEntry | null;
  runBlocker: BenchmarkRunBlocker | null;
  verifierStatus: BenchPackVerifierStatus | null;
  runStateClass: string;
  runStateLabel: string;
  canStartOver: boolean;
  isRunning: boolean;
  isStopping: boolean;
  isRunButtonDisabled: boolean;
  runButtonLabel: string;
  onOpenHistory: () => void;
  onClearHistory: () => void;
  onStartOver: () => void;
  onRun: () => void;
  onStop: () => void;
  onOpenVerification: () => void;
  onRefreshVerification: () => void;
}) {
  return (
    <>
      {loadedHistory && loadedHistory.mode !== "replay" ? (
        <div className="history-banner">
          <div className="banner-row">
            <span>Loaded test history from {new Date(loadedHistory.startedAt).toLocaleString()}.</span>
            <button type="button" className="history-banner-close" onClick={onClearHistory}>
              Close
            </button>
          </div>
        </div>
      ) : null}
      <div className="workspace-toolbar">
        <div className="workspace-toolbar-copy">
          <p className="eyebrow">Bench Pack Session</p>
          <div className="workspace-toolbar-heading">
            <div className="workspace-toolbar-title">{inspection.manifest?.name ?? inspection.id}</div>
            <div className="workspace-stat-chips">
              <span className="status-chip status-preview">{inspection.scenarioCount ?? 0} scenarios</span>
              <span className="status-chip status-idle">{selectedModelCount} compared</span>
              <span className="status-chip status-preview">{operationModelCount} selected to run</span>
              <span className={`status-chip ${runStateClass}`}>{runStateLabel}</span>
            </div>
          </div>
        </div>
        <div className="section-actions">
          <button type="button" className="ghost-button" onClick={onOpenHistory} disabled={historyEntryCount === 0}>
            <RotateCcw size={14} />
            Test Histories
          </button>
          {canStartOver ? (
            <button type="button" className="ghost-button" onClick={onStartOver}>
              <RotateCcw size={14} />
              Start Over
            </button>
          ) : null}
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

      {runBlocker ? (
        <div className="workspace-verifier-warning">
          <div className="workspace-verifier-warning-copy">
            <span className={`status-chip ${getVerifierStatusTone(verifierStatus?.verifiers.find((entry) => entry.required)?.status)}`}>
              Verifier blocked
            </span>
            <div>
              <div className="workspace-verifier-warning-title">{runBlocker.title}</div>
              <div className="settings-row-secondary">{runBlocker.message}</div>
            </div>
          </div>
          <div className="workspace-verifier-warning-actions">
            <button type="button" className="ghost-button ghost-button-compact" onClick={onRefreshVerification}>
              <RotateCcw size={14} />
              Refresh
            </button>
            <button type="button" className="ghost-button ghost-button-compact" onClick={onOpenVerification}>
              <Wrench size={14} />
              Verification
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
