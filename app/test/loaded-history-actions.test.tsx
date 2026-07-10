// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { expect, it } from "vitest";
import { useLoadedHistoryActions } from "../src/renderer/src/features/runs/useLoadedHistoryActions";
import type { BenchLocalWorkspaceState, BenchPackRunSummary } from "@core";
import type { LiveRunState, LoadedHistoryEntry } from "../src/renderer/src/features/runs/run-utils";

it("clears a loaded history run from workspace and renderer state", () => {
  const workspace = {
    tabs: { "tab-1": { id: "tab-1", loadedRunId: "run-1", updatedAt: "before" } }
  } as unknown as BenchLocalWorkspaceState;
  const { result } = renderHook(() => {
    const [loaded, setLoaded] = useState<Record<string, LoadedHistoryEntry>>({ "tab-1": { runId: "run-1", startedAt: "now" } });
    const [summaries, setSummaries] = useState<Record<string, BenchPackRunSummary>>({ "tab-1": {} as BenchPackRunSummary });
    const [live, setLive] = useState<Record<string, LiveRunState>>({ "tab-1": { events: [], resultsByModel: {}, activeCellKeys: [] } });
    const actions = useLoadedHistoryActions({
      workspaceState: workspace,
      loadedHistoryRuns: loaded,
      updateWorkspaceState: (updater) => updater(workspace),
      setLoadedHistoryRuns: setLoaded,
      setRunSummaries: setSummaries,
      setLiveRuns: setLive,
      setRunHistories: () => undefined,
      setHistoryModal: () => undefined,
      setAppNotice: () => undefined,
      setError: () => undefined
    });
    return { loaded, summaries, live, actions };
  });

  act(() => result.current.actions.clearLoadedHistoryRun("tab-1"));

  expect(workspace.tabs["tab-1"]?.loadedRunId).toBeNull();
  expect(result.current.loaded).toEqual({});
  expect(result.current.summaries).toEqual({});
  expect(result.current.live).toEqual({});
});
