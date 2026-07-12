import { describe, expect, it } from "vitest";
import { createEmptyWorkspaceTab, createWorkspaceWithEmptyTab } from "../src/renderer/src/features/workspaces/workspace-state";

describe("workspace state factories", () => {
  it("creates an empty tab with the standard runnable defaults", () => {
    const tab = createEmptyWorkspaceTab({ id: "tab-1", now: "2026-07-10T00:00:00.000Z" });

    expect(tab).toEqual({
      id: "tab-1",
      title: "New Tab",
      benchPackId: null,
      loadedRunId: null,
      focusedScenarioId: null,
      modelSelections: [],
      samplingOverrides: {},
      executionMode: "parallel_by_test_case",
      runsPerTest: 1,
      createdAt: "2026-07-10T00:00:00.000Z",
      updatedAt: "2026-07-10T00:00:00.000Z"
    });
  });

  it("creates a workspace that owns exactly its initial empty tab", () => {
    const { workspace, tab } = createWorkspaceWithEmptyTab({
      workspaceId: "workspace-1",
      tabId: "tab-1",
      name: "My Workspace",
      now: "2026-07-10T00:00:00.000Z"
    });

    expect(workspace.tabIds).toEqual([tab.id]);
    expect(workspace.activeTabId).toBe(tab.id);
    expect(workspace.modelSelections).toEqual([]);
    expect(tab.benchPackId).toBeNull();
  });
});
