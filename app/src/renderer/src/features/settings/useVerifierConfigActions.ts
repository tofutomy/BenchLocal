import type { Dispatch, SetStateAction } from "react";
import type { BenchLocalConfig, BenchLocalVerifierConfig } from "@core";
import type { LoadState, SettingsVerifierPreparationModalState } from "../app/app-state";
import { cloneConfig } from "../../shared/config-utils";

type PersistConfig = (
  config: BenchLocalConfig,
  options: {
    preserveFilesystemDraft: boolean;
    previousDraft: BenchLocalConfig;
    previousLoadConfig: BenchLocalConfig | null;
  }
) => Promise<boolean>;

type Options = {
  draft: BenchLocalConfig | null;
  loadState: LoadState | null;
  persistConfig: PersistConfig;
  setDraft: Dispatch<SetStateAction<BenchLocalConfig | null>>;
  setStoppingVerifierStarts: Dispatch<SetStateAction<Record<string, true>>>;
  setSettingsVerifierPreparationModal: Dispatch<SetStateAction<SettingsVerifierPreparationModalState | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
};

// 管理 Verifier 配置持久化与准备阶段取消状态。
export function useVerifierConfigActions(options: Options) {
  const saveVerifierConfig = async (
    benchPackId: string,
    verifierId: string,
    updater: (verifier: BenchLocalVerifierConfig) => BenchLocalVerifierConfig
  ) => {
    if (!options.draft) return;
    const currentVerifier = options.draft.benchpacks[benchPackId]?.verifiers?.[verifierId];
    if (!currentVerifier) return;

    const previousDraft = cloneConfig(options.draft);
    const previousLoadConfig = options.loadState ? cloneConfig(options.loadState.config) : null;
    const nextConfig = previousLoadConfig ? cloneConfig(previousLoadConfig) : cloneConfig(options.draft);
    nextConfig.benchpacks[benchPackId].verifiers![verifierId] = updater(currentVerifier);
    options.setDraft(nextConfig);
    const saved = await options.persistConfig(nextConfig, {
      preserveFilesystemDraft: true,
      previousDraft,
      previousLoadConfig
    });
    if (!saved) options.setDraft(previousDraft);
  };

  const cancelSettingsVerifierStart = async (benchPackId: string) => {
    options.setStoppingVerifierStarts((current) => ({ ...current, [benchPackId]: true }));
    try {
      const result = await window.benchlocal.verifiers.cancelStart({ benchPackId });
      if (!result.cancelled) {
        options.setSettingsVerifierPreparationModal((current) => (current?.benchPackId === benchPackId ? null : current));
        options.setStoppingVerifierStarts((current) => withoutKey(current, benchPackId));
      }
    } catch (error) {
      options.setStoppingVerifierStarts((current) => withoutKey(current, benchPackId));
      options.setError(error instanceof Error ? error.message : "Failed to cancel verifier start.");
    }
  };

  return { saveVerifierConfig, cancelSettingsVerifierStart };
}

function withoutKey<T>(current: Record<string, T>, key: string): Record<string, T> {
  if (!current[key]) return current;
  const next = { ...current };
  delete next[key];
  return next;
}
