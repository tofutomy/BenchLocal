import type { Dispatch, SetStateAction } from "react";
import type { BenchLocalConfig, BenchLocalWorkspaceState } from "@core";
import type { LoadState, ProviderModalState } from "../app/app-state";
import {
  createCopyLabel,
  createUniqueProviderId,
  defaultProviderName,
  getProviderDisplayName
} from "./model-config";
import { cloneConfig } from "../../shared/config-utils";

type PersistConfig = (
  config: BenchLocalConfig,
  options: {
    notice: string;
    preserveFilesystemDraft: boolean;
    previousDraft: BenchLocalConfig;
    previousLoadConfig: BenchLocalConfig | null;
  }
) => Promise<boolean>;

type UseProviderConfigActionsOptions = {
  draft: BenchLocalConfig | null;
  loadState: LoadState | null;
  providerModal: ProviderModalState | null;
  persistConfig: PersistConfig;
  updateWorkspaceState: (updater: (current: BenchLocalWorkspaceState) => BenchLocalWorkspaceState) => void;
  setProviderModal: Dispatch<SetStateAction<ProviderModalState | null>>;
};

// 收拢 Provider 配置写入与关联模型选择清理，避免设置页回调分散业务规则。
export function useProviderConfigActions({
  draft,
  loadState,
  providerModal,
  persistConfig,
  updateWorkspaceState,
  setProviderModal
}: UseProviderConfigActionsOptions) {
  const saveProviderModal = async () => {
    if (!providerModal || !draft) return;

    const providerId = providerModal.form.id.trim();
    const previousDraft = cloneConfig(draft);
    const previousLoadConfig = loadState ? cloneConfig(loadState.config) : null;
    const nextConfig = previousLoadConfig ? cloneConfig(previousLoadConfig) : cloneConfig(draft);
    nextConfig.providers[providerId] = {
      kind: providerModal.form.kind,
      name: providerModal.form.name.trim() || defaultProviderName(providerModal.form.kind),
      enabled: providerModal.form.enabled,
      base_url: providerModal.form.base_url.trim(),
      api_key: providerModal.form.api_key.trim() || undefined
    };

    if (await persistConfig(nextConfig, {
      notice: providerModal.mode === "create" ? "Added provider." : "Updated provider.",
      preserveFilesystemDraft: true,
      previousDraft,
      previousLoadConfig
    })) {
      setProviderModal(null);
    }
  };

  const deleteProvider = async (providerId: string): Promise<boolean> => {
    if (!draft) return false;

    const providerName = getProviderDisplayName(draft.providers, providerId);
    const removedModelIds = new Set(draft.models.filter((model) => model.provider === providerId).map((model) => model.id));
    const previousDraft = cloneConfig(draft);
    const previousLoadConfig = loadState ? cloneConfig(loadState.config) : null;
    const nextConfig = previousLoadConfig ? cloneConfig(previousLoadConfig) : cloneConfig(draft);
    delete nextConfig.providers[providerId];
    nextConfig.models = nextConfig.models.filter((model) => model.provider !== providerId);

    if (!(await persistConfig(nextConfig, {
      notice: `Deleted provider "${providerName}".`,
      preserveFilesystemDraft: true,
      previousDraft,
      previousLoadConfig
    }))) return false;

    if (removedModelIds.size > 0) {
      updateWorkspaceState((current) => {
        for (const tab of Object.values(current.tabs)) {
          tab.modelSelections = tab.modelSelections.filter((selection) => !removedModelIds.has(selection.modelId));
        }
        return current;
      });
    }
    return true;
  };

  const duplicateProvider = async (providerId: string) => {
    if (!draft) return;
    const provider = draft.providers[providerId];
    if (!provider) return;

    const previousDraft = cloneConfig(draft);
    const previousLoadConfig = loadState ? cloneConfig(loadState.config) : null;
    const nextConfig = previousLoadConfig ? cloneConfig(previousLoadConfig) : cloneConfig(draft);
    const nextProviderId = createUniqueProviderId(provider.kind, nextConfig.providers);
    const nextProviderName = createCopyLabel(getProviderDisplayName(draft.providers, providerId), Object.values(nextConfig.providers).map((item) => item.name));
    nextConfig.providers[nextProviderId] = { ...provider, name: nextProviderName };
    await persistConfig(nextConfig, {
      notice: `Duplicated provider "${nextProviderName}".`,
      preserveFilesystemDraft: true,
      previousDraft,
      previousLoadConfig
    });
  };

  return { saveProviderModal, deleteProvider, duplicateProvider };
}
