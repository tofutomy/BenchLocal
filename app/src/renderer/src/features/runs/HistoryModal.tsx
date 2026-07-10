import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Trash2, X } from "lucide-react";
import type { BenchLocalExecutionMode, BenchPackRunHistoryEntry } from "@core";
import { SettingsTableShell } from "../../shared/components/settings-primitives";

const EXECUTION_MODE_LABELS: Record<BenchLocalExecutionMode, string> = {
  serial: "Serial per Test Case",
  serial_by_model: "Serial per Model",
  parallel_by_model: "Parallel per Model",
  parallel_by_test_case: "Parallel per Test Case",
  full_parallel: "Parallel for All"
};

export function HistoryModal({
  benchPackName,
  entries,
  onClose,
  onOpenRun,
  onDeleteSelected
}: {
  benchPackName: string;
  entries: BenchPackRunHistoryEntry[];
  onClose: () => void;
  onOpenRun: (runId: string, mode: "history" | "replay") => void;
  onDeleteSelected: (runIds: string[]) => void;
}) {
  const entryRunIds = useMemo(() => entries.map((entry) => entry.runId), [entries]);
  const [selectedRunIds, setSelectedRunIds] = useState<Set<string>>(() => new Set());
  const selectedCount = selectedRunIds.size;
  const allSelected = entries.length > 0 && selectedCount === entryRunIds.length;

  useEffect(() => {
    setSelectedRunIds((current) => {
      const validRunIds = new Set(entryRunIds);
      let changed = false;
      const next = new Set<string>();

      for (const runId of current) {
        if (validRunIds.has(runId)) {
          next.add(runId);
        } else {
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [entryRunIds]);

  const toggleRunSelection = (runId: string, selected: boolean) => {
    setSelectedRunIds((current) => {
      const next = new Set(current);

      if (selected) {
        next.add(runId);
      } else {
        next.delete(runId);
      }

      return next;
    });
  };

  return (
    <div className="dialog-backdrop">
      <div className="dialog-shell history-dialog-shell">
        <div className="dialog-header">
          <div>
            <h3 className="dialog-title">Test Histories</h3>
            <p className="section-copy" style={{ marginTop: "12px" }}>{benchPackName}</p>
          </div>
          <button type="button" onClick={onClose} className="dialog-close-button" aria-label="Close dialog">
            <X size={16} />
          </button>
        </div>

        <div className="history-modal-body">
          <SettingsTableShell className="history-table-wrap">
            <table className="settings-list-table">
              <thead>
                <tr>
                  <th className="history-select-column">
                    <input
                      type="checkbox"
                      aria-label="Select all histories"
                      checked={allSelected}
                      disabled={entries.length === 0}
                      onChange={(event) => setSelectedRunIds(event.target.checked ? new Set(entryRunIds) : new Set())}
                    />
                  </th>
                  <th>Date Time</th>
                  <th>Mode</th>
                  <th>Models</th>
                  <th>Cases</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, index) => {
                  const executionModeLabel = entry.executionMode ? EXECUTION_MODE_LABELS[entry.executionMode] : "Unknown";
                  const checkboxId = `history-select-${index}-${entry.runId.replace(/[^a-z0-9_-]/gi, "-")}`;

                  return (
                    <tr key={entry.runId}>
                      <td className="history-select-column">
                        <input
                          id={checkboxId}
                          type="checkbox"
                          aria-label={`Select history ${new Date(entry.startedAt).toLocaleString()}`}
                          checked={selectedRunIds.has(entry.runId)}
                          onChange={(event) => toggleRunSelection(entry.runId, event.target.checked)}
                        />
                      </td>
                      <td>
                        <label className="settings-row-primary history-time-toggle" htmlFor={checkboxId}>
                          {new Date(entry.startedAt).toLocaleString()}
                        </label>
                      </td>
                      <td>
                        <span className="status-chip status-idle">{executionModeLabel}</span>
                      </td>
                      <td>
                        <span className="history-table-metric">{entry.modelCount}</span>
                      </td>
                      <td>
                        <span className="history-table-metric">{entry.scenarioCount}</span>
                      </td>
                      <td>
                        <span
                          className={`status-chip ${
                            entry.error ? "status-danger" : entry.cancelled ? "status-not-installed" : "status-done"
                          }`}
                        >
                          {entry.error ? "error" : entry.cancelled ? "stopped" : "completed"}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="ghost-button ghost-button-compact"
                          onClick={(event) =>
                            onOpenRun(
                              entry.runId,
                              event.shiftKey && !entry.error && !entry.cancelled ? "replay" : "history"
                            )
                          }
                        >
                          <RotateCcw size={14} />
                          Open
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </SettingsTableShell>
        </div>

        <div className="dialog-footer">
          <button
            type="button"
            className="ghost-button history-delete-selected-button"
            onClick={() => onDeleteSelected(Array.from(selectedRunIds))}
            disabled={selectedCount === 0}
          >
            <Trash2 size={14} />
            Delete Selected
          </button>
        </div>
      </div>
    </div>
  );
}
