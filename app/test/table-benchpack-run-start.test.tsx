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

function installDesktopApi(api: unknown) {
  Object.defineProperty(window, "benchlocal", { configurable: true, value: api });
}

describe("table Bench Pack run start", () => {
  it("passes only the operation-selected models and tab execution options to the desktop runner", async () => {
    const run = vi.fn().mockResolvedValue({
      runId: "run-1",
      benchPackId: "pack-1",
      benchPackName: "Pack One",
      startedAt: "2026-07-10T00:00:00.000Z",
      cancelled: false,
      modelCount: 1,
      scenarioCount: 1,
      resultsByModel: {},
      events: []
    } as unknown as BenchPackRunSummary);
    installDesktopApi({ benchPacks: { run } });

    const draft = {
      models: [
        { id: "model-1", provider: "provider-1", model: "remote-model-1", label: "Model One", group: "default", enabled: true },
        { id: "model-2", provider: "provider-1", model: "remote-model-2", label: "Model Two", group: "default", enabled: true }
      ],
      benchpacks: {}
    } as unknown as BenchLocalConfig;
    const tab = {
      id: "table-1",
      benchPackId: "pack-1",
      modelSelections: [{ modelId: "model-1" }, { modelId: "model-2" }],
      executionMode: "parallel_by_test_case",
      runsPerTest: 3,
      samplingOverrides: { temperature: 0.2 }
    } as BenchLocalWorkspaceTab;
    const loadBenchPackInspections = vi.fn().mockResolvedValue(undefined);
    const loadHistoryForBenchPack = vi.fn().mockResolvedValue(undefined);
    const updateWorkspaceState = vi.fn();

    const { result } = renderHook(() => {
      const [activeRuns, setActiveRuns] = useState<Record<string, ActiveRunEntry>>({});
      const [stoppingRuns, setStoppingRuns] = useState<Record<string, true>>({});
      const [runSummaries, setRunSummaries] = useState<Record<string, BenchPackRunSummary>>({});
      const [liveRuns, setLiveRuns] = useState<Record<string, LiveRunState>>({});
      const [liveScenarioFocus, setLiveScenarioFocus] = useState<Record<string, LiveScenarioFocusState>>({});
      const [loadedHistoryRuns, setLoadedHistoryRuns] = useState<Record<string, LoadedHistoryEntry>>({});
      const [, setError] = useState<string | null>(null);
      const [, setAppNotice] = useState<string | null>(null);
      const [, setSettingsTab] = useState<SettingsTab>("providers");
      const [, setSettingsOpen] = useState(false);
      const [, setConfirmDialog] = useState<ConfirmDialogState>(null);
      const [, setVerifierStatuses] = useState<Record<string, BenchPackVerifierStatus>>({});
      const [, setVerifierPreparationModal] = useState<VerifierPreparationModalState | null>(null);
      const replayRunTokensRef = useRef(new Map<string, symbol>());
      const actions = useTableBenchPackRunActions({
        draft,
        workspaceState: null,
        benchPackInspections: [],
        activeRuns,
        loadedHistoryRuns,
        runSummaries,
        hasUnsavedChanges: false,
        replayRunTokensRef,
        save: vi.fn().mockResolvedValue(true),
        updateWorkspaceState,
        loadBenchPackInspections,
        loadHistoryForBenchPack,
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

      return { activeRuns, runSummaries, actions };
    });

    await act(async () => {
      await result.current.actions.runTab(tab, ["model-2"]);
    });

    expect(run).toHaveBeenCalledWith({
      tabId: "table-1",
      benchPackId: "pack-1",
      modelIds: ["model-2"],
      executionMode: "parallel_by_test_case",
      runsPerTest: 3,
      generation: { temperature: 0.2 }
    });
    expect(result.current.runSummaries["table-1"]?.runId).toBe("run-1");
    expect(result.current.activeRuns).toEqual({});
    expect(loadBenchPackInspections).toHaveBeenCalledOnce();
    expect(loadHistoryForBenchPack).toHaveBeenCalledWith("pack-1");
  });
});
