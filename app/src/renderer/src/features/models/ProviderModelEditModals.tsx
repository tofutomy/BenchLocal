import { LayoutList, Trash2 } from "lucide-react";
import type { BenchLocalProviderConfig, BenchLocalProviderKind } from "@core";
import type { ModelFormState, ProviderFormState } from "./model-config";
import { Modal } from "../../shared/components/Modal";
import {
  Field,
  FieldToggle,
  InlineSelectField
} from "../../shared/components/settings-primitives";

export function ProviderEditModal({
  mode,
  form,
  providerKindOptions,
  onClose,
  onSubmit,
  onDelete,
  onKindChange,
  onNameChange,
  onApiKeyChange,
  onEnabledChange,
  onBaseUrlChange,
  getProviderKindLabel,
  getDefaultProviderName,
  getDefaultProviderApiKeyPlaceholder
}: {
  mode: "create" | "edit";
  form: ProviderFormState;
  providerKindOptions: BenchLocalProviderKind[];
  onClose: () => void;
  onSubmit: () => void;
  onDelete?: () => void;
  onKindChange: (kind: BenchLocalProviderKind) => void;
  onNameChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onEnabledChange: (checked: boolean) => void;
  onBaseUrlChange: (value: string) => void;
  getProviderKindLabel: (kind: BenchLocalProviderKind) => string;
  getDefaultProviderName: (kind: BenchLocalProviderKind) => string;
  getDefaultProviderApiKeyPlaceholder: (kind: BenchLocalProviderKind) => string;
}) {
  return (
    <Modal
      title={mode === "create" ? "Add Provider" : "Edit Provider"}
      subtitle="Create or update a shared provider entry."
      onClose={onClose}
      onSubmit={onSubmit}
      submitLabel={mode === "create" ? "Create Provider" : "Save Provider"}
      leadingActions={
        mode === "edit" && onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="button-danger"
          >
            <Trash2 size={14} />
            Delete Provider
          </button>
        ) : undefined
      }
    >
      <div className="entry-grid two-col">
        <InlineSelectField
          label="Provider Kind"
          value={form.kind}
          options={providerKindOptions}
          getOptionLabel={(value) => getProviderKindLabel(value as BenchLocalProviderKind)}
          onChange={(value) => onKindChange(value as BenchLocalProviderKind)}
        />
        <Field
          label="Display Name"
          value={form.name}
          placeholder={getDefaultProviderName(form.kind)}
          onChange={onNameChange}
        />
        <Field
          label="API Key"
          type="password"
          value={form.api_key}
          placeholder={getDefaultProviderApiKeyPlaceholder(form.kind)}
          onChange={onApiKeyChange}
        />
        <FieldToggle
          label="Enabled"
          checked={form.enabled}
          onChange={onEnabledChange}
        />
      </div>
      <Field label="Base URL" value={form.base_url} onChange={onBaseUrlChange} />
    </Modal>
  );
}

export function ModelEditModal({
  mode,
  form,
  providerIds,
  providers,
  canBrowseModels,
  onClose,
  onSubmit,
  onDelete,
  onProviderChange,
  onGroupChange,
  onModelChange,
  onBrowseModels,
  onLabelChange,
  onEnabledChange,
  getProviderDisplayName
}: {
  mode: "create" | "edit";
  form: ModelFormState;
  providerIds: string[];
  providers: Record<string, BenchLocalProviderConfig>;
  canBrowseModels: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onDelete?: () => void;
  onProviderChange: (value: string) => void;
  onGroupChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onBrowseModels: () => void;
  onLabelChange: (value: string) => void;
  onEnabledChange: (checked: boolean) => void;
  getProviderDisplayName: (providers: Record<string, BenchLocalProviderConfig>, providerId: string) => string;
}) {
  return (
    <Modal
      title={mode === "create" ? "Add Model" : "Edit Model"}
      subtitle="Models are shared across every installed Bench Pack."
      onClose={onClose}
      onSubmit={onSubmit}
      submitLabel={mode === "create" ? "Create Model" : "Save Model"}
      leadingActions={
        mode === "edit" && onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="button-danger"
          >
            <Trash2 size={14} />
            Delete Model
          </button>
        ) : undefined
      }
    >
      <div className="entry-grid two-col">
        <InlineSelectField
          label="Provider"
          value={form.provider}
          options={providerIds.length > 0 ? providerIds : ["openrouter"]}
          getOptionLabel={(value) => getProviderDisplayName(providers, value)}
          onChange={onProviderChange}
        />
        <Field label="Group" value={form.group} placeholder="primary" onChange={onGroupChange} />
        <label className="field-block model-field-with-action">
          <span className="field-label">Model Identifier</span>
          <div className="model-field-with-action-row">
            <input
              type="text"
              value={form.model}
              placeholder="openai/gpt-4.1"
              onChange={(event) => onModelChange(event.target.value)}
              className="config-input"
            />
            <button
              type="button"
              onClick={onBrowseModels}
              className="ghost-button ghost-button-compact"
              disabled={!canBrowseModels}
              title={
                canBrowseModels
                  ? "Browse models"
                  : "Model browsing is currently available only for OpenRouter and OpenAI-compatible providers."
              }
            >
              <LayoutList size={14} />
              Browse Models
            </button>
          </div>
        </label>
        <Field label="Display Label" value={form.label} placeholder="GPT-4.1 via OpenRouter" onChange={onLabelChange} />
        <Field
          label="Display Reference"
          value={`${getProviderDisplayName(providers, form.provider)}: ${form.model}`.replace(/: $/, "")}
          readOnly
          onChange={() => undefined}
        />
        <FieldToggle
          label="Enabled"
          checked={form.enabled}
          onChange={onEnabledChange}
        />
      </div>
    </Modal>
  );
}
