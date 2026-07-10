// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTableBenchPackRunActions } from "../src/renderer/src/features/app/useTableBenchPackRunActions";
import type { BenchPackRunSummary } from "@core";
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

function renderRunActions(initialActiveRuns: Record<string, ActiveRunEntry>) {
  return renderHook(() => {
    const [activeRuns, setActiveRuns] = useState(initialActiveRuns);
    const [stoppingRuns, setStoppingRuns] = useState<Record<string, true>>({});
    const [runSummaries, setRunSummaries] = useState<Record<string, BenchPackRunSummary>>({});
    const [liveRuns, setLiveRuns] = useState<Record<string, LiveRunState>>({
      "table-1": { events: [], resultsByModel: {}, activeCellKeys: ["model-1::scenario-1"] }
    });
    const [liveScenarioFocus, setLiveScenarioFocus] = useState<Record<string, LiveScenarioFocusState>>({});
    const [loadedHistoryRuns, setLoadedHistoryRuns] = useState<Record<string, LoadedHistoryEntry>>({});
    const [error, setError] = useState<string | null>(null);
    const [appNotice, setAppNotice] = useState<string | null>(null);
    const [, setSettingsTab] = useState<SettingsTab>("providers");
    const [, setSettingsOpen] = useState(false);
    const [, setConfirmDialog] = useState<ConfirmDialogState>(null);
    const [, setVerifierStatuses] = useState<Record<string, BenchPackVerifierStatus>>({});
    const [, setVerifierPreparationModal] = useState<VerifierPreparationModalState | null>(null);
    const replayRunTokensRef = useRef(new Map<string, symbol>());

    const actions = useTableBenchPackRunActions({
      draft: null,
      workspaceState: null,
      benchPackInspections: [],
      activeRuns,
      loadedHistoryRuns,
      runSummaries,
      hasUnsavedChanges: false,
      replayRunTokensRef,
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

    return { activeRuns, stoppingRuns, liveRuns, error, appNotice, actions };
  });
}

describe("table Bench Pack run actions", () => {
  it("stops a replay locally without invoking the desktop runner", async () => {
    const stop = vi.fn();
    installDesktopApi({ benchPacks: { stop } });
    const { result } = renderRunActions({ "table-1": { benchPackId: "pack-1", mode: "replay" } });

    await act(async () => {
      await result.current.actions.stopTabRun("table-1");
    });

    expect(stop).not.toHaveBeenCalled();
    expect(result.current.activeRuns).toEqual({});
    expect(result.current.stoppingRuns).toEqual({});
    expect(result.current.liveRuns["table-1"]?.activeCellKeys).toEqual([]);
    expect(result.current.appNotice).toBe("Stopped replay.");
  });

  it("clears stale host run state when the desktop runner has already stopped", async () => {
    const stop = vi.fn().mockResolvedValue({ stopped: false });
    installDesktopApi({ benchPacks: { stop } });
    const { result } = renderRunActions({ "table-1": { benchPackId: "pack-1", mode: "host" } });

    await act(async () => {
      await result.current.actions.stopTabRun("table-1");
    });

    expect(stop).toHaveBeenCalledWith({ tabId: "table-1" });
    expect(result.current.activeRuns).toEqual({});
    expect(result.current.stoppingRuns).toEqual({});
    expect(result.current.appNotice).toBe("That Bench Pack run was no longer active.");
  });
});
