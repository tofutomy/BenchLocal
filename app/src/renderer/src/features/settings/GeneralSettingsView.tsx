import { Globe } from "lucide-react";
import type { BenchLocalConfig } from "@core";
import { InlineSelectField, Panel } from "../../shared/components/settings-primitives";
import { SUPPORTED_LOCALES, useI18n } from "../../shared/i18n";

export function GeneralSettingsView({
  draft,
  onLocaleChange
}: {
  draft: BenchLocalConfig;
  onLocaleChange: (locale: string) => void;
}) {
  const { t } = useI18n();

  return (
    <section className="advanced-grid">
      <Panel
        title={t("settings.tab.general")}
        subtitle={t("settings.tab.general.blurb")}
        tone="sky"
        icon={<Globe size={16} />}
      >
        <InlineSelectField
          label={t("settings.general.language")}
          value={draft.ui.locale}
          options={SUPPORTED_LOCALES.map((loc) => ({
            value: loc.id,
            label: t(`settings.general.language${loc.id === "en" ? "En" : "Zh"}`)
          }))}
          onChange={onLocaleChange}
        />
        <div className="helper-copy helper-copy-compact">
          <p>{t("settings.general.languageHint")}</p>
        </div>
      </Panel>
    </section>
  );
}
