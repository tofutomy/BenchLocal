// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTableBenchPackRunActions } from "../src/renderer/src/features/app/useTableBenchPackRunActions";
import type { BenchLocalConfig, BenchLocalWorkspaceTab, BenchPackRunSummary } from "@core";
import type { BenchPackVerifierStatus } from "../src/shared/desktop-api";
import type { ConfirmDialogState } from "../src/renderer/src/shared/components/ConfirmDialog";
import type {
  ActiveRunEntry,
  LiveScenarioFocusState,
  VerifierPreparationModalState
} from "../src/renderer/src/features/app/app-state";
import type { LiveRunState, LoadedHistoryEntry } from "../src/renderer/src/features/runs/run-utils";
import type { SettingsTab } from "../src/renderer/src/features/settings/SettingsScene";

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "benchlocal");
});

it("restores the loaded history view when resuming a run fails", async () => {
  const resumeRun = vi.fn().mockRejectedValue(new Error("runner unavailable"));
  Object.defineProperty(window, "benchlocal", { configurable: true, value: { benchPacks: { resumeRun } } });

  const summary = {
    runId: "run-1",
    benchPackId: "pack-1",
    benchPackName: "Pack One",
    startedAt: "2026-07-10T00:00:00.000Z",
    cancelled: false,
    modelCount: 1,
    scenarioCount: 1,
    resultsByModel: { "model-1": [] },
    events: []
  } as unknown as BenchPackRunSummary;
  const tab = {
    id: "table-1",
    benchPackId: "pack-1",
    modelSelections: [{ modelId: "model-1" }],
    executionMode: "parallel_by_test_case",
    runsPerTest: 1,
    samplingOverrides: {}
  } as BenchLocalWorkspaceTab;
  const loadedHistory = { runId: "run-1", startedAt: summary.startedAt, mode: "history" } as LoadedHistoryEntry;
  const draft = {
    models: [{ id: "model-1", provider: "provider-1", model: "remote-model", label: "Model One", group: "default", enabled: true }],
    benchpacks: {}
  } as unknown as BenchLocalConfig;

  const { result } = renderHook(() => {
    const [activeRuns, setActiveRuns] = useState<Record<string, ActiveRunEntry>>({});
    const [stoppingRuns, setStoppingRuns] = useState<Record<string, true>>({});
    const [runSummaries, setRunSummaries] = useState<Record<string, BenchPackRunSummary>>({});
    const [liveRuns, setLiveRuns] = useState<Record<string, LiveRunState>>({});
    const [liveScenarioFocus, setLiveScenarioFocus] = useState<Record<string, LiveScenarioFocusState>>({});
    const [loadedHistoryRuns, setLoadedHistoryRuns] = useState<Record<string, LoadedHistoryEntry>>({ "table-1": loadedHistory });
    const [, setError] = useState<string | null>(null);
    const [, setAppNotice] = useState<string | null>(null);
    const [, setSettingsTab] = useState<SettingsTab>("providers");
    const [, setSettingsOpen] = useState(false);
    const [, setConfirmDialog] = useState<ConfirmDialogState>(null);
    const [, setVerifierStatuses] = useState<Record<string, BenchPackVerifierStatus>>({});
    const [, setVerifierPreparationModal] = useState<VerifierPreparationModalState | null>(null);
    const actions = useTableBenchPackRunActions({
      draft,
      workspaceState: null,
      benchPackInspections: [],
      activeRuns,
      loadedHistoryRuns,
      runSummaries,
      hasUnsavedChanges: false,
      replayRunTokensRef: useRef(new Map<string, symbol>()),
      save: vi.fn().mockResolvedValue(true),
      updateWorkspaceState: vi.fn(),
      loadBenchPackInspections: vi.fn().mockResolvedValue(undefined),
      loadHistoryForBenchPack: vi.fn().mockResolvedValue(undefined),
      setError,
      setAppNotice,
      setSettingsTab,
      setSettingsOpen,
      setConfirmDialog,
      setVerifierStatuses,
      setVerifierPreparationModal,
      setActiveRuns,
      setStoppingRuns,
      setRunSummaries,
      setLiveRuns,
      setLiveScenarioFocus,
      setLoadedHistoryRuns
    });
    return { loadedHistoryRuns, actions };
  });

  await act(async () => {
    await result.current.actions.resumeTabRun(tab, summary);
  });

  expect(resumeRun).toHaveBeenCalledOnce();
  expect(result.current.loadedHistoryRuns).toEqual({ "table-1": loadedHistory });
});
