import { FolderOpen, RotateCcw, Save } from "lucide-react";
import type { BenchLocalConfig } from "@core";
import { Field, Panel } from "../../shared/components/settings-primitives";

export function AdvancedSettingsView({
  draft,
  configPath,
  hasUnsavedChanges,
  isBusy,
  onSave,
  onReset,
  updateDraft
}: {
  draft: BenchLocalConfig;
  configPath: string;
  hasUnsavedChanges: boolean;
  isBusy: boolean;
  onSave: () => void;
  onReset: () => void;
  updateDraft: (updater: (current: BenchLocalConfig) => BenchLocalConfig) => void;
}) {
  return (
    <section className="advanced-grid">
      <Panel
        title="Filesystem"
        subtitle="BenchLocal-owned storage paths and config location."
        tone="sky"
        icon={<FolderOpen size={16} />}
      >
        <Field label="Config File" value={configPath} readOnly onChange={() => undefined} />
        <Field label="Run Storage" value={draft.run_storage_dir} onChange={(value) => updateDraft((current) => {
          current.run_storage_dir = value;
          return current;
        })} />
        <Field label="Bench Pack Storage" value={draft.benchpack_storage_dir} onChange={(value) => updateDraft((current) => {
          current.benchpack_storage_dir = value;
          return current;
        })} />
        <Field label="Log Storage" value={draft.log_storage_dir} onChange={(value) => updateDraft((current) => {
          current.log_storage_dir = value;
          return current;
        })} />
        <Field label="Cache Storage" value={draft.cache_dir} onChange={(value) => updateDraft((current) => {
          current.cache_dir = value;
          return current;
        })} />
        <div className="helper-copy helper-copy-compact">
          <p>These paths are saved to <strong>~/.benchlocal/config.toml</strong>.</p>
        </div>
        <div className="settings-actions advanced-filesystem-actions">
          <button
            type="button"
            onClick={onReset}
            disabled={isBusy || !hasUnsavedChanges}
            className="ghost-button"
          >
            <RotateCcw size={14} />
            Reset
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={isBusy || !hasUnsavedChanges}
            className="primary-button"
          >
            <Save size={14} />
            Save
          </button>
        </div>
      </Panel>
    </section>
  );
}
