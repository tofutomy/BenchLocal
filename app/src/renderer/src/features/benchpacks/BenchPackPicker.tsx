import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import type { BenchPackInspection } from "@core";

function benchPackStatusClass(status: BenchPackInspection["status"]): string {
  switch (status) {
    case "ready":
      return "status-ready";
    case "not_installed":
      return "status-not-installed";
    case "incompatible":
      return "status-load-error";
    case "manifest_missing":
    case "entry_missing":
      return "status-entry-missing";
    case "invalid_manifest":
    case "load_error":
      return "status-load-error";
  }
}

export function BenchPackPickerDialog({
  inspections,
  open,
  setOpen,
  onSelectBenchPack,
  title = "New Tab",
  subtitle = "Pick a Bench Pack to open in this workspace.",
  actionLabel = "Open Bench Pack"
}: {
  inspections: BenchPackInspection[];
  open: boolean;
  setOpen: (open: boolean) => void;
  onSelectBenchPack: (benchPackId: string) => void;
  title?: string;
  subtitle?: string;
  actionLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const filteredInspections = inspections.filter((inspection) => {
    const haystack = [
      inspection.manifest?.name,
      inspection.id,
      inspection.manifest?.description,
      inspection.manifest?.author
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(query.trim().toLowerCase());
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedInspection =
    filteredInspections.find((inspection) => inspection.id === selectedId) ??
    filteredInspections[0] ??
    null;
  const openBenchPack = (inspection: BenchPackInspection) => {
    if (inspection.status !== "ready") {
      return;
    }

    onSelectBenchPack(inspection.id);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    setSelectedId((current) => {
      if (current && filteredInspections.some((inspection) => inspection.id === current)) {
        return current;
      }

      return filteredInspections[0]?.id ?? null;
    });
  }, [open, filteredInspections]);

  if (!open) {
    return null;
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog-shell dialog-shell-wide benchpack-picker-shell">
        <div className="dialog-header">
          <div>
            <h3 className="dialog-title">{title}</h3>
            <p className="section-copy" style={{ marginTop: "12px" }}>{subtitle}</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="dialog-close-button" aria-label="Close dialog">
            <X size={16} />
          </button>
        </div>

        <div className="benchpack-picker-body">
          <div className="benchpack-picker-list">
            <label className="field-block">
              <span className="field-label">Search</span>
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search Bench Packs"
                className="config-input"
              />
            </label>

            <div className="benchpack-picker-options">
              {filteredInspections.map((inspection) => (
                <button
                  key={inspection.id}
                  type="button"
                  className={`benchpack-option${selectedInspection?.id === inspection.id ? " is-selected" : ""}`}
                  onClick={() => setSelectedId(inspection.id)}
                  onDoubleClick={() => openBenchPack(inspection)}
                >
                  <div className="benchpack-option-main">
                    <div className="settings-row-primary">{inspection.manifest?.name ?? inspection.id}</div>
                    <div className="settings-row-secondary settings-mono-cell">{inspection.id}</div>
                  </div>
                  <span className={`status-chip ${benchPackStatusClass(inspection.status)}`}>
                    {inspection.status.replaceAll("_", " ")}
                  </span>
                </button>
              ))}
              {filteredInspections.length === 0 ? (
                <div className="sidebar-empty">No Bench Packs match your search.</div>
              ) : null}
            </div>
          </div>

          <div className="benchpack-picker-detail">
            {selectedInspection ? (
              <>
                <div>
                  <p className="eyebrow">Bench Pack</p>
                  <h3 className="panel-title" style={{ marginTop: "8px" }}>
                    {selectedInspection.manifest?.name ?? selectedInspection.id}
                  </h3>
                  <p className="section-copy" style={{ marginTop: "10px" }}>
                    {selectedInspection.manifest?.description ?? "No description provided."}
                  </p>
                </div>

                <div className="benchpack-picker-meta">
                  <div className="benchpack-stat-card">
                    <span className="benchpack-stat-label">Author</span>
                    <span className="benchpack-stat-value benchpack-meta-value">
                      {selectedInspection.manifest?.author ?? "Unknown"}
                    </span>
                  </div>
                  <div className="benchpack-stat-card">
                    <span className="benchpack-stat-label">Tests</span>
                    <span className="benchpack-stat-value">{selectedInspection.scenarioCount ?? 0}</span>
                  </div>
                  <div className="benchpack-stat-card">
                    <span className="benchpack-stat-label">Version</span>
                    <span className="benchpack-stat-value benchpack-meta-value">
                      {selectedInspection.manifest?.version ?? "n/a"}
                    </span>
                  </div>
                </div>

                <div className="benchpack-picker-badges">
                  <span className={`status-chip ${benchPackStatusClass(selectedInspection.status)}`}>
                    {selectedInspection.status.replaceAll("_", " ")}
                  </span>
                  <span className="status-chip status-idle">
                    {selectedInspection.manifest?.capabilities.tools ? "Supports tools" : "No tools"}
                  </span>
                  <span className="status-chip status-idle">
                    {selectedInspection.manifest?.capabilities.verification ? "Requires verifier" : "No extra dependencies"}
                  </span>
                </div>

                <div className="benchpack-picker-footer">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => openBenchPack(selectedInspection)}
                    disabled={selectedInspection.status !== "ready"}
                  >
                    <Plus size={14} />
                    {actionLabel}
                  </button>
                </div>
              </>
            ) : (
              <div className="entry-card" style={{ marginTop: "40px" }}>
                <p className="eyebrow">No Installed Bench Packs</p>
                <h3 className="panel-title" style={{ marginTop: "8px" }}>Install a Bench Pack from Settings</h3>
                <p className="section-copy" style={{ marginTop: "10px" }}>
                  BenchLocal now starts with zero installed Bench Packs. Open Settings, go to Bench Packs, and install one from the official registry.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function BenchPackPickerTrigger({
  inspections,
  open,
  setOpen,
  onCreateTab,
  disabled
}: {
  inspections: BenchPackInspection[];
  open: boolean;
  setOpen: (open: boolean) => void;
  onCreateTab: (benchPackId: string) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ghost-button dropdown-trigger"
        disabled={disabled}
      >
        <Plus size={14} />
        <span>New Tab</span>
      </button>

      <BenchPackPickerDialog
        inspections={inspections}
        open={open}
        setOpen={setOpen}
        onSelectBenchPack={onCreateTab}
      />
    </>
  );
}
