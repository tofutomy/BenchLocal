import { Check, FolderOpen } from "lucide-react";

export function EmptyWorkspace({
  providerCount,
  modelCount,
  installedBenchPackCount,
  onOpenProviders,
  onOpenModels,
  onOpenBenchPacks,
  onSelectBenchPack
}: {
  providerCount: number;
  modelCount: number;
  installedBenchPackCount: number;
  onOpenProviders: () => void;
  onOpenModels: () => void;
  onOpenBenchPacks: () => void;
  onSelectBenchPack?: () => void;
}) {
  const hasProviders = providerCount > 0;
  const hasModels = modelCount > 0;
  const hasInstalledBenchPacks = installedBenchPackCount > 0;
  const checklist = [
    {
      key: "providers",
      complete: hasProviders,
      title: "Set up providers",
      detail: hasProviders ? `${providerCount} configured` : "Add at least one provider endpoint.",
      actionLabel: "Providers",
      onAction: onOpenProviders
    },
    {
      key: "models",
      complete: hasModels,
      title: "Add models",
      detail: hasModels ? `${modelCount} configured` : "Create shared models that point to your providers.",
      actionLabel: "Models",
      onAction: onOpenModels
    },
    {
      key: "benchpacks",
      complete: hasInstalledBenchPacks,
      title: "Install Bench Packs",
      detail: hasInstalledBenchPacks ? `${installedBenchPackCount} installed` : "Install at least one Bench Pack from the official registry.",
      actionLabel: "Bench Packs",
      onAction: onOpenBenchPacks
    }
  ];

  return (
    <section className="empty-workspace">
      <div className="empty-workspace-card benchmark-empty-card">
        <div className="benchmark-empty-icon">
          <FolderOpen size={22} />
        </div>
        <p className="eyebrow">No Active Bench Pack</p>
        <h3 className="panel-title">Select a Bench Pack to open its workspace</h3>
        <p className="section-copy" style={{ marginTop: "12px", maxWidth: "52ch" }}>
          Complete the setup checklist below. BenchLocal keeps providers and models shared across the app, while each Bench Pack owns its own scenarios, sampling defaults, and scoring.
        </p>

        <div className="welcome-checklist">
          {checklist.map((item) => (
            <div key={item.key} className={`welcome-checklist-item${item.complete ? " is-complete" : ""}`}>
              <div className="welcome-checklist-icon" aria-hidden="true">
                {item.complete ? <Check size={14} /> : <span className="welcome-checklist-dot" />}
              </div>
              <div className="welcome-checklist-copy">
                <div className="welcome-checklist-title">{item.title}</div>
                <div className="settings-row-secondary">{item.detail}</div>
              </div>
              {item.complete ? (
                <span className="status-chip status-done">Done</span>
              ) : (
                <button type="button" onClick={item.onAction} className="ghost-button ghost-button-compact">
                  {item.actionLabel}
                </button>
              )}
            </div>
          ))}
        </div>

        {hasInstalledBenchPacks && onSelectBenchPack ? (
          <button type="button" onClick={onSelectBenchPack} className="primary-button" style={{ marginTop: "20px" }}>
            <FolderOpen size={16} />
            Select Bench Pack
          </button>
        ) : null}
      </div>
    </section>
  );
}
