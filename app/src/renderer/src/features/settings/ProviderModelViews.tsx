import { useEffect, useState } from "react";
import { Bot, Copy, Pencil, Plus, Server } from "lucide-react";
import type { BenchLocalModelConfig, BenchLocalProviderConfig } from "@core";
import { getProviderDisplayName, providerKindLabel } from "../models/model-config";
import {
  Field,
  InlineSelectField,
  Panel,
  SettingsTableShell
} from "../../shared/components/settings-primitives";

function getModelDisplayIdentifier(model: Pick<BenchLocalModelConfig, "id" | "model">): string {
  return model.model.trim() || model.id.split(":").slice(1).join(":").trim() || model.id;
}

export function ProvidersView({
  providers,
  models,
  onCreate,
  onEdit,
  onDuplicate
}: {
  providers: Record<string, BenchLocalProviderConfig>;
  models: BenchLocalModelConfig[];
  onCreate: () => void;
  onEdit: (providerId: string) => void;
  onDuplicate: (providerId: string) => void;
}) {
  const providerIds = Object.keys(providers);

  return (
    <Panel
      title="Provider Registry"
      subtitle="Provider endpoints, credentials, and activation state shared across all Bench Packs."
      tone="sky"
      icon={<Server size={16} />}
      actions={
        <button type="button" onClick={onCreate} className="primary-button"><Plus size={14} />Add Provider</button>
      }
    >
      <SettingsTableShell>
        <table className="settings-list-table">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Type</th>
              <th>Status</th>
              <th>Base URL</th>
              <th>Models</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {providerIds.map((providerId) => {
              const provider = providers[providerId];
              const linkedModels = models.filter((model) => model.provider === providerId).length;

              return (
                <tr key={providerId}>
                  <td>
                    <div className="settings-row-primary">{provider.name}</div>
                  </td>
                  <td>
                    <div className="settings-row-secondary">{providerKindLabel(provider.kind)}</div>
                  </td>
                  <td>
                    <span className={`status-chip ${provider.enabled ? "status-ready" : "status-inactive"}`}>
                      {provider.enabled ? "active" : "inactive"}
                    </span>
                  </td>
                  <td className="settings-mono-cell">{provider.base_url}</td>
                  <td>{linkedModels}</td>
                  <td>
                    <div className="settings-table-actions">
                      <button type="button" onClick={() => onEdit(providerId)} className="ghost-button ghost-button-compact"><Pencil size={14} />Edit</button>
                      <button type="button" onClick={() => onDuplicate(providerId)} className="ghost-button ghost-button-compact"><Copy size={14} />Duplicate</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SettingsTableShell>
    </Panel>
  );
}

export function ModelsView({
  models,
  providers,
  providerIds,
  onCreate,
  onEdit,
  onDuplicate
}: {
  models: BenchLocalModelConfig[];
  providers: Record<string, BenchLocalProviderConfig>;
  providerIds: string[];
  onCreate: () => void;
  onEdit: (index: number) => void;
  onDuplicate: (index: number) => void;
}) {
  const [providerFilter, setProviderFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const providerOptions = [
    { value: "all", label: "All Providers" },
    ...Array.from(new Set(models.map((model) => model.provider)))
      .sort((left, right) => getProviderDisplayName(providers, left).localeCompare(getProviderDisplayName(providers, right)))
      .map((providerId) => ({
        value: providerId,
        label: getProviderDisplayName(providers, providerId)
      }))
  ];
  const groupOptions = [
    { value: "all", label: "All Groups" },
    ...Array.from(new Set(models.map((model) => model.group.trim() || "__ungrouped__")))
      .sort((left, right) => left.localeCompare(right))
      .map((group) => ({
        value: group,
        label: group === "__ungrouped__" ? "Ungrouped" : group
      }))
  ];
  const filteredModels = models
    .map((model, index) => ({ model, index }))
    .filter(({ model }) => {
      const normalizedGroup = model.group.trim() || "__ungrouped__";
      const normalizedQuery = searchQuery.trim().toLowerCase();
      const providerName = getProviderDisplayName(providers, model.provider);
      const haystack = [model.label, model.id, model.model, model.group, providerName, model.provider]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (providerFilter === "all" || model.provider === providerFilter) &&
        (groupFilter === "all" || normalizedGroup === groupFilter) &&
        (!normalizedQuery || haystack.includes(normalizedQuery))
      );
    });

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
    <Panel
      title="Shared Model Registry"
      subtitle="Model labels, provider mapping, and activation state available across all Bench Packs."
      tone="orange"
      icon={<Bot size={16} />}
      actions={
        <button
          type="button"
          onClick={onCreate}
          disabled={providerIds.length === 0}
          className="primary-button"
        >
          <Plus size={14} />
          Add Model
        </button>
      }
    >
      <div className="settings-models-filter-row">
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
          label="Search"
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search label, model, ID, provider, or group"
        />
      </div>
      <SettingsTableShell>
        <table className="settings-list-table">
          <thead>
            <tr>
              <th>Label</th>
              <th>Status</th>
              <th>Provider</th>
              <th>Model</th>
              <th>Group</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredModels.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="settings-row-secondary">No models match the current filters.</div>
                </td>
              </tr>
            ) : (
              filteredModels.map(({ model, index }) => (
                <tr key={`${model.id}-${index}`}>
                  <td>
                    <div className="settings-row-primary">{model.label}</div>
                    <div className="settings-row-secondary settings-mono-cell">{getModelDisplayIdentifier(model)}</div>
                  </td>
                  <td>
                    <span className={`status-chip ${model.enabled ? "status-ready" : "status-inactive"}`}>
                      {model.enabled ? "active" : "inactive"}
                    </span>
                  </td>
                  <td>{getProviderDisplayName(providers, model.provider)}</td>
                  <td className="settings-mono-cell">{model.model}</td>
                  <td>{model.group}</td>
                  <td>
                    <div className="settings-table-actions">
                      <button type="button" onClick={() => onEdit(index)} className="ghost-button ghost-button-compact"><Pencil size={14} />Edit</button>
                      <button type="button" onClick={() => onDuplicate(index)} className="ghost-button ghost-button-compact"><Copy size={14} />Duplicate</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </SettingsTableShell>
    </Panel>
  );
}
