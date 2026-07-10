import { useEffect, type Dispatch, type SetStateAction } from "react";
import { formatRegistryWarning } from "../benchpacks/registry-errors";
import type { LoadedHistoryEntry } from "../runs/run-utils";
import { cloneConfig } from "../../shared/config-utils";
import type {
  BenchPackInspection,
  BenchPackRegistryEntry,
  BenchPackRunSummary,
  BenchLocalConfig,
  BenchLocalThemeDescriptor,
  BenchLocalWorkspaceState
} from "@core";
import type { BenchLocalAgentAccessState, BenchPackVerifierStatus } from "@/shared/desktop-api";
import type { ActiveRunEntry, LoadState } from "./app-state";

type UseAppBootstrapOptions = {
  setIsBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setRegistryWarning: Dispatch<SetStateAction<string | null>>;
  setLoadState: Dispatch<SetStateAction<LoadState | null>>;
  setDraft: Dispatch<SetStateAction<BenchLocalConfig | null>>;
  setWorkspaceState: Dispatch<SetStateAction<BenchLocalWorkspaceState | null>>;
  setRunSummaries: Dispatch<SetStateAction<Record<string, BenchPackRunSummary>>>;
  setLoadedHistoryRuns: Dispatch<SetStateAction<Record<string, LoadedHistoryEntry>>>;
  setBenchPackInspections: Dispatch<SetStateAction<BenchPackInspection[]>>;
  setRegistryEntries: Dispatch<SetStateAction<BenchPackRegistryEntry[]>>;
  setAvailableThemes: Dispatch<SetStateAction<BenchLocalThemeDescriptor[]>>;
  setAgentAccessState: Dispatch<SetStateAction<BenchLocalAgentAccessState | null>>;
  setVerifierStatuses: Dispatch<SetStateAction<Record<string, BenchPackVerifierStatus>>>;
  setActiveRuns: Dispatch<SetStateAction<Record<string, ActiveRunEntry>>>;
  setAppNotice: Dispatch<SetStateAction<string | null>>;
};

// 首次进入应用时并行加载桌面状态，并恢复已持久化的运行历史。
export function useAppBootstrap({
  setIsBusy,
  setError,
  setRegistryWarning,
  setLoadState,
  setDraft,
  setWorkspaceState,
  setRunSummaries,
  setLoadedHistoryRuns,
  setBenchPackInspections,
  setRegistryEntries,
  setAvailableThemes,
  setAgentAccessState,
  setVerifierStatuses,
  setActiveRuns,
  setAppNotice
}: UseAppBootstrapOptions) {
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsBusy(true);
      setError(null);
      setRegistryWarning(null);

      try {
        const [result, workspaceResult, inspections, themes, verifierStatusList, activeRunsResult, agentState] = await Promise.all([
          window.benchlocal.config.load(),
          window.benchlocal.workspaces.load(),
          window.benchlocal.benchPacks.list(),
          window.benchlocal.themes.list(),
          window.benchlocal.verifiers.list(),
          window.benchlocal.benchPacks.activeRuns(),
          window.benchlocal.agent.state()
        ]);

        let registry: BenchPackRegistryEntry[] = [];
        let nextRegistryWarning: string | null = null;

        try {
          registry = await window.benchlocal.benchPacks.registry();
        } catch (registryError) {
          nextRegistryWarning = formatRegistryWarning(registryError);
        }

        if (cancelled) {
          return;
        }

        const persistedRunEntries = await Promise.all(
          Object.values(workspaceResult.state.tabs)
            .filter((tab) => tab.benchPackId && tab.loadedRunId)
            .map(async (tab) => {
              try {
                const summary = await window.benchlocal.benchPacks.loadHistory({
                  benchPackId: tab.benchPackId as string,
                  runId: tab.loadedRunId as string
                });
                return [tab.id, summary] as const;
              } catch {
                return null;
              }
            })
        );

        setLoadState(result);
        setDraft(cloneConfig(result.config));
        setWorkspaceState(workspaceResult.state);
        setRunSummaries(
          Object.fromEntries(
            persistedRunEntries.filter((entry): entry is readonly [string, BenchPackRunSummary] => entry !== null)
          )
        );
        setLoadedHistoryRuns(
          Object.fromEntries(
            persistedRunEntries
              .filter((entry): entry is readonly [string, BenchPackRunSummary] => entry !== null)
              .map(([tabId, summary]) => [
                tabId,
                {
                  runId: summary.runId,
                  startedAt: summary.startedAt,
                  mode: "history" as const
                }
              ])
          )
        );
        setBenchPackInspections(inspections);
        setRegistryEntries(registry);
        setRegistryWarning(nextRegistryWarning);
        setAvailableThemes(themes);
        setAgentAccessState(agentState);
        setVerifierStatuses(Object.fromEntries(verifierStatusList.map((status) => [status.benchPackId, status])));
        setActiveRuns(Object.fromEntries(activeRunsResult.map((run) => [run.tabId, { benchPackId: run.benchPackId }])));
        setAppNotice(result.created ? "Created a fresh ~/.benchlocal/config.toml bootstrap." : null);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load BenchLocal config.");
        }
      } finally {
        if (!cancelled) {
          setIsBusy(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);
}
