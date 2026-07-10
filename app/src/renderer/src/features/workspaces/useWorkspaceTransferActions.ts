import type { Dispatch, SetStateAction } from "react";
import type { BenchLocalWorkspaceState } from "@core";
import { normalizeRunsPerTest } from "../runs/run-utils";

type Options = {
  workspaceState: BenchLocalWorkspaceState | null;
  updateWorkspaceState: (updater: (current: BenchLocalWorkspaceState) => BenchLocalWorkspaceState) => void;
  setAppNotice: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
};

// 隔离工作区文件传输与导入时的 ID 重映射。
export function useWorkspaceTransferActions({ workspaceState, updateWorkspaceState, setAppNotice, setError }: Options) {
  const exportWorkspace = async (workspaceId: string) => {
    if (!workspaceState) return;
    try {
      const result = await window.benchlocal.workspaces.export({ workspaceId, state: workspaceState });
      if (result.exported) setAppNotice(`Exported workspace to ${result.filePath}.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to export workspace.");
    }
  };

  const importWorkspace = async () => {
    try {
      const result = await window.benchlocal.workspaces.import();
      if (!result.imported || !result.workspace || !result.tabs) return;
      const importedWorkspace = result.workspace;
      const importedTabs = result.tabs;
      const tabIdMap = new Map<string, string>();
      const newWorkspaceId = `workspace-${crypto.randomUUID()}`;

      updateWorkspaceState((current) => {
        const now = new Date().toISOString();
        const nextTabIds = importedWorkspace.tabIds.map((tabId) => {
          const nextTabId = `tab-${crypto.randomUUID()}`;
          tabIdMap.set(tabId, nextTabId);
          const importedTab = importedTabs[tabId];
          if (importedTab) {
            const record = importedTab as typeof importedTab & { pluginId?: string | null };
            current.tabs[nextTabId] = {
              ...record,
              id: nextTabId,
              benchPackId: record.benchPackId ?? record.pluginId ?? null,
              samplingOverrides: importedTab.samplingOverrides ?? {},
              executionMode: importedTab.executionMode ?? "parallel_by_test_case",
              runsPerTest: normalizeRunsPerTest(importedTab.runsPerTest),
              createdAt: importedTab.createdAt ?? now,
              updatedAt: now
            };
          }
          return nextTabId;
        });
        current.workspaceOrder.push(newWorkspaceId);
        current.activeWorkspaceId = newWorkspaceId;
        current.workspaces[newWorkspaceId] = {
          ...importedWorkspace,
          id: newWorkspaceId,
          name: Object.values(current.workspaces).some((workspace) => workspace.name === importedWorkspace.name)
            ? `${importedWorkspace.name} Imported`
            : importedWorkspace.name,
          tabIds: nextTabIds,
          activeTabId: importedWorkspace.activeTabId
            ? tabIdMap.get(importedWorkspace.activeTabId) ?? nextTabIds[0] ?? null
            : nextTabIds[0] ?? null,
          createdAt: importedWorkspace.createdAt ?? now,
          updatedAt: now
        };
        return current;
      });
      setAppNotice(`Imported workspace "${importedWorkspace.name}".`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to import workspace.");
    }
  };

  return { exportWorkspace, importWorkspace };
}
