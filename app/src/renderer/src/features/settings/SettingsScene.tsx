import { type ReactNode } from "react";
import { Bot, ChevronLeft, PlugZap, Server, Wrench } from "lucide-react";
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
import { BenchPackRegistryView } from "../benchpacks/BenchPackRegistryView";
import { AdvancedSettingsView } from "./AdvancedSettingsView";
import { AgentAccessView } from "./AgentAccessView";
import { ModelsView, ProvidersView } from "./ProviderModelViews";
import { VerificationView } from "./VerificationView";

export type SettingsTab = "providers" | "models" | "benchPacks" | "verification" | "agent" | "advanced";

const SETTINGS_TABS: Array<{ id: SettingsTab; label: string; blurb: string; icon: ReactNode }> = [
  { id: "providers", label: "Providers", blurb: "Provider endpoints and credentials.", icon: <Server size={16} /> },
  { id: "models", label: "Models", blurb: "Shared model registry across Bench Packs.", icon: <Bot size={16} /> },
  { id: "benchPacks", label: "Bench Packs", blurb: "Browse, install, update, and remove official Bench Packs.", icon: <PlugZap size={16} /> },
  { id: "verification", label: "Verification", blurb: "Managed verifiers and dependency modes.", icon: <Wrench size={16} /> },
  { id: "agent", label: "Agent Access", blurb: "Local API and live event stream for AI agents.", icon: <Server size={16} /> }
];

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
  onUpdateVerifier
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
  onUpdateVerifier: (
    benchPackId: string,
    verifierId: string,
    updater: (verifier: BenchLocalVerifierConfig) => BenchLocalVerifierConfig
  ) => void;
}) {
  return (
    <section className="settings-scene">
      <aside className="settings-sidebar">
        <div className="settings-sidebar-header">
          <button type="button" onClick={onBack} className="settings-back-button">
            <ChevronLeft size={16} />
            Back to Main Scene
          </button>
          <div className="settings-sidebar-title-block">
            <p className="eyebrow">Settings</p>
            <h2 className="settings-sidebar-title">Preferences</h2>
          </div>
        </div>

        <div className="settings-sidebar-group">
          {SETTINGS_TABS.map((tab) => (
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
