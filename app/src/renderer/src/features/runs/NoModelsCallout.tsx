import { Bot, RotateCcw } from "lucide-react";

export function NoModelsCallout({
  historyEntryCount,
  hasLiveActivity,
  onOpenHistory,
  onEditModels
}: {
  historyEntryCount: number;
  hasLiveActivity: boolean;
  onOpenHistory: () => void;
  onEditModels: () => void;
}) {
  return (
    <div className="table-empty-callout">
      <div className="table-empty-callout-icon">
        <Bot size={22} />
      </div>
      <div className="table-empty-callout-copy">
        <h3 className="table-empty-callout-title">No models selected</h3>
        <p className="muted-copy">Add one or more models to start running this Bench Pack.</p>
      </div>
      <div className="table-empty-callout-actions">
        <button type="button" className="ghost-button" onClick={onOpenHistory} disabled={historyEntryCount === 0}>
          <RotateCcw size={14} />
          Test Histories
        </button>
        <button type="button" onClick={onEditModels} className="ghost-button" disabled={hasLiveActivity}>
          <Bot size={14} />
          Add Models
        </button>
      </div>
    </div>
  );
}
