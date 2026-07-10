// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceCollectionActions } from "../src/renderer/src/features/workspaces/useWorkspaceCollectionActions";
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
        benchPackId: "pack-1",
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

function renderCollectionActions(initialActiveRuns: Record<string, ActiveRunEntry> = {}) {
  return renderHook(() => {
    const [workspaceState, setWorkspaceState] = useState(createWorkspaceState);
    const [activeRuns, setActiveRuns] = useState(initialActiveRuns);
    const [runSummaries, setRunSummaries] = useState<Record<string, BenchPackRunSummary>>({ "tab-1": {} as BenchPackRunSummary });
    const [liveRuns, setLiveRuns] = useState<Record<string, LiveRunState>>({ "tab-1": { events: [], resultsByModel: {}, activeCellKeys: [] } });
    const [stoppingRuns, setStoppingRuns] = useState<Record<string, true>>({ "tab-1": true });
    const [error, setError] = useState<string | null>(null);
    const [, setWorkspaceContextMenu] = useState<{ workspaceId: string; workspaceName: string; x: number; y: number } | null>(null);
    const actions = useWorkspaceCollectionActions({
      workspaceState,
      activeRuns,
      updateWorkspaceState: (updater) => setWorkspaceState((current) => updater(structuredClone(current))),
      setError,
      setWorkspaceContextMenu,
      setRunSummaries,
      setLiveRuns,
      setActiveRuns,
      setStoppingRuns
    });
    return { workspaceState, activeRuns, runSummaries, liveRuns, stoppingRuns, error, actions };
  });
}

describe("workspace collection actions", () => {
  it("refuses to delete a workspace that contains an active run", () => {
    const { result } = renderCollectionActions({ "tab-1": { benchPackId: "pack-1", mode: "host" } });

    act(() => result.current.actions.deleteWorkspace("workspace-1"));

    expect(result.current.workspaceState.workspaces["workspace-1"]).toBeDefined();
    expect(result.current.error).toBe("Stop active Bench Pack runs before deleting this workspace.");
  });

  it("replaces the final deleted workspace and clears its tab run caches", () => {
    const randomUuid = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000001")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000002");
    const { result } = renderCollectionActions();

    act(() => result.current.actions.deleteWorkspace("workspace-1"));

    expect(result.current.workspaceState.workspaceOrder).toEqual(["workspace-00000000-0000-0000-0000-000000000001"]);
    expect(result.current.workspaceState.tabs["tab-00000000-0000-0000-0000-000000000002"]?.benchPackId).toBeNull();
    expect(result.current.runSummaries).toEqual({});
    expect(result.current.liveRuns).toEqual({});
    expect(result.current.stoppingRuns).toEqual({});
    randomUuid.mockRestore();
  });
});
