import type { Dispatch, SetStateAction } from "react";
import type {
  BenchLocalWorkspace,
  BenchLocalWorkspaceState,
  BenchPackInspection,
  BenchPackRunSummary
} from "@core";
import type { ActiveRunEntry } from "../app/app-state";
import type { LiveRunState } from "../runs/run-utils";
import { normalizeRunsPerTest } from "../runs/run-utils";
import { createTabTitle } from "./workspace-utils";
import { createEmptyWorkspaceTab } from "./workspace-state";

type UseWorkspaceTabActionsOptions = {
  activeWorkspace: BenchLocalWorkspace | null;
  activeRuns: Record<string, ActiveRunEntry>;
  benchPackInspections: BenchPackInspection[];
  updateWorkspaceState: (updater: (current: BenchLocalWorkspaceState) => BenchLocalWorkspaceState) => void;
  setError: Dispatch<SetStateAction<string | null>>;
  setTabMenuOpen: Dispatch<SetStateAction<boolean>>;
  setTabContextMenu: Dispatch<SetStateAction<{ tabId: string; tabTitle: string; x: number; y: number } | null>>;
  setRunSummaries: Dispatch<SetStateAction<Record<string, BenchPackRunSummary>>>;
  setLiveRuns: Dispatch<SetStateAction<Record<string, LiveRunState>>>;
  setActiveRuns: Dispatch<SetStateAction<Record<string, ActiveRunEntry>>>;
};

// 统一标签页命令及其运行态清理，避免 App 同时承担工作区规则和场景编排。
export function useWorkspaceTabActions({
  activeWorkspace,
  activeRuns,
  benchPackInspections,
  updateWorkspaceState,
  setError,
  setTabMenuOpen,
  setTabContextMenu,
  setRunSummaries,
  setLiveRuns,
  setActiveRuns
}: UseWorkspaceTabActionsOptions) {
  const createTab = (benchPackId: string) => {
    if (!activeWorkspace) return;

    updateWorkspaceState((current) => {
      const workspace = current.workspaces[activeWorkspace.id];
      if (!workspace) return current;

      const now = new Date().toISOString();
      const tabId = `tab-${crypto.randomUUID()}`;
      current.tabs[tabId] = {
        ...createEmptyWorkspaceTab({ id: tabId, now, title: createTabTitle(benchPackId, benchPackInspections) }),
        benchPackId
      };
      workspace.tabIds.push(tabId);
      workspace.activeTabId = tabId;
      workspace.updatedAt = now;
      return current;
    });
    setTabMenuOpen(false);
  };

  const duplicateTab = (tabId: string) => {
    if (!activeWorkspace) return;

    updateWorkspaceState((current) => {
      const workspace = current.workspaces[activeWorkspace.id];
      const tab = current.tabs[tabId];
      if (!workspace || !tab) return current;

      const now = new Date().toISOString();
      const duplicateTabId = `tab-${crypto.randomUUID()}`;
      current.tabs[duplicateTabId] = {
        id: duplicateTabId,
        title: `${tab.title} Copy`,
        benchPackId: tab.benchPackId,
        loadedRunId: null,
        focusedScenarioId: tab.focusedScenarioId,
        modelSelections: structuredClone(tab.modelSelections),
        samplingOverrides: structuredClone(tab.samplingOverrides ?? {}),
        executionMode: tab.executionMode,
        runsPerTest: normalizeRunsPerTest(tab.runsPerTest),
        createdAt: now,
        updatedAt: now
      };
      const tabIndex = workspace.tabIds.indexOf(tabId);
      workspace.tabIds.splice(tabIndex >= 0 ? tabIndex + 1 : workspace.tabIds.length, 0, duplicateTabId);
      workspace.activeTabId = duplicateTabId;
      workspace.updatedAt = now;
      return current;
    });
    setTabContextMenu(null);
  };

  const assignBenchPackToTab = (tabId: string, benchPackId: string) => {
    updateWorkspaceState((current) => {
      const tab = current.tabs[tabId];
      if (!tab) return current;

      tab.title = createTabTitle(benchPackId, benchPackInspections);
      tab.benchPackId = benchPackId;
      tab.loadedRunId = null;
      tab.focusedScenarioId = null;
      tab.samplingOverrides = {};
      tab.updatedAt = new Date().toISOString();
      return current;
    });
    setTabMenuOpen(false);
  };

  const activateTab = (tabId: string) => {
    if (!activeWorkspace) return;

    updateWorkspaceState((current) => {
      const workspace = current.workspaces[activeWorkspace.id];
      if (!workspace) return current;
      workspace.activeTabId = tabId;
      workspace.updatedAt = new Date().toISOString();
      return current;
    });
  };

  const reorderTab = (draggedId: string, targetId: string) => {
    if (!activeWorkspace || draggedId === targetId) return;

    updateWorkspaceState((current) => {
      const workspace = current.workspaces[activeWorkspace.id];
      if (!workspace) return current;

      const nextTabIds = [...workspace.tabIds];
      const fromIndex = nextTabIds.indexOf(draggedId);
      const toIndex = nextTabIds.indexOf(targetId);
      if (fromIndex < 0 || toIndex < 0) return current;

      const [moved] = nextTabIds.splice(fromIndex, 1);
      nextTabIds.splice(toIndex, 0, moved);
      workspace.tabIds = nextTabIds;
      workspace.updatedAt = new Date().toISOString();
      return current;
    });
  };

  const closeTab = (tabId: string) => {
    if (!activeWorkspace) return;
    if (activeRuns[tabId]) {
      setError("Stop the Bench Pack run before closing this tab.");
      return;
    }

    updateWorkspaceState((current) => {
      const workspace = current.workspaces[activeWorkspace.id];
      if (!workspace) return current;

      workspace.tabIds = workspace.tabIds.filter((id) => id !== tabId);
      delete current.tabs[tabId];
      workspace.activeTabId =
        workspace.activeTabId === tabId ? workspace.tabIds[workspace.tabIds.length - 1] ?? null : workspace.activeTabId;
      workspace.updatedAt = new Date().toISOString();

      if (workspace.tabIds.length === 0) {
        const replacementTabId = `tab-${crypto.randomUUID()}`;
        current.tabs[replacementTabId] = createEmptyWorkspaceTab({ id: replacementTabId, now: workspace.updatedAt });
        workspace.tabIds = [replacementTabId];
        workspace.activeTabId = replacementTabId;
      }
      return current;
    });
    setRunSummaries((current) => removeTabState(current, tabId));
    setLiveRuns((current) => removeTabState(current, tabId));
    setActiveRuns((current) => removeTabState(current, tabId));
  };

  return { createTab, duplicateTab, assignBenchPackToTab, activateTab, reorderTab, closeTab };
}

function removeTabState<T>(current: Record<string, T>, tabId: string): Record<string, T> {
  if (!current[tabId]) return current;
  const next = { ...current };
  delete next[tabId];
  return next;
}
