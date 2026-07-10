import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import {
  createEmptyModel,
  createEmptyProvider,
  toModelForm,
  toProviderForm
} from "../models/model-config";
import { SettingsScene, type SettingsTab } from "../settings/SettingsScene";
import { isAbortLikeError } from "../../shared/desktop-errors";
import type {
  BenchPackInspection,
  BenchPackRegistryEntry,
  BenchLocalAgentAccess,
  BenchLocalConfig,
  BenchLocalVerifierConfig
} from "@core";
import type { BenchLocalAgentAccessState, BenchPackVerifierStatus } from "@/shared/desktop-api";
import type {
  BenchPackMutationState,
  ModelModalState,
  ProviderModalState,
  SettingsVerifierPreparationModalState
} from "./app-state";
import type { ConfirmDialogState } from "../../shared/components/ConfirmDialog";

type AppSettingsSceneHostProps = {
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
  benchPackMutations: Record<string, BenchPackMutationState>;
  verifierStatuses: Record<string, BenchPackVerifierStatus>;
  agentAccessState: BenchLocalAgentAccessState | null;
  settingsOpenRef: MutableRefObject<boolean>;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setSettingsNotice: Dispatch<SetStateAction<string | null>>;
  setProviderModal: Dispatch<SetStateAction<ProviderModalState | null>>;
  setModelModal: Dispatch<SetStateAction<ModelModalState | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setStoppingVerifierStarts: Dispatch<SetStateAction<Record<string, true>>>;
  setSettingsVerifierPreparationModal: Dispatch<SetStateAction<SettingsVerifierPreparationModalState | null>>;
  setVerifierStatuses: Dispatch<SetStateAction<Record<string, BenchPackVerifierStatus>>>;
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState>>;
  setIsBusy: Dispatch<SetStateAction<boolean>>;
  save: () => Promise<boolean>;
  reset: () => void;
  duplicateProvider: (providerId: string) => Promise<void>;
  duplicateModel: (index: number) => Promise<void>;
  loadRegistryEntries: () => Promise<void>;
  installBenchPack: (benchPackId: string) => Promise<void>;
  installBenchPackFromUrl: (url: string) => Promise<boolean | void>;
  updateBenchPack: (benchPackId: string) => Promise<void>;
  uninstallInstalledBenchPack: (benchPackId: string) => Promise<void>;
  configureAgentAccess: (input: { enabled: boolean; access?: BenchLocalAgentAccess; port?: number }) => Promise<void>;
  regenerateAgentToken: () => Promise<void>;
  updateDraft: (updater: (current: BenchLocalConfig) => BenchLocalConfig) => void;
  saveVerifierConfig: (
    benchPackId: string,
    verifierId: string,
    updater: (verifier: BenchLocalVerifierConfig) => BenchLocalVerifierConfig
  ) => Promise<void>;
};

