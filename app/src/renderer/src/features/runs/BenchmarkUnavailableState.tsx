import { Bot, CircleAlert } from "lucide-react";
import type { BenchPackInspection } from "@core";

function statusClasses(status: BenchPackInspection["status"]): string {
  switch (status) {
    case "ready":
      return "status-done";
    case "not_installed":
    case "manifest_missing":
    case "entry_missing":
      return "status-fail";
    case "incompatible":
    case "invalid_manifest":
    case "load_error":
      return "status-preview";
    default:
      return "status-idle";
  }
}

export function BenchmarkUnavailableState({
  inspection,
  selectedModelCount,
  isRunning,
  onEditModels
}: {
  inspection: BenchPackInspection;
  selectedModelCount: number;
  isRunning: boolean;
  onEditModels: () => void;
}) {
  const statusLabel = inspection.status.replaceAll("_", " ");
  const benchPackName = inspection.manifest?.name ?? inspection.id;

  return (
    <section className="workspace-panel">
      <div className="workspace-toolbar">
        <div className="workspace-toolbar-copy">
          <p className="eyebrow">Bench Pack Session</p>
          <div className="workspace-toolbar-heading">
            <div className="workspace-toolbar-title">{benchPackName}</div>
            <div className="workspace-stat-chips">
              <span className="status-chip status-preview">{inspection.scenarioCount ?? 0} scenarios</span>
              <span className="status-chip status-idle">{selectedModelCount} models</span>
              <span className="status-chip status-idle">Idle</span>
            </div>
          </div>
        </div>
        <div className="section-actions">
          <button type="button" onClick={onEditModels} className="ghost-button" disabled={isRunning}>
            <Bot size={14} />
            Edit Models
          </button>
          <span className={`status-chip ${statusClasses(inspection.status)}`}>{statusLabel}</span>
        </div>
      </div>

      <div className="empty-workspace benchmark-empty-state">
        <div className="empty-workspace-card benchmark-empty-card">
          <div className="benchmark-empty-icon">
            <CircleAlert size={22} />
          </div>
          <p className="eyebrow">Bench Pack Unavailable</p>
          <h3 className="panel-title" style={{ marginTop: "8px" }}>
            {benchPackName} cannot run yet
          </h3>
          <p className="muted-copy" style={{ marginTop: "10px", maxWidth: "56ch" }}>
            {inspection.error ?? "This Bench Pack is not installed or is missing its BenchLocal runtime entry."}
          </p>
          <div className="category-chip-row" style={{ marginTop: "14px" }}>
            <span className={`status-chip ${statusClasses(inspection.status)}`}>{statusLabel}</span>
            <span className="status-chip status-idle">{selectedModelCount} selected models</span>
          </div>
        </div>
      </div>
    </section>
  );
}
