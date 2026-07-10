// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceTabActions } from "../src/renderer/src/features/workspaces/useWorkspaceTabActions";
import type { BenchLocalWorkspaceState, BenchPackRunSummary } from "@core";
import type { ActiveRunEntry } from "../src/renderer/src/features/app/app-state";
import type { LiveRunState } from "../src/renderer/src/features/runs/run-utils";

afterEach(() => cleanup());

function createWorkspaceState(): BenchLocalWorkspaceState {
  return {
    schema_version: 1,
    activeWorkspaceId: "workspace-1",
    workspaceOrder: ["workspace-1"],
    workspaces: {
      "workspace-1": {
        id: "workspace-1",
        name: "My Workspace",
        tabIds: ["tab-1"],
        activeTabId: "tab-1",
        createdAt: "2026-07-10T00:00:00.000Z",
        updatedAt: "2026-07-10T00:00:00.000Z"
      }
    },
    tabs: {
      "tab-1": {
        id: "tab-1",
        title: "Existing",
        benchPackId: null,
        loadedRunId: null,
        focusedScenarioId: null,
        modelSelections: [],
        samplingOverrides: {},
        executionMode: "parallel_by_test_case",
        runsPerTest: 1,
        createdAt: "2026-07-10T00:00:00.000Z",
        updatedAt: "2026-07-10T00:00:00.000Z"
      }
    }
  };
}

function renderTabActions(initialActiveRuns: Record<string, ActiveRunEntry> = {}) {
  return renderHook(() => {
    const [workspaceState, setWorkspaceState] = useState(createWorkspaceState);
    const [activeRuns, setActiveRuns] = useState(initialActiveRuns);
    const [runSummaries, setRunSummaries] = useState<Record<string, BenchPackRunSummary>>({});
    const [liveRuns, setLiveRuns] = useState<Record<string, LiveRunState>>({});
    const [error, setError] = useState<string | null>(null);
    const [, setTabMenuOpen] = useState(false);
    const [, setTabContextMenu] = useState<{ tabId: string; tabTitle: string; x: number; y: number } | null>(null);
    const activeWorkspace = workspaceState.workspaces["workspace-1"];
    const actions = useWorkspaceTabActions({
      activeWorkspace,
      activeRuns,
      benchPackInspections: [],
      updateWorkspaceState: (updater) => setWorkspaceState((current) => updater(structuredClone(current))),
      setError,
      setTabMenuOpen,
      setTabContextMenu,
      setRunSummaries,
      setLiveRuns,
      setActiveRuns
    });

    return { workspaceState, error, actions };
  });
}

describe("workspace tab actions", () => {
  it("creates a selected Bench Pack tab with the standard runnable defaults", () => {
    const randomUuid = vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-0000-0000-000000000000");
    const { result } = renderTabActions();

    act(() => result.current.actions.createTab("pack-1"));

    const createdTab = result.current.workspaceState.tabs["tab-00000000-0000-0000-0000-000000000000"];
    expect(createdTab).toMatchObject({
      title: "pack-1",
      benchPackId: "pack-1",
      modelSelections: [],
      executionMode: "parallel_by_test_case",
      runsPerTest: 1
    });
    expect(result.current.workspaceState.workspaces["workspace-1"]?.activeTabId).toBe("tab-00000000-0000-0000-0000-000000000000");
    randomUuid.mockRestore();
  });

  it("refuses to close a tab while its Bench Pack run is active", () => {
    const { result } = renderTabActions({ "tab-1": { benchPackId: "pack-1", mode: "host" } });

    act(() => result.current.actions.closeTab("tab-1"));

    expect(result.current.workspaceState.tabs["tab-1"]).toBeDefined();
    expect(result.current.error).toBe("Stop the Bench Pack run before closing this tab.");
  });
});
