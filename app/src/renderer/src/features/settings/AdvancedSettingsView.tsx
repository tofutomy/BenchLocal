import { FolderOpen, RotateCcw, Save } from "lucide-react";
import type { BenchLocalConfig } from "@core";
import { Field, Panel } from "../../shared/components/settings-primitives";
import { useI18n } from "../../shared/i18n";

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
  const { t } = useI18n();

  return (
    <section className="advanced-grid">
      <Panel
        title={t("settings.advanced.filesystem")}
        subtitle={t("settings.advanced.filesystem.subtitle")}
        tone="sky"
        icon={<FolderOpen size={16} />}
      >
        <Field label={t("settings.advanced.configFile")} value={configPath} readOnly onChange={() => undefined} />
        <Field label={t("settings.advanced.runStorage")} value={draft.run_storage_dir} onChange={(value) => updateDraft((current) => {
          current.run_storage_dir = value;
          return current;
        })} />
        <Field label={t("settings.advanced.benchPackStorage")} value={draft.benchpack_storage_dir} onChange={(value) => updateDraft((current) => {
          current.benchpack_storage_dir = value;
          return current;
        })} />
        <Field label={t("settings.advanced.logStorage")} value={draft.log_storage_dir} onChange={(value) => updateDraft((current) => {
          current.log_storage_dir = value;
          return current;
        })} />
        <Field label={t("settings.advanced.cacheStorage")} value={draft.cache_dir} onChange={(value) => updateDraft((current) => {
          current.cache_dir = value;
          return current;
        })} />
        <div className="helper-copy helper-copy-compact">
          <p dangerouslySetInnerHTML={{ __html: t("settings.advanced.pathsHint") }} />
        </div>
        <div className="settings-actions advanced-filesystem-actions">
          <button
            type="button"
            onClick={onReset}
            disabled={isBusy || !hasUnsavedChanges}
            className="ghost-button"
          >
            <RotateCcw size={14} />
            {t("common.reset")}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={isBusy || !hasUnsavedChanges}
            className="primary-button"
          >
            <Save size={14} />
            {t("common.save")}
          </button>
        </div>
      </Panel>
    </section>
  );
}
