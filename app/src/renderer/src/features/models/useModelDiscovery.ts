import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { BenchLocalConfig } from "@core";
import type { BenchLocalDiscoveredModel } from "@/shared/desktop-api";
import type { ModelModalState } from "../app/app-state";
import type { ModelBrowserModalState } from "./ModelBrowserModal";
import { getProviderDisplayName, providerSupportsModelDiscovery } from "./model-config";

type Options = {
  draft: BenchLocalConfig | null;
  modelModal: ModelModalState | null;
  cacheRef: MutableRefObject<Record<string, BenchLocalDiscoveredModel[]>>;
  setModelBrowserModal: Dispatch<SetStateAction<ModelBrowserModalState | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
};

// 管理模型发现的能力校验、缓存与弹窗加载状态，避免配置动作混入网络交互。
export function useModelDiscovery({ draft, modelModal, cacheRef, setModelBrowserModal, setError }: Options) {
  const openModelBrowser = async () => {
    if (!modelModal || !draft) return;
    const provider = draft.providers[modelModal.form.provider];
    const providerName = getProviderDisplayName(draft.providers, modelModal.form.provider);
    if (!provider) {
      setError("Select a provider first.");
      return;
    }
    if (!providerSupportsModelDiscovery(provider)) {
      setError(`${providerName} does not support model browsing yet.`);
      return;
    }
    const cacheKey = `${provider.kind}::${provider.base_url}`;
    const entries = cacheRef.current[cacheKey];
    setModelBrowserModal({
      providerId: modelModal.form.provider,
      providerName,
      entries: entries ?? [],
      query: "",
      selectedModelId: modelModal.form.model.trim() || entries?.[0]?.id || null,
      loading: !entries,
      error: null
    });
    if (entries) return;
    try {
      const discovered = await window.benchlocal.models.discover({ provider });
      cacheRef.current[cacheKey] = discovered;
      setModelBrowserModal((current) => current && current.providerId === modelModal.form.provider
        ? { ...current, entries: discovered, selectedModelId: current.selectedModelId ?? discovered[0]?.id ?? null, loading: false }
        : current);
    } catch (error) {
      setModelBrowserModal((current) => current && current.providerId === modelModal.form.provider
        ? { ...current, loading: false, error: error instanceof Error ? error.message : `Failed to load models from ${providerName}.` }
        : current);
    }
  };
  return { openModelBrowser };
}
