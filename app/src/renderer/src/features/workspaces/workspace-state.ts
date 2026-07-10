import type { BenchLocalWorkspace, BenchLocalWorkspaceTab } from "@core";

type CreateEmptyTabInput = {
  id: string;
  now: string;
  title?: string;
};

type CreateWorkspaceWithEmptyTabInput = {
  workspaceId: string;
  tabId: string;
  name: string;
  now: string;
};

// 统一空标签的默认值，确保所有工作区入口遵守同一组运行配置不变量。
export function createEmptyWorkspaceTab({ id, now, title = "New Tab" }: CreateEmptyTabInput): BenchLocalWorkspaceTab {
  return {
    id,
    title,
    benchPackId: null,
    loadedRunId: null,
    focusedScenarioId: null,
    modelSelections: [],
    samplingOverrides: {},
    executionMode: "parallel_by_test_case",
    runsPerTest: 1,
    createdAt: now,
    updatedAt: now
  };
}

export function createWorkspaceWithEmptyTab({
  workspaceId,
  tabId,
  name,
  now
}: CreateWorkspaceWithEmptyTabInput): { workspace: BenchLocalWorkspace; tab: BenchLocalWorkspaceTab } {
  return {
    workspace: {
      id: workspaceId,
      name,
      tabIds: [tabId],
      activeTabId: tabId,
      createdAt: now,
      updatedAt: now
    },
    tab: createEmptyWorkspaceTab({ id: tabId, now })
  };
}
