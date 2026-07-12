import { type ReactNode } from "react";
import { Bot, ChevronLeft, Globe, PlugZap, Server, Wrench } from "lucide-react";
import type {
  BenchLocalAgentAccess,
  BenchLocalConfig,
  BenchLocalVerifierConfig,
  BenchPackInspection,
  BenchPackRegistryEntry
} from "@core";
import type {
  BenchLocalAgentAccessState,
  BenchPackMutationProgress,
  BenchPackVerifierStatus
} from "@/shared/desktop-api";
import { useI18n } from "../../shared/i18n";
import { BenchPackRegistryView } from "../benchpacks/BenchPackRegistryView";
import { AdvancedSettingsView } from "./AdvancedSettingsView";
import { AgentAccessView } from "./AgentAccessView";
import { GeneralSettingsView } from "./GeneralSettingsView";
import { ModelsView, ProvidersView } from "./ProviderModelViews";
import { VerificationView } from "./VerificationView";

export type SettingsTab = "general" | "providers" | "models" | "benchPacks" | "verification" | "agent" | "advanced";

// tab 条目定义，在组件内通过 t() 获取翻译后的 label 和 blurb
function useSettingsTabs(): Array<{ id: SettingsTab; label: string; blurb: string; icon: ReactNode }> {
  const { t } = useI18n();
  return [
    { id: "general", label: t("settings.tab.general"), blurb: t("settings.tab.general.blurb"), icon: <Globe size={16} /> },
    { id: "providers", label: t("settings.tab.providers"), blurb: t("settings.tab.providers.blurb"), icon: <Server size={16} /> },
    { id: "models", label: t("settings.tab.models"), blurb: t("settings.tab.models.blurb"), icon: <Bot size={16} /> },
    { id: "benchPacks", label: t("settings.tab.benchPacks"), blurb: t("settings.tab.benchPacks.blurb"), icon: <PlugZap size={16} /> },
    { id: "verification", label: t("settings.tab.verification"), blurb: t("settings.tab.verification.blurb"), icon: <Wrench size={16} /> },
    { id: "agent", label: t("settings.tab.agent"), blurb: t("settings.tab.agent.blurb"), icon: <Server size={16} /> }
  ];
}

