// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAppBootstrap } from "../src/renderer/src/features/app/useAppBootstrap";
import { useBenchPackRunEvents } from "../src/renderer/src/features/app/useBenchPackRunEvents";
import { useWebBenchPackRunActions } from "../src/renderer/src/features/app/useWebBenchPackRunActions";
import type {
  BenchPackInspection,
  BenchPackRegistryEntry,
  BenchPackRunSummary,
  BenchLocalConfig,
  BenchLocalThemeDescriptor,
  BenchLocalWorkspaceState,
  BenchLocalWorkspaceTab,
  ProgressEvent
} from "@core";
import type { BenchLocalAgentAccessState, BenchPackVerifierStatus } from "../src/shared/desktop-api";
import type {
  ActiveRunEntry,
  LiveScenarioFocusState,
  LoadState,
  VerifierPreparationModalState
} from "../src/renderer/src/features/app/app-state";
import type { LiveRunState, LoadedHistoryEntry } from "../src/renderer/src/features/runs/run-utils";

type BenchPackRunEventPayload = {
  tabId: string;
  benchPackId?: string;
  event: ProgressEvent;
};
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "benchlocal");
});

function installDesktopApi(api: unknown) {
  Object.defineProperty(window, "benchlocal", {
    configurable: true,
    value: api
  });
}

