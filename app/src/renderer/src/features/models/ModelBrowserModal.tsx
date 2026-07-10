import type { BenchLocalDiscoveredModel } from "@/shared/desktop-api";
import { Modal } from "../../shared/components/Modal";
import { Field } from "../../shared/components/settings-primitives";

export type ModelBrowserModalState = {
  providerId: string;
  providerName: string;
  entries: BenchLocalDiscoveredModel[];
  query: string;
  selectedModelId: string | null;
  loading: boolean;
  error: string | null;
};

export function ModelBrowserModal({
  state,
  onClose,
  onQueryChange,
  onSelect,
  onSubmit
}: {
  state: ModelBrowserModalState;
  onClose: () => void;
  onQueryChange: (query: string) => void;
  onSelect: (modelId: string) => void;
  onSubmit: () => void;
}) {
  const normalizedQuery = state.query.trim().toLowerCase();
  const filteredEntries = state.entries.filter((entry) => {
    const haystack = [entry.id, entry.name, entry.ownedBy, entry.modality, entry.pricing]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return !normalizedQuery || haystack.includes(normalizedQuery);
  });

  return (
    <Modal
      title="Browse Models"
      subtitle={`Discover available models from ${state.providerName}.`}
      onClose={onClose}
      onSubmit={onSubmit}
      submitLabel="Use Model"
      size="wide"
    >
      <Field
        label=""
        value={state.query}
        onChange={onQueryChange}
        placeholder="Search models"
        className="model-browser-search"
      />

      <div className="model-browser-list">
        {state.loading ? (
          <div className="tab-models-empty">
            <span className="spinner" />
            <p className="muted-copy">Loading models from {state.providerName}...</p>
          </div>
        ) : state.error ? (
          <div className="tab-models-empty">
            <p className="muted-copy">{state.error}</p>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="tab-models-empty">
            <p className="muted-copy">No models match the current search.</p>
          </div>
        ) : (
          filteredEntries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`model-browser-row${state.selectedModelId === entry.id ? " is-selected" : ""}`}
              onClick={() => onSelect(entry.id)}
            >
              <div className="model-browser-main">
                <div className="settings-row-primary">{entry.name ?? entry.id}</div>
                <div className="settings-row-secondary settings-mono-cell">{entry.id}</div>
              </div>
              <div className="model-browser-meta">
                {entry.contextLength ? (
                  <span className="status-chip status-idle">{entry.contextLength.toLocaleString()} ctx</span>
                ) : null}
                {entry.modality ? <span className="status-chip status-idle">{entry.modality}</span> : null}
                {entry.pricing ? <span className="status-chip status-idle">{entry.pricing}</span> : null}
              </div>
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}
