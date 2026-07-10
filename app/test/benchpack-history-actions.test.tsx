// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useBenchPackHistoryActions } from "../src/renderer/src/features/runs/useBenchPackHistoryActions";
import type { BenchLocalWorkspaceState, BenchLocalWorkspaceTab, BenchPackRunSummary } from "@core";
import type { LiveRunState, LoadedHistoryEntry } from "../src/renderer/src/features/runs/run-utils";

afterEach(() => Reflect.deleteProperty(window, "benchlocal"));

it("restores a history run into the active tab and clears live state", async () => {
  const summary = {
    runId: "run-1",
    startedAt: "2026-07-10T00:00:00.000Z",
    executionMode: "serial"
  } as BenchPackRunSummary;
  Object.defineProperty(window, "benchlocal", {
    configurable: true,
    value: { benchPacks: { loadHistory: vi.fn().mockResolvedValue(summary) } }
  });
  const workspace = {
    tabs: { "tab-1": { id: "tab-1", executionMode: "full_parallel" } }
  } as unknown as BenchLocalWorkspaceState;

  const { result } = renderHook(() => {
    const [summaries, setSummaries] = useState<Record<string, BenchPackRunSummary>>({});
    const [live, setLive] = useState<Record<string, LiveRunState>>({ "tab-1": { events: [], resultsByModel: {}, activeCellKeys: [] } });
    const [loaded, setLoaded] = useState<Record<string, LoadedHistoryEntry>>({});
    const actions = useBenchPackHistoryActions({
      activeTab: { id: "tab-1" } as BenchLocalWorkspaceTab,
      updateWorkspaceState: (updater) => updater(workspace),
      setRunHistories: () => undefined,
      setRunSummaries: setSummaries,
      setLiveRuns: setLive,
      setLoadedHistoryRuns: setLoaded,
      setError: () => undefined
    });
    return { summaries, live, loaded, actions };
  });

  await act(async () => result.current.actions.restoreHistoryRun("pack-1", "run-1", "replay"));

  expect(result.current.summaries["tab-1"]).toBe(summary);
  expect(result.current.live).toEqual({});
  expect(result.current.loaded["tab-1"]).toMatchObject({ runId: "run-1", mode: "replay" });
  expect(workspace.tabs["tab-1"]?.executionMode).toBe("serial");
});
