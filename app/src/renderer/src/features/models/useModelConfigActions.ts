import type { Dispatch, SetStateAction } from "react";
import type { BenchLocalConfig, BenchLocalModelConfig, BenchLocalWorkspaceState } from "@core";
import type { LoadState, ModelModalState } from "../app/app-state";
import { cloneConfig } from "../../shared/config-utils";
import {
  buildModelConfig,
  createCopyLabel,
  createUniqueModelId,
  getProviderDisplayName
} from "./model-config";

type PersistConfig = (
  config: BenchLocalConfig,
  options: { notice: string; preserveFilesystemDraft: boolean; previousDraft: BenchLocalConfig; previousLoadConfig: BenchLocalConfig | null }
) => Promise<boolean>;

type UseModelConfigActionsOptions = {
  draft: BenchLocalConfig | null;
  loadState: LoadState | null;
  modelModal: ModelModalState | null;
  persistConfig: PersistConfig;
  updateWorkspaceState: (updater: (current: BenchLocalWorkspaceState) => BenchLocalWorkspaceState) => void;
  setError: Dispatch<SetStateAction<string | null>>;
  setModelModal: Dispatch<SetStateAction<ModelModalState | null>>;
};

// 集中 Model 写入与跨标签 ID 迁移，保证配置和工作区引用始终同步。
export function useModelConfigActions({ draft, loadState, modelModal, persistConfig, updateWorkspaceState, setError, setModelModal }: UseModelConfigActionsOptions) {
  const saveModelModal = async () => {
    if (!modelModal || !draft) return;
    const modelConfig = buildModelConfig(modelModal.form, draft.providers);
    if (!modelConfig.provider || !modelConfig.model) {
      setError("Model provider and model identifier are required.");
      return;
    }
    if (!draft.providers[modelConfig.provider]) {
      setError(`Model provider "${getProviderDisplayName(draft.providers, modelConfig.provider)}" does not exist yet.`);
      return;
    }

    const previousModelId = modelModal.mode === "edit" ? draft.models[modelModal.index]?.id ?? null : null;
    const previousDraft = cloneConfig(draft);
    const previousLoadConfig = loadState ? cloneConfig(loadState.config) : null;
    const nextConfig = previousLoadConfig ? cloneConfig(previousLoadConfig) : cloneConfig(draft);
    if (modelModal.mode === "create") nextConfig.models.push(modelConfig);
    else nextConfig.models[modelModal.index] = modelConfig;

    if (!(await persistConfig(nextConfig, {
      notice: modelModal.mode === "create" ? "Added model." : "Updated model.", preserveFilesystemDraft: true, previousDraft, previousLoadConfig
    }))) return;

    if (previousModelId && previousModelId !== modelConfig.id) {
      updateWorkspaceState((current) => {
        for (const tab of Object.values(current.tabs)) {
          tab.modelSelections = tab.modelSelections.map((selection) =>
            selection.modelId === previousModelId ? { ...selection, modelId: modelConfig.id } : selection
          );
        }
        return current;
      });
    }
    setModelModal(null);
  };

  const deleteModel = async (index: number): Promise<boolean> => {
    if (!draft) return false;
    const removedModelId = draft.models[index]?.id ?? null;
    const previousDraft = cloneConfig(draft);
    const previousLoadConfig = loadState ? cloneConfig(loadState.config) : null;
    const nextConfig = previousLoadConfig ? cloneConfig(previousLoadConfig) : cloneConfig(draft);
    nextConfig.models.splice(index, 1);
    if (!(await persistConfig(nextConfig, { notice: "Deleted model.", preserveFilesystemDraft: true, previousDraft, previousLoadConfig }))) return false;
    if (removedModelId) {
      updateWorkspaceState((current) => {
        for (const tab of Object.values(current.tabs)) {
          tab.modelSelections = tab.modelSelections.filter((selection) => selection.modelId !== removedModelId);
        }
        return current;
      });
    }
    return true;
  };

  const duplicateModel = async (index: number) => {
    if (!draft) return;
    const model = draft.models[index];
    if (!model) return;
    const previousDraft = cloneConfig(draft);
    const previousLoadConfig = loadState ? cloneConfig(loadState.config) : null;
    const nextConfig = previousLoadConfig ? cloneConfig(previousLoadConfig) : cloneConfig(draft);
    const nextModelLabel = createCopyLabel(model.label || model.model || model.id, nextConfig.models.map((candidate) => candidate.label));
    const nextModel: BenchLocalModelConfig = { ...model, id: createUniqueModelId(model, nextConfig.models), label: nextModelLabel };
    nextConfig.models.push(nextModel);
    await persistConfig(nextConfig, { notice: `Duplicated model "${nextModelLabel}".`, preserveFilesystemDraft: true, previousDraft, previousLoadConfig });
  };

  return { saveModelModal, deleteModel, duplicateModel };
}
