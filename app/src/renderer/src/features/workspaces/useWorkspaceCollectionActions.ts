import type { Dispatch, SetStateAction } from "react";
import type { BenchLocalWorkspaceState, BenchPackRunSummary } from "@core";
import type { ActiveRunEntry } from "../app/app-state";
import type { LiveRunState } from "../runs/run-utils";
import { createWorkspaceName } from "./workspace-utils";
import { createWorkspaceWithEmptyTab } from "./workspace-state";

type UseWorkspaceCollectionActionsOptions = {
  workspaceState: BenchLocalWorkspaceState | null;
  activeRuns: Record<string, ActiveRunEntry>;
  updateWorkspaceState: (updater: (current: BenchLocalWorkspaceState) => BenchLocalWorkspaceState) => void;
  setError: Dispatch<SetStateAction<string | null>>;
  setWorkspaceContextMenu: Dispatch<SetStateAction<{ workspaceId: string; workspaceName: string; x: number; y: number } | null>>;
  setRunSummaries: Dispatch<SetStateAction<Record<string, BenchPackRunSummary>>>;
  setLiveRuns: Dispatch<SetStateAction<Record<string, LiveRunState>>>;
  setActiveRuns: Dispatch<SetStateAction<Record<string, ActiveRunEntry>>>;
  setStoppingRuns: Dispatch<SetStateAction<Record<string, true>>>;
};

// 集中工作区集合的同步命令，保持删除保护、兜底工作区与运行缓存清理一致。
export function useWorkspaceCollectionActions({
  workspaceState,
  activeRuns,
  updateWorkspaceState,
  setError,
  setWorkspaceContextMenu,
  setRunSummaries,
  setLiveRuns,
  setActiveRuns,
  setStoppingRuns
}: UseWorkspaceCollectionActionsOptions) {
  const createWorkspace = () => {
    updateWorkspaceState((current) => {
      const now = new Date().toISOString();
      const workspaceId = `workspace-${crypto.randomUUID()}`;
      const tabId = `tab-${crypto.randomUUID()}`;
      const created = createWorkspaceWithEmptyTab({
        workspaceId,
        tabId,
        name: createWorkspaceName(current.workspaceOrder.length),
        now
      });
      current.workspaceOrder.push(workspaceId);
      current.activeWorkspaceId = workspaceId;
      current.workspaces[workspaceId] = created.workspace;
      current.tabs[tabId] = created.tab;
      return current;
    });
  };

  const renameWorkspace = (workspaceId: string, name: string) => {
    updateWorkspaceState((current) => {
      const workspace = current.workspaces[workspaceId];
      if (!workspace) return current;
      workspace.name = name.trim();
      workspace.updatedAt = new Date().toISOString();
      return current;
    });
  };

  const deleteWorkspace = (workspaceId: string) => {
    const removedTabIds = new Set(workspaceState?.workspaces[workspaceId]?.tabIds ?? []);
    if (Array.from(removedTabIds).some((tabId) => activeRuns[tabId])) {
      setError("Stop active Bench Pack runs before deleting this workspace.");
      return;
    }

    updateWorkspaceState((current) => {
      const workspace = current.workspaces[workspaceId];
      if (!workspace) return current;

      for (const tabId of workspace.tabIds) delete current.tabs[tabId];
      delete current.workspaces[workspaceId];
      current.workspaceOrder = current.workspaceOrder.filter((id) => id !== workspaceId);

      if (current.workspaceOrder.length === 0) {
        const now = new Date().toISOString();
        const nextWorkspaceId = `workspace-${crypto.randomUUID()}`;
        const nextTabId = `tab-${crypto.randomUUID()}`;
        const created = createWorkspaceWithEmptyTab({
          workspaceId: nextWorkspaceId,
          tabId: nextTabId,
          name: "My Workspace",
          now
        });
        current.workspaceOrder = [nextWorkspaceId];
        current.activeWorkspaceId = nextWorkspaceId;
        current.workspaces[nextWorkspaceId] = created.workspace;
        current.tabs[nextTabId] = created.tab;
      } else if (current.activeWorkspaceId === workspaceId) {
        current.activeWorkspaceId = current.workspaceOrder[0] ?? null;
      }
      return current;
    });

    if (removedTabIds.size > 0) {
      setRunSummaries((current) => removeTabsFromState(current, removedTabIds));
      setLiveRuns((current) => removeTabsFromState(current, removedTabIds));
      setActiveRuns((current) => removeTabsFromState(current, removedTabIds));
      setStoppingRuns((current) => removeTabsFromState(current, removedTabIds));
    }
  };

  const activateWorkspace = (workspaceId: string) => {
    setWorkspaceContextMenu(null);
    updateWorkspaceState((current) => {
      current.activeWorkspaceId = workspaceId;
      return current;
    });
  };

  return { createWorkspace, renameWorkspace, deleteWorkspace, activateWorkspace };
}

function removeTabsFromState<T>(current: Record<string, T>, removedTabIds: Set<string>): Record<string, T> {
  return Object.fromEntries(Object.entries(current).filter(([tabId]) => !removedTabIds.has(tabId))) as Record<string, T>;
}
