import type { Dispatch, SetStateAction } from "react";
import type { BenchLocalConfig, BenchLocalWorkspaceState } from "@core";
import { ModelAliasModal } from "../models/ModelAliasModal";
import { ModelBrowserModal, type ModelBrowserModalState } from "../models/ModelBrowserModal";
import {
  PROVIDER_KIND_OPTIONS,
  defaultModelLabel,
  defaultProviderApiKeyPlaceholder,
  defaultProviderBaseUrl,
  defaultProviderName,
  getProviderDisplayName,
  providerKindLabel,
  providerSupportsModelDiscovery
} from "../models/model-config";
import { ModelEditModal, ProviderEditModal } from "../models/ProviderModelEditModals";
import { SamplingModal, parseSamplingForm } from "../models/SamplingModal";
import { TabModelsModal } from "../models/TabModelsModal";
import { normalizeTabModelSelections, upsertTabModelAlias } from "../runs/run-state";
import type {
  ModelAliasModalState,
  ModelModalState,
  ProviderModalState,
  SamplingModalState,
  TabModelsModalState
} from "./app-state";

export function AppModelOverlays({
  draft,
  providerIds,
  providerModal,
  modelModal,
  modelBrowserModal,
  tabModelsModal,
  samplingModal,
  modelAliasModal,
  setProviderModal,
  setModelModal,
  setModelBrowserModal,
  setTabModelsModal,
  setSamplingModal,
  setModelAliasModal,
  setError,
  saveProviderModal,
  saveModelModal,
  openModelBrowser,
  confirmDeleteProvider,
  confirmDeleteModel,
  updateWorkspaceState
}: {
  draft: BenchLocalConfig | null;
  providerIds: string[];
  providerModal: ProviderModalState | null;
  modelModal: ModelModalState | null;
  modelBrowserModal: ModelBrowserModalState | null;
  tabModelsModal: TabModelsModalState | null;
  samplingModal: SamplingModalState | null;
  modelAliasModal: ModelAliasModalState | null;
  setProviderModal: Dispatch<SetStateAction<ProviderModalState | null>>;
  setModelModal: Dispatch<SetStateAction<ModelModalState | null>>;
  setModelBrowserModal: Dispatch<SetStateAction<ModelBrowserModalState | null>>;
  setTabModelsModal: Dispatch<SetStateAction<TabModelsModalState | null>>;
  setSamplingModal: Dispatch<SetStateAction<SamplingModalState | null>>;
  setModelAliasModal: Dispatch<SetStateAction<ModelAliasModalState | null>>;
  setError: (message: string | null) => void;
  saveProviderModal: () => void;
  saveModelModal: () => void;
  openModelBrowser: () => Promise<void>;
  confirmDeleteProvider: (providerId: string) => void;
  confirmDeleteModel: (index: number) => void;
  updateWorkspaceState: (updater: (current: BenchLocalWorkspaceState) => BenchLocalWorkspaceState) => void;
}) {
  return (
    <>
      {providerModal ? (
        <ProviderEditModal
          mode={providerModal.mode}
          form={providerModal.form}
          providerKindOptions={PROVIDER_KIND_OPTIONS.map((option) => option.value)}
          getProviderKindLabel={(kind) => providerKindLabel(kind)}
          getDefaultProviderName={defaultProviderName}
          getDefaultProviderApiKeyPlaceholder={defaultProviderApiKeyPlaceholder}
          onClose={() => setProviderModal(null)}
          onSubmit={saveProviderModal}
          onDelete={
            providerModal.mode === "edit"
              ? () => {
                  confirmDeleteProvider(providerModal.initialId);
                }
              : undefined
          }
          onKindChange={(kind) =>
            setProviderModal((current) =>
              current
                ? {
                    ...current,
                    form: {
                      ...current.form,
                      id: current.mode === "create" ? `${kind}-${crypto.randomUUID()}` : current.form.id,
                      kind,
                      name:
                        current.form.name.trim() === "" || current.form.name === defaultProviderName(current.form.kind)
                          ? defaultProviderName(kind)
                          : current.form.name,
                      base_url:
                        current.form.base_url === defaultProviderBaseUrl(current.form.kind)
                          ? defaultProviderBaseUrl(kind)
                          : current.form.base_url
                    }
                  }
                : current
            )
          }
          onNameChange={(value) =>
            setProviderModal((current) => current ? { ...current, form: { ...current.form, name: value } } : current)
          }
          onApiKeyChange={(value) =>
            setProviderModal((current) => current ? { ...current, form: { ...current.form, api_key: value } } : current)
          }
          onEnabledChange={(checked) =>
            setProviderModal((current) => current ? { ...current, form: { ...current.form, enabled: checked } } : current)
          }
          onBaseUrlChange={(value) =>
            setProviderModal((current) => current ? { ...current, form: { ...current.form, base_url: value } } : current)
          }
        />
      ) : null}

      {modelModal ? (
        <ModelEditModal
          mode={modelModal.mode}
          form={modelModal.form}
          providerIds={providerIds}
          providers={draft?.providers ?? {}}
          canBrowseModels={providerSupportsModelDiscovery(draft?.providers[modelModal.form.provider])}
          getProviderDisplayName={getProviderDisplayName}
          onClose={() => setModelModal(null)}
          onSubmit={saveModelModal}
          onDelete={
            modelModal.mode === "edit"
              ? () => {
                  confirmDeleteModel(modelModal.index);
                }
              : undefined
          }
          onProviderChange={(value) =>
            setModelModal((current) => current ? { ...current, form: { ...current.form, provider: value } } : current)
          }
          onGroupChange={(value) =>
            setModelModal((current) => current ? { ...current, form: { ...current.form, group: value } } : current)
          }
          onModelChange={(value) =>
            setModelModal((current) => current ? { ...current, form: { ...current.form, model: value } } : current)
          }
          onBrowseModels={() => void openModelBrowser()}
          onLabelChange={(value) =>
            setModelModal((current) => current ? { ...current, form: { ...current.form, label: value } } : current)
          }
          onEnabledChange={(checked) =>
            setModelModal((current) => current ? { ...current, form: { ...current.form, enabled: checked } } : current)
          }
        />
      ) : null}

      {modelBrowserModal ? (
        <ModelBrowserModal
          state={modelBrowserModal}
          onClose={() => setModelBrowserModal(null)}
          onQueryChange={(query) =>
            setModelBrowserModal((current) => (current ? { ...current, query } : current))
          }
          onSelect={(modelId) =>
            setModelBrowserModal((current) => (current ? { ...current, selectedModelId: modelId } : current))
          }
          onSubmit={() => {
            if (!modelBrowserModal.selectedModelId) {
              return;
            }

            const selectedEntry = modelBrowserModal.entries.find(
              (entry) => entry.id === modelBrowserModal.selectedModelId
            );

            if (!selectedEntry) {
              return;
            }

            setModelModal((current) => {
              if (!current) {
                return current;
              }

              const providerName = getProviderDisplayName(draft?.providers ?? {}, current.form.provider);
              const currentDefaultLabel = current.form.model.trim()
                ? defaultModelLabel(providerName, current.form.model, undefined)
                : "";
              const nextLabel = defaultModelLabel(providerName, selectedEntry.id, selectedEntry.name);
              const shouldAutofillLabel =
                current.form.label.trim() === "" || current.form.label.trim() === currentDefaultLabel;

              return {
                ...current,
                form: {
                  ...current.form,
                  model: selectedEntry.id,
                  label: shouldAutofillLabel ? nextLabel : current.form.label
                }
              };
            });
            setModelBrowserModal(null);
          }}
        />
      ) : null}

      {tabModelsModal && draft ? (
        <TabModelsModal
          providers={draft.providers}
          models={draft.models}
          selections={tabModelsModal.selections}
          onClose={() => setTabModelsModal(null)}
          onChange={(selections) => setTabModelsModal((current) => (current ? { ...current, selections } : current))}
          onSubmit={() => {
            const nextSelections = normalizeTabModelSelections(tabModelsModal.selections);

            updateWorkspaceState((current) => {
              const tab = current.tabs[tabModelsModal.tabId];

              if (!tab) {
                return current;
              }

              const workspace = Object.values(current.workspaces).find((candidate) =>
                candidate.tabIds.includes(tabModelsModal.tabId)
              );
              const updatedAt = new Date().toISOString();
              if (workspace) {
                // 模型对比列表属于 Workspace，所有 Tab 同步使用同一份选择。
                workspace.modelSelections = nextSelections;
                workspace.updatedAt = updatedAt;
                for (const tabId of workspace.tabIds) {
                  const workspaceTab = current.tabs[tabId];
                  if (!workspaceTab) continue;
                  workspaceTab.modelSelections = structuredClone(nextSelections);
                  workspaceTab.updatedAt = updatedAt;
                }
              } else {
                tab.modelSelections = nextSelections;
                tab.updatedAt = updatedAt;
              }
              return current;
            });

            setTabModelsModal(null);
          }}
        />
      ) : null}

      {samplingModal ? (
        <SamplingModal
          benchPackName={samplingModal.benchPackName}
          defaults={samplingModal.defaults}
          form={samplingModal.form}
          onClose={() => setSamplingModal(null)}
          onChange={(form) => setSamplingModal((current) => (current ? { ...current, form } : current))}
          onSubmit={() => {
            const parsed = parseSamplingForm(samplingModal.form);

            if (parsed.error) {
              setError(parsed.error);
              return;
            }

            updateWorkspaceState((current) => {
              const tab = current.tabs[samplingModal.tabId];

              if (!tab) {
                return current;
              }

              tab.samplingOverrides = parsed.value ?? {};
              tab.updatedAt = new Date().toISOString();
              return current;
            });

            setSamplingModal(null);
          }}
        />
      ) : null}

      {modelAliasModal && draft ? (
        <ModelAliasModal
          alias={modelAliasModal.alias}
          baseLabel={modelAliasModal.baseLabel}
          onAliasChange={(value) =>
            setModelAliasModal((current) => (current ? { ...current, alias: value } : current))
          }
          onClose={() => setModelAliasModal(null)}
          onSubmit={() => {
            updateWorkspaceState((current) => {
              const tab = current.tabs[modelAliasModal.tabId];

              if (!tab) {
                return current;
              }

              const nextSelections = upsertTabModelAlias(
                tab,
                draft.models,
                modelAliasModal.modelId,
                modelAliasModal.alias
              );
              const workspace = Object.values(current.workspaces).find((candidate) =>
                candidate.tabIds.includes(modelAliasModal.tabId)
              );
              const updatedAt = new Date().toISOString();
              if (workspace) {
                workspace.modelSelections = nextSelections;
                workspace.updatedAt = updatedAt;
                for (const tabId of workspace.tabIds) {
                  const workspaceTab = current.tabs[tabId];
                  if (!workspaceTab) continue;
                  workspaceTab.modelSelections = structuredClone(nextSelections);
                  workspaceTab.updatedAt = updatedAt;
                }
              } else {
                tab.modelSelections = nextSelections;
                tab.updatedAt = updatedAt;
              }
              return current;
            });

            setModelAliasModal(null);
          }}
        />
      ) : null}
    </>
  );
}