export function SettingsScene({
  settingsTab,
  setSettingsTab,
  draft,
  configPath,
  hasUnsavedChanges,
  isBusy,
  providerIds,
  benchPackInspections,
  registryEntries,
  registryWarning,
  benchPackMutations,
  verifierStatuses,
  agentAccessState,
  onBack,
  onSaveAdvanced,
  onResetAdvanced,
  onCreateProvider,
  onEditProvider,
  onDuplicateProvider,
  onCreateModel,
  onEditModel,
  onDuplicateModel,
  onStartVerifier,
  onStopVerifier,
  onDeleteVerifierImage,
  onRefreshRegistry,
  onInstallBenchPack,
  onInstallBenchPackFromUrl,
  onUpdateBenchPack,
  onUninstallBenchPack,
  onConfigureAgentAccess,
  onRegenerateAgentToken,
  updateDraft,
  onUpdateVerifier,
  onLocaleChange
}: {
  settingsTab: SettingsTab;
  setSettingsTab: (tab: SettingsTab) => void;
  draft: BenchLocalConfig;
  configPath: string;
  hasUnsavedChanges: boolean;
  isBusy: boolean;
  providerIds: string[];
  benchPackInspections: BenchPackInspection[];
  registryEntries: BenchPackRegistryEntry[];
  registryWarning: string | null;
  benchPackMutations: Record<string, BenchPackMutationProgress>;
  verifierStatuses: Record<string, BenchPackVerifierStatus>;
  agentAccessState: BenchLocalAgentAccessState | null;
  onBack: () => void;
  onSaveAdvanced: () => void;
  onResetAdvanced: () => void;
  onCreateProvider: () => void;
  onEditProvider: (providerId: string) => void;
  onDuplicateProvider: (providerId: string) => void;
  onCreateModel: () => void;
  onEditModel: (index: number) => void;
  onDuplicateModel: (index: number) => void;
  onStartVerifier: (benchPackId: string, benchPackName: string, verifierId: string) => Promise<void>;
  onStopVerifier: (benchPackId: string) => Promise<void>;
  onDeleteVerifierImage: (benchPackId: string, benchPackName: string, verifierId: string) => void;
  onRefreshRegistry: () => void;
  onInstallBenchPack: (benchPackId: string) => void;
  onInstallBenchPackFromUrl: (url: string) => Promise<boolean | void>;
  onUpdateBenchPack: (benchPackId: string) => void;
  onUninstallBenchPack: (benchPackId: string) => void;
  onConfigureAgentAccess: (input: { enabled: boolean; access?: BenchLocalAgentAccess; port?: number }) => void;
  onRegenerateAgentToken: () => void;
  updateDraft: (updater: (current: BenchLocalConfig) => BenchLocalConfig) => void;
  onLocaleChange: (locale: string) => void;
  onUpdateVerifier: (
    benchPackId: string,
    verifierId: string,
    updater: (verifier: BenchLocalVerifierConfig) => BenchLocalVerifierConfig
  ) => void;
}) {
  const { t } = useI18n();
  const settingsTabs = useSettingsTabs();

  return (
    <section className="settings-scene">
      <aside className="settings-sidebar">
        <div className="settings-sidebar-header">
          <button type="button" onClick={onBack} className="settings-back-button">
            <ChevronLeft size={16} />
            {t("settings.backToMain")}
          </button>
          <div className="settings-sidebar-title-block">
            <p className="eyebrow">{t("settings.title")}</p>
            <h2 className="settings-sidebar-title">{t("settings.preferences")}</h2>
          </div>
        </div>

        <div className="settings-sidebar-group">
          {settingsTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSettingsTab(tab.id)}
              className={`settings-sidebar-item${settingsTab === tab.id ? " is-active" : ""}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </aside>

      <div className="settings-scene-content">
        <div className="settings-body settings-body-scene">
          {settingsTab === "general" ? (
            <GeneralSettingsView
              draft={draft}
              onLocaleChange={onLocaleChange}
            />
          ) : null}

          {settingsTab === "providers" ? (
            <ProvidersView
              providers={draft.providers}
              models={draft.models}
              onCreate={onCreateProvider}
              onEdit={onEditProvider}
              onDuplicate={onDuplicateProvider}
            />
          ) : null}

          {settingsTab === "models" ? (
            <ModelsView
              models={draft.models}
              providers={draft.providers}
              providerIds={providerIds}
              onCreate={onCreateModel}
              onEdit={onEditModel}
              onDuplicate={onDuplicateModel}
            />
          ) : null}

          {settingsTab === "benchPacks" ? (
            <BenchPackRegistryView
              draft={draft}
              inspections={benchPackInspections}
              registryEntries={registryEntries}
              registryWarning={registryWarning}
              benchPackMutations={benchPackMutations}
              onRefresh={onRefreshRegistry}
              onInstall={onInstallBenchPack}
              onInstallFromUrl={onInstallBenchPackFromUrl}
              onUpdate={onUpdateBenchPack}
              onUninstall={onUninstallBenchPack}
            />
          ) : null}

          {settingsTab === "verification" ? (
            <VerificationView
              draft={draft}
              statuses={verifierStatuses}
              onUpdate={onUpdateVerifier}
              onStart={async (benchPackId, benchPackName, verifierId) => {
                await onStartVerifier(benchPackId, benchPackName, verifierId);
              }}
              onStop={async (benchPackId) => {
                await onStopVerifier(benchPackId);
              }}
              onDeleteImage={(benchPackId, benchPackName, verifierId) => {
                onDeleteVerifierImage(benchPackId, benchPackName, verifierId);
              }}
            />
          ) : null}

          {settingsTab === "agent" ? (
            <AgentAccessView
              state={agentAccessState}
              onConfigure={onConfigureAgentAccess}
              onRegenerateToken={onRegenerateAgentToken}
            />
          ) : null}

          {settingsTab === "advanced" ? (
            <AdvancedSettingsView
              draft={draft}
              configPath={configPath}
              hasUnsavedChanges={Boolean(hasUnsavedChanges)}
              isBusy={isBusy}
              onSave={onSaveAdvanced}
              onReset={onResetAdvanced}
              updateDraft={updateDraft}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
