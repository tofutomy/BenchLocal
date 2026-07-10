import { useEffect, useState } from "react";
import { GripVertical } from "lucide-react";
import type {
  BenchLocalModelConfig,
  BenchLocalProviderConfig,
  BenchLocalWorkspaceTabModelSelection
} from "@core";
import { Modal } from "../../shared/components/Modal";
import {
  Field,
  InlineSelectField
} from "../../shared/components/settings-primitives";

function fallbackProviderDisplayName(providerId: string): string {
  const trimmed = providerId.trim();

  if (/^openai[_-]compatible-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return "OpenAI Compatible";
  }

  switch (trimmed) {
    case "openrouter":
      return "OpenRouter";
    case "huggingface":
      return "Hugging Face";
    case "ollama":
      return "Ollama";
    case "llamacpp":
      return "llama.cpp";
    case "mlx":
      return "MLX";
    case "lmstudio":
      return "LM Studio";
    case "pico":
      return "Pico";
    default:
      return trimmed || "Unknown Provider";
  }
}

function getProviderDisplayName(
  providers: Record<string, BenchLocalProviderConfig>,
  providerId: string
): string {
  return providers[providerId]?.name?.trim() || fallbackProviderDisplayName(providerId);
}

function getModelDisplayIdentifier(model: Pick<BenchLocalModelConfig, "id" | "model">): string {
  return model.model.trim() || model.id.split(":").slice(1).join(":").trim() || model.id;
}

function normalizeEditableTabModelSelections(
  selections: BenchLocalWorkspaceTabModelSelection[]
): BenchLocalWorkspaceTabModelSelection[] {
  const seen = new Set<string>();

  return selections
    .filter((selection) => {
      const modelId = selection.modelId.trim();

      if (!modelId || seen.has(modelId)) {
        return false;
      }

      seen.add(modelId);
      return true;
    })
    .map((selection) => ({
      modelId: selection.modelId.trim(),
      alias: selection.alias
    }));
}