describe("renderer hooks", () => {
  it("bootstraps renderer state from the desktop API", async () => {
    const config = {
      providers: {},
      models: [],
      benchpacks: {},
      ui: { theme: "system" }
    } as unknown as BenchLocalConfig;
    const workspaceState = {
      activeWorkspaceId: null,
      workspaces: {},
      tabs: {}
    } as BenchLocalWorkspaceState;

    installDesktopApi({
      config: {
        load: vi.fn().mockResolvedValue({ path: "config.toml", created: false, config })
      },
      workspaces: {
        load: vi.fn().mockResolvedValue({ path: "workspace.json", created: false, state: workspaceState })
      },
      benchPacks: {
        list: vi.fn().mockResolvedValue([]),
        registry: vi.fn().mockResolvedValue([]),
        activeRuns: vi.fn().mockResolvedValue([]),
        loadHistory: vi.fn()
      },
      themes: {
        list: vi.fn().mockResolvedValue([])
      },
      verifiers: {
        list: vi.fn().mockResolvedValue([])
      },
      agent: {
        state: vi.fn().mockResolvedValue(null)
      }
    });

    const { result } = renderHook(() => {
      const [isBusy, setIsBusy] = useState(false);
      const [error, setError] = useState<string | null>(null);
      const [registryWarning, setRegistryWarning] = useState<string | null>(null);
      const [loadState, setLoadState] = useState<LoadState | null>(null);
      const [draft, setDraft] = useState<BenchLocalConfig | null>(null);
      const [workspace, setWorkspace] = useState<BenchLocalWorkspaceState | null>(null);
      const [runSummaries, setRunSummaries] = useState<Record<string, BenchPackRunSummary>>({});
      const [loadedHistoryRuns, setLoadedHistoryRuns] = useState<Record<string, LoadedHistoryEntry>>({});
      const [inspections, setInspections] = useState<BenchPackInspection[]>([]);
      const [registryEntries, setRegistryEntries] = useState<BenchPackRegistryEntry[]>([]);
      const [themes, setThemes] = useState<BenchLocalThemeDescriptor[]>([]);
      const [agentAccessState, setAgentAccessState] = useState<BenchLocalAgentAccessState | null>(null);
      const [verifierStatuses, setVerifierStatuses] = useState<Record<string, BenchPackVerifierStatus>>({});
      const [activeRuns, setActiveRuns] = useState<Record<string, ActiveRunEntry>>({});
      const [appNotice, setAppNotice] = useState<string | null>(null);

      useAppBootstrap({
        setIsBusy,
        setError,
        setRegistryWarning,
        setLoadState,
        setDraft,
        setWorkspaceState: setWorkspace,
        setRunSummaries,
        setLoadedHistoryRuns,
        setBenchPackInspections: setInspections,
        setRegistryEntries,
        setAvailableThemes: setThemes,
        setAgentAccessState,
        setVerifierStatuses,
        setActiveRuns,
        setAppNotice
      });

      return {
        isBusy,
        error,
        registryWarning,
        loadState,
        draft,
        workspace,
        runSummaries,
        loadedHistoryRuns,
        inspections,
        registryEntries,
        themes,
        agentAccessState,
        verifierStatuses,
        activeRuns,
        appNotice
      };
    });

    await waitFor(() => expect(result.current.isBusy).toBe(false));

    expect(result.current).toMatchObject({
      error: null,
      registryWarning: null,
      draft: config,
      workspace: workspaceState,
      runSummaries: {},
      loadedHistoryRuns: {},
      inspections: [],
      registryEntries: [],
      themes: [],
      verifierStatuses: {},
      activeRuns: {},
      appNotice: null
    });
  });

  it("maps run events into active run, live event, and scenario focus state", () => {
    let listener: ((payload: BenchPackRunEventPayload) => void) | undefined;
    const unsubscribe = vi.fn();

    installDesktopApi({
      benchPacks: {
        onRunEvent: vi.fn((nextListener) => {
          listener = nextListener;
          return unsubscribe;
        })
      }
    });

    const { result, unmount } = renderHook(() => {
      const [verifierPreparationModal, setVerifierPreparationModal] = useState<VerifierPreparationModalState | null>(null);
      const [appNotice, setAppNotice] = useState<string | null>(null);
      const [activeRuns, setActiveRuns] = useState<Record<string, ActiveRunEntry>>({});
      const [stoppingRuns, setStoppingRuns] = useState<Record<string, true>>({});
      const [liveRuns, setLiveRuns] = useState<Record<string, LiveRunState>>({});
      const [liveScenarioFocus, setLiveScenarioFocus] = useState<Record<string, LiveScenarioFocusState>>({});
      const workspaceStateRef = useRef({
        activeWorkspaceId: "workspace-1",
        workspaces: {},
        tabs: {
          "tab-1": {
            id: "tab-1",
            title: "Pack",
            benchPackId: "pack-1",
            modelSelections: [],
            samplingOverrides: {}
          }
        }
      } as unknown as BenchLocalWorkspaceState);
      const benchPackInspectionsRef = useRef<BenchPackInspection[]>([]);

      useBenchPackRunEvents({
        workspaceStateRef,
        benchPackInspectionsRef,
        setVerifierPreparationModal,
        setAppNotice,
        setActiveRuns,
        setStoppingRuns,
        setLiveRuns,
        setLiveScenarioFocus
      });

      return {
        verifierPreparationModal,
        appNotice,
        activeRuns,
        stoppingRuns,
        liveRuns,
        liveScenarioFocus
      };
    });

    act(() => {
      listener?.({
        tabId: "tab-1",
        benchPackId: "pack-1",
        event: { type: "run_started", runId: "run-1" } as ProgressEvent
      });
    });

    expect(result.current.activeRuns).toEqual({
      "tab-1": { benchPackId: "pack-1", mode: "host" }
    });
    expect(result.current.liveRuns).toMatchObject({
      "tab-1": { runId: "run-1" }
    });
    expect(result.current.liveScenarioFocus).toEqual({
      "tab-1": { liveScenarioId: null, autoFollow: true }
    });

    act(() => {
      listener?.({
        tabId: "tab-1",
        benchPackId: "pack-1",
        event: { type: "scenario_started", scenarioId: "scenario-1" } as ProgressEvent
      });
    });

    expect(result.current.liveScenarioFocus).toEqual({
      "tab-1": { liveScenarioId: "scenario-1", autoFollow: true }
    });

    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("manages the Web Bench Pack run lifecycle", () => {
    const updateWorkspaceState = vi.fn();
    const loadHistoryForBenchPack = vi.fn().mockResolvedValue(undefined);
    const tab = { id: "web-tab" } as unknown as BenchLocalWorkspaceTab;
    const inspection = { id: "web-pack" } as unknown as BenchPackInspection;

    const { result } = renderHook(() => {
      const [runSummaries, setRunSummaries] = useState<Record<string, BenchPackRunSummary>>({});
      const [loadedHistoryRuns, setLoadedHistoryRuns] = useState<Record<string, LoadedHistoryEntry>>({});
      const [activeRuns, setActiveRuns] = useState<Record<string, ActiveRunEntry>>({});
      const [stoppingRuns, setStoppingRuns] = useState<Record<string, true>>({});
      const [liveRuns, setLiveRuns] = useState<Record<string, LiveRunState>>({});
      const actions = useWebBenchPackRunActions({
        loadedHistoryRuns,
        setRunSummaries,
        setLoadedHistoryRuns,
        setActiveRuns,
        setStoppingRuns,
        setLiveRuns,
        updateWorkspaceState,
        loadHistoryForBenchPack
      });

      return { runSummaries, activeRuns, stoppingRuns, liveRuns, actions };
    });

    act(() => {
      result.current.actions.requestWebBenchPackStop(tab.id);
      result.current.actions.startWebBenchPackState(tab, inspection);
    });

    expect(result.current.activeRuns).toEqual({
      "web-tab": { benchPackId: "web-pack", mode: "host" }
    });
    expect(result.current.stoppingRuns).toEqual({});
    expect(result.current.liveRuns).toMatchObject({
      "web-tab": { events: [], resultsByModel: {}, activeCellKeys: [] }
    });

    act(() => {
      result.current.actions.requestWebBenchPackStop(tab.id);
      result.current.actions.stopWebBenchPackState(tab.id);
    });

    expect(result.current.activeRuns).toEqual({});
    expect(result.current.stoppingRuns).toEqual({});
    expect(result.current.liveRuns).toEqual({});
  });});