// 集中设置页的 UI 接线，避免 App 主场景混入大量设置专属回调。
export function AppSettingsSceneHost({
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
  settingsOpenRef,
  setSettingsOpen,
  setSettingsNotice,
  setProviderModal,
  setModelModal,
  setError,
  setStoppingVerifierStarts,
  setSettingsVerifierPreparationModal,
  setVerifierStatuses,
  setConfirmDialog,
  setIsBusy,
  save,
  reset,
  duplicateProvider,
  duplicateModel,
  loadRegistryEntries,
  installBenchPack,
  installBenchPackFromUrl,
  updateBenchPack,
  uninstallInstalledBenchPack,
  configureAgentAccess,
  regenerateAgentToken,
  updateDraft,
  saveVerifierConfig
}: AppSettingsSceneHostProps) {
  return (
    <SettingsScene
      settingsTab={settingsTab}
      setSettingsTab={setSettingsTab}
      draft={draft}
      configPath={configPath}
      hasUnsavedChanges={hasUnsavedChanges}
      isBusy={isBusy}
      providerIds={providerIds}
      benchPackInspections={benchPackInspections}
      registryEntries={registryEntries}
      registryWarning={registryWarning}
      benchPackMutations={benchPackMutations}
      verifierStatuses={verifierStatuses}
      agentAccessState={agentAccessState}
      onBack={() => {
        setSettingsNotice(null);
        setSettingsOpen(false);
      }}
      onSaveAdvanced={() => void save()}
      onResetAdvanced={reset}
      onCreateProvider={() => setProviderModal({ mode: "create", form: createEmptyProvider() })}
      onEditProvider={(providerId) =>
        setProviderModal({
          mode: "edit",
          initialId: providerId,
          form: toProviderForm(providerId, draft.providers[providerId])
        })
      }
      onDuplicateProvider={(providerId) => void duplicateProvider(providerId)}
      onCreateModel={() => setModelModal({ mode: "create", form: createEmptyModel(providerIds[0] ?? "openrouter") })}
      onEditModel={(index) => setModelModal({ mode: "edit", index, form: toModelForm(draft.models[index]) })}
      onDuplicateModel={(index) => void duplicateModel(index)}
      onStartVerifier={async (benchPackId, benchPackName, verifierId) => {
        setError(null);
        setStoppingVerifierStarts((current) => {
          if (!current[benchPackId]) {
            return current;
          }

          const next = { ...current };
          delete next[benchPackId];
          return next;
        });
        setSettingsVerifierPreparationModal({
          benchPackId,
          progress: {
            type: "verifier_preparing",
            benchPackId,
            benchPackName,
            verifierId,
            phase: "checking_docker",
            message: "Checking Local Docker availability."
          }
        });

        try {
          const status = await window.benchlocal.verifiers.start({ benchPackId });
          setVerifierStatuses((current) => ({ ...current, [benchPackId]: status }));
        } catch (verifierError) {
          if (isAbortLikeError(verifierError)) {
            if (settingsOpenRef.current) {
              setSettingsNotice(`Cancelled preparing ${verifierId}.`);
            }
          } else {
            setError(verifierError instanceof Error ? verifierError.message : "Failed to start verifier.");
          }
        } finally {
          setSettingsVerifierPreparationModal((current) => (current?.benchPackId === benchPackId ? null : current));
          setStoppingVerifierStarts((current) => {
            if (!current[benchPackId]) {
              return current;
            }

            const next = { ...current };
            delete next[benchPackId];
            return next;
          });
        }
      }}
      onStopVerifier={async (benchPackId) => {
        try {
          const status = await window.benchlocal.verifiers.stop({ benchPackId });
          setVerifierStatuses((current) => ({ ...current, [benchPackId]: status }));
        } catch (verifierError) {
          setError(verifierError instanceof Error ? verifierError.message : "Failed to stop verifier.");
        }
      }}
      onDeleteVerifierImage={(benchPackId, benchPackName, verifierId) => {
        setConfirmDialog({
          title: "Delete Verifier Image",
          subtitle: `Delete the Local Docker image for verifier "${verifierId}" in ${benchPackName}? BenchLocal will pull or rebuild it again the next time this verifier starts.`,
          confirmLabel: "Delete Image",
          tone: "danger",
          onConfirm: () => {
            void (async () => {
              setIsBusy(true);
              setError(null);

              try {
                const result = await window.benchlocal.verifiers.deleteImage({ benchPackId, verifierId });
                setVerifierStatuses((current) => ({ ...current, [benchPackId]: result.status }));
                if (settingsOpenRef.current) {
                  setSettingsNotice(
                    result.removed
                      ? `Deleted Docker image ${result.image}.`
                      : `Docker image ${result.image} was already absent.`
                  );
                }
              } catch (verifierError) {
                setError(verifierError instanceof Error ? verifierError.message : "Failed to delete verifier image.");
              } finally {
                setIsBusy(false);
              }
            })();
          }
        });
      }}
      onRefreshRegistry={() => void loadRegistryEntries()}
      onInstallBenchPack={(benchPackId) => void installBenchPack(benchPackId)}
      onInstallBenchPackFromUrl={installBenchPackFromUrl}
      onUpdateBenchPack={(benchPackId) => void updateBenchPack(benchPackId)}
      onUninstallBenchPack={(benchPackId) => void uninstallInstalledBenchPack(benchPackId)}
      onConfigureAgentAccess={(input) => void configureAgentAccess(input)}
      onRegenerateAgentToken={() => void regenerateAgentToken()}
      updateDraft={updateDraft}
      onUpdateVerifier={(benchPackId, verifierId, updater) => {
        void saveVerifierConfig(benchPackId, verifierId, updater);
      }}
    />
  );
}
