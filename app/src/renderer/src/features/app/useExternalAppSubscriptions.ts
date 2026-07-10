import { useEffect, type Dispatch, type SetStateAction } from "react";
import { cloneConfig } from "../../shared/config-utils";
import type { BenchLocalConfig } from "@core";
import type { BenchLocalAgentAccessState } from "@/shared/desktop-api";
import type {
  BenchPackMutationState,
  LoadState,
  SettingsVerifierPreparationModalState
} from "./app-state";

type UseExternalAppSubscriptionsOptions = {
  setLoadState: Dispatch<SetStateAction<LoadState | null>>;
  setDraft: Dispatch<SetStateAction<BenchLocalConfig | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  loadBenchPackInspections: () => Promise<void>;
  loadRegistryEntries: () => Promise<void>;
  setAgentAccessState: Dispatch<SetStateAction<BenchLocalAgentAccessState | null>>;
  setBenchPackMutations: Dispatch<SetStateAction<Record<string, BenchPackMutationState>>>;
  setSettingsVerifierPreparationModal: Dispatch<SetStateAction<SettingsVerifierPreparationModalState | null>>;
};

// 汇总配置、Agent、Bench Pack 与验证器的外部状态订阅。
export function useExternalAppSubscriptions({
  setLoadState,
  setDraft,
  setError,
  loadBenchPackInspections,
  loadRegistryEntries,
  setAgentAccessState,
  setBenchPackMutations,
  setSettingsVerifierPreparationModal
}: UseExternalAppSubscriptionsOptions) {
  useEffect(() => {
    const loadUpdatedConfig = async () => {
      try {
        const result = await window.benchlocal.config.load();
        setLoadState(result);
        setDraft(cloneConfig(result.config));
        await loadBenchPackInspections();
        await loadRegistryEntries();
      } catch (configError) {
        setError(configError instanceof Error ? configError.message : "Failed to reload BenchLocal config.");
      }
    };

    return window.benchlocal.config.onUpdated(() => {
      void loadUpdatedConfig();
    });
  }, []);

  useEffect(() => {
    void window.benchlocal.agent.state().then(setAgentAccessState).catch(() => undefined);

    return window.benchlocal.agent.onState((state) => {
      void window.benchlocal.agent.state().then(setAgentAccessState).catch(() => {
        setAgentAccessState(state);
      });
    });
  }, []);

  useEffect(() => {
    return window.benchlocal.benchPacks.onMutationProgress((payload) => {
      setBenchPackMutations((current) => ({
        ...current,
        [payload.benchPackId]: payload
      }));
    });
  }, []);

  useEffect(() => {
    return window.benchlocal.verifiers.onProgress(({ benchPackId, event }) => {
      setSettingsVerifierPreparationModal((current) =>
        current?.benchPackId === benchPackId || current === null
          ? {
              benchPackId,
              progress: event
            }
          : current
      );
    });
  }, []);
}