export function TabModelsModal({
  providers,
  models,
  selections,
  onClose,
  onChange,
  onSubmit
}: {
  providers: Record<string, BenchLocalProviderConfig>;
  models: BenchLocalModelConfig[];
  selections: BenchLocalWorkspaceTabModelSelection[];
  onClose: () => void;
  onChange: (selections: BenchLocalWorkspaceTabModelSelection[]) => void;
  onSubmit: () => void;
}) {
  const [providerFilter, setProviderFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const enabledModels = models.filter((model) => model.enabled);
  const editableSelections = normalizeEditableTabModelSelections(selections);
  const selectionMap = new Map(editableSelections.map((selection) => [selection.modelId, selection]));
  const availableIds = new Set(enabledModels.map((model) => model.id));
  const orderedSelectedIds = editableSelections.map((selection) => selection.modelId).filter((modelId) => availableIds.has(modelId));
  const selectedIdSet = new Set(orderedSelectedIds);
  const providerOptions = [
    { value: "all", label: "All Providers" },
    ...Array.from(new Set(enabledModels.map((model) => model.provider)))
      .sort((left, right) => getProviderDisplayName(providers, left).localeCompare(getProviderDisplayName(providers, right)))
      .map((providerId) => ({
        value: providerId,
        label: getProviderDisplayName(providers, providerId)
      }))
  ];
  const groupOptions = [
    { value: "all", label: "All Groups" },
    ...Array.from(new Set(enabledModels.map((model) => model.group.trim() || "__ungrouped__")))
      .sort((left, right) => left.localeCompare(right))
      .map((group) => ({
        value: group,
        label: group === "__ungrouped__" ? "Ungrouped" : group
      }))
  ];
  const filteredAvailableModels = enabledModels.filter((model) => {
    const normalizedGroup = model.group.trim() || "__ungrouped__";
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const haystack = [
      model.label,
      model.id,
      model.model,
      model.group,
      getProviderDisplayName(providers, model.provider)
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return (
      (providerFilter === "all" || model.provider === providerFilter) &&
      (groupFilter === "all" || normalizedGroup === groupFilter) &&
      (!normalizedQuery || haystack.includes(normalizedQuery))
    );
  });
  const selectedModels = orderedSelectedIds
    .map((modelId) => enabledModels.find((model) => model.id === modelId))
    .filter((model): model is BenchLocalModelConfig => Boolean(model));

  const toggleModel = (modelId: string, enabled: boolean) => {
    if (enabled) {
      const existing = selectionMap.get(modelId);
      onChange([...editableSelections, { modelId, alias: existing?.alias }]);
      return;
    }

    onChange(editableSelections.filter((selection) => selection.modelId !== modelId));
  };

  const updateAlias = (modelId: string, alias: string) => {
    const next = editableSelections.map((selection) =>
      selection.modelId === modelId ? { ...selection, alias: alias || undefined } : selection
    );
    onChange(next);
  };

  const moveSelection = (draggedId: string, targetId: string) => {
    if (draggedId === targetId) {
      return;
    }

    const next = [...editableSelections];
    const fromIndex = next.findIndex((selection) => selection.modelId === draggedId);
    const toIndex = next.findIndex((selection) => selection.modelId === targetId);

    if (fromIndex < 0 || toIndex < 0) {
      return;
    }

    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    onChange(next);
  };

  useEffect(() => {
    if (providerFilter !== "all" && !providerOptions.some((option) => option.value === providerFilter)) {
      setProviderFilter("all");
    }
  }, [providerFilter, providerOptions]);

  useEffect(() => {
    if (groupFilter !== "all" && !groupOptions.some((option) => option.value === groupFilter)) {
      setGroupFilter("all");
    }
  }, [groupFilter, groupOptions]);

  return (
    <Modal
      title="Edit Tab Models"
      onClose={onClose}
      onSubmit={onSubmit}
      submitLabel="Save Models"
      size="wide"
    >
      <div className="tab-models-layout">
        <section className="tab-models-column">
          <div className="tab-models-column-header">
            <h4 className="tab-models-column-title">Available Models</h4>
            <span className="status-chip status-idle">{filteredAvailableModels.length}</span>
          </div>
          <div className="entry-grid two-col tab-models-filters">
            <InlineSelectField
              label="Provider Filter"
              value={providerFilter}
              options={providerOptions}
              onChange={setProviderFilter}
            />
            <InlineSelectField
              label="Group Filter"
              value={groupFilter}
              options={groupOptions}
              onChange={setGroupFilter}
            />
            <Field
              label=""
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search models"
              className="tab-models-search"
            />
          </div>
          <div className="tab-models-list">
            {filteredAvailableModels.length === 0 ? (
              <div className="tab-models-empty">
                <p className="muted-copy">No models match the current filters.</p>
              </div>
            ) : filteredAvailableModels.map((model) => {
              const isSelected = selectedIdSet.has(model.id);
              const providerName = getProviderDisplayName(providers, model.provider);

              return (
                <div key={model.id} className="tab-model-row">
                  <label className="tab-model-toggle">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(event) => toggleModel(model.id, event.target.checked)}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    <span className="tab-model-toggle-copy">
                      <span className="settings-row-primary">{model.label}</span>
                      <span className="settings-row-secondary">{providerName}</span>
                      <span className="settings-row-secondary settings-mono-cell">{getModelDisplayIdentifier(model)}</span>
                    </span>
                  </label>

                  <div className="tab-model-row-meta">
                    <span className="status-chip status-idle">{model.group.trim() || "Ungrouped"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="tab-models-column">
          <div className="tab-models-column-header">
            <h4 className="tab-models-column-title">Selected Models</h4>
            <span className="status-chip status-preview">{selectedModels.length}</span>
          </div>
          <div className="tab-models-list">
            {selectedModels.length === 0 ? (
              <div className="tab-models-empty">
                <p className="muted-copy">Select models from the left to add them to this tab.</p>
              </div>
            ) : selectedModels.map((model) => {
              const selection = selectionMap.get(model.id);
              const providerName = getProviderDisplayName(providers, model.provider);

              return (
                <div
                  key={model.id}
                  className="tab-model-row is-selected"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", model.id);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    moveSelection(event.dataTransfer.getData("text/plain"), model.id);
                  }}
                >
                  <label className="tab-model-toggle">
                    <input
                      type="checkbox"
                      checked
                      onChange={(event) => toggleModel(model.id, event.target.checked)}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    <span className="tab-model-toggle-copy">
                      <span className="settings-row-primary">{model.label}</span>
                      <span className="settings-row-secondary">{providerName}</span>
                      <span className="settings-row-secondary settings-mono-cell">{getModelDisplayIdentifier(model)}</span>
                    </span>
                  </label>

                  <div className="tab-model-row-meta">
                    <input
                      type="text"
                      value={selection?.alias ?? ""}
                      placeholder="Optional alias"
                      onChange={(event) => updateAlias(model.id, event.target.value)}
                      className="config-input tab-model-alias-input"
                    />
                    <div className="tab-model-drag-handle" title="Drag to reorder selected models">
                      <GripVertical size={16} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </Modal>
  );
}
