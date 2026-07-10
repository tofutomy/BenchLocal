import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { updateLiveRunState } from "../runs/run-state";
import { isRunCancellationMessage, type LiveRunState } from "../runs/run-utils";
import { createTabTitle } from "../workspaces/workspace-utils";
import type { BenchPackInspection, BenchLocalWorkspaceState } from "@core";
import type {
  ActiveRunEntry,
  LiveScenarioFocusState,
  VerifierPreparationModalState
} from "./app-state";

type UseBenchPackRunEventsOptions = {
  workspaceStateRef: MutableRefObject<BenchLocalWorkspaceState | null>;
  benchPackInspectionsRef: MutableRefObject<BenchPackInspection[]>;
  setVerifierPreparationModal: Dispatch<SetStateAction<VerifierPreparationModalState | null>>;
  setAppNotice: Dispatch<SetStateAction<string | null>>;
  setActiveRuns: Dispatch<SetStateAction<Record<string, ActiveRunEntry>>>;
  setStoppingRuns: Dispatch<SetStateAction<Record<string, true>>>;
  setLiveRuns: Dispatch<SetStateAction<Record<string, LiveRunState>>>;
  setLiveScenarioFocus: Dispatch<SetStateAction<Record<string, LiveScenarioFocusState>>>;
};

// 将后台运行进度映射为界面状态，App 无需直接维护事件分支。
export function useBenchPackRunEvents({
  workspaceStateRef,
  benchPackInspectionsRef,
  setVerifierPreparationModal,
  setAppNotice,
  setActiveRuns,
  setStoppingRuns,
  setLiveRuns,
  setLiveScenarioFocus
}: UseBenchPackRunEventsOptions) {
  useEffect(() => {
    return window.benchlocal.benchPacks.onRunEvent(({ tabId, benchPackId, event }) => {
      if (event.type === "verifier_preparing") {
        setVerifierPreparationModal({
          tabId,
          progress: event
        });
      } else {
        setVerifierPreparationModal((current) => (current?.tabId === tabId ? null : current));
      }

      if (event.type === "run_finished" || event.type === "run_error") {
        if (event.type === "run_error" && isRunCancellationMessage(event.message)) {
          const resolvedBenchPackId = benchPackId ?? workspaceStateRef.current?.tabs[tabId]?.benchPackId ?? "";
          const benchPackName = resolvedBenchPackId
            ? createTabTitle(resolvedBenchPackId, benchPackInspectionsRef.current)
            : "Bench Pack run";
          setAppNotice(`Stopped ${benchPackName}.`);
        }

        setActiveRuns((current) => {
          if (!current[tabId]) {
            return current;
          }

          const next = { ...current };
          delete next[tabId];
          return next;
        });
        setStoppingRuns((current) => {
          if (!current[tabId]) {
            return current;
          }

          const next = { ...current };
          delete next[tabId];
          return next;
        });
      }

      if (event.type === "run_started") {
        setActiveRuns((current) => {
          if (current[tabId]) {
            return current;
          }

          const tabBenchPackId = workspaceStateRef.current?.tabs[tabId]?.benchPackId;

          if (!tabBenchPackId) {
            return current;
          }

          return {
            ...current,
            [tabId]: { benchPackId: tabBenchPackId, mode: "host" }
          };
        });
      }

      setLiveRuns((current) => ({
        ...current,
        [tabId]: updateLiveRunState(current[tabId], event)
      }));

      if (event.type === "run_started") {
        setLiveScenarioFocus((current) => ({
          ...current,
          [tabId]: {
            liveScenarioId: null,
            autoFollow: true
          }
        }));
      } else if (
        event.type === "scenario_started" ||
        event.type === "model_progress" ||
        event.type === "scenario_result" ||
        event.type === "scenario_finished"
      ) {
        setLiveScenarioFocus((current) => {
          const existing = current[tabId];
          return {
            ...current,
            [tabId]: {
              liveScenarioId: event.scenarioId,
              autoFollow: existing?.autoFollow ?? true
            }
          };
        });
      }
    });
  }, []);
}
