import { useEffect, useMemo, useRef, useState } from "react";
import { AppTopbar } from "./features/app/AppTopbar";
import { AppOverlays } from "./features/app/AppOverlays";
import { AppModelOverlays } from "./features/app/AppModelOverlays";
import { AppWorkspaceShell } from "./features/app/AppWorkspaceShell";
import { AppTableBenchPackPane } from "./features/app/AppTableBenchPackPane";
import { AppTabbedWorkspace } from "./features/app/AppTabbedWorkspace";
import { AppSettingsSceneHost } from "./features/app/AppSettingsSceneHost";
import { AppWebBenchPackPane } from "./features/app/AppWebBenchPackPane";
import { useAppToasts } from "./features/app/useAppToasts";
import { useAppTheme } from "./features/app/useAppTheme";
import { useAppUpdates } from "./features/app/useAppUpdates";
import { useBenchPackRunEvents } from "./features/app/useBenchPackRunEvents";
import { useWorkspaceUpdates } from "./features/app/useWorkspaceUpdates";
import { useExternalAppSubscriptions } from "./features/app/useExternalAppSubscriptions";
import { useAppLogEffects } from "./features/app/useAppLogEffects";
import { useAppBootstrap } from "./features/app/useAppBootstrap";
import { useAppMenuEffects } from "./features/app/useAppMenuEffects";
import { useAppDesktopEffects } from "./features/app/useAppDesktopEffects";
import { useTabStripLayout } from "./features/app/useTabStripLayout";
import { useWebBenchPackRunActions } from "./features/app/useWebBenchPackRunActions";
import { useTableBenchPackRunActions } from "./features/app/useTableBenchPackRunActions";
import { I18nProvider, type SupportedLocale } from "./shared/i18n";
import {
  type ActiveRunEntry,
  type BenchPackMutationState,
  type HistoryModalState,
  type LiveScenarioFocusState,
  type LoadState,
  type ModelAliasModalState,
  type ModelModalState,
  type ProviderModalState,
  type SamplingModalState,
  type SettingsVerifierPreparationModalState,
  type TabModelsModalState,
  type VerifierPreparationModalState,
  type WorkspaceModalState
} from "./features/app/app-state";
import { formatRegistryWarning } from "./features/benchpacks/registry-errors";
import { useBenchPackManagementActions } from "./features/benchpacks/useBenchPackManagementActions";
import { DetachedLogsWindow } from "./features/logs/DetachedLogsWindow";
import { StatusFooter } from "./features/logs/StatusFooter";
import type { ModelBrowserModalState } from "./features/models/ModelBrowserModal";
import { useProviderConfigActions } from "./features/models/useProviderConfigActions";
import { useModelConfigActions } from "./features/models/useModelConfigActions";
import { useModelDiscovery } from "./features/models/useModelDiscovery";
import { useModelAvailabilityActions } from "./features/models/useModelAvailabilityActions";
import type { ResolvedTabModel } from "./features/models/model-config";
import type { LiveRunState, LoadedHistoryEntry } from "./features/runs/run-utils";
import { resolveHistoryModels, resolveTabModels } from "./features/runs/run-state";
import { getRequiredVerifierRunBlocker } from "./features/runs/verifier-status";
import type { DetailModalState } from "./features/runs/ResultDetailModal";
import { useLoadedHistoryActions } from "./features/runs/useLoadedHistoryActions";
import { useBenchPackHistoryActions } from "./features/runs/useBenchPackHistoryActions";
import { useScenarioRetryAction } from "./features/runs/useScenarioRetryAction";
import type { SettingsTab } from "./features/settings/SettingsScene";
import { useAgentAccessActions } from "./features/settings/useAgentAccessActions";
import { useVerifierConfigActions } from "./features/settings/useVerifierConfigActions";
import { AppWorkspaceEmptyState } from "./features/workspaces/AppWorkspaceEmptyState";
import type { TabContextMenuState, WorkspaceContextMenuState } from "./features/workspaces/WorkspaceContextMenus";
import { SIDEBAR_OPEN_STORAGE_KEY } from "./features/workspaces/workspace-utils";
import { useWorkspaceTabActions } from "./features/workspaces/useWorkspaceTabActions";
import { useWorkspaceCollectionActions } from "./features/workspaces/useWorkspaceCollectionActions";
import { useWorkspaceTransferActions } from "./features/workspaces/useWorkspaceTransferActions";
import type { ConfirmDialogState } from "./shared/components/ConfirmDialog";
import { ToastViewport } from "./shared/components/ToastViewport";
import { describeAppUpdateState } from "./shared/app-update-format";
import { cloneConfig, reapplyPendingFilesystemDraft } from "./shared/config-utils";

import type {
  BenchPackRegistryEntry,
  BenchLocalConfig,
  BenchLocalWorkspace,
  BenchLocalWorkspaceState,
  BenchLocalWorkspaceTab,
  ModelAvailability,
  BenchPackInspection,
  BenchPackRunHistoryEntry,
  BenchPackRunSummary
} from "@core";
import type {
  BenchLocalAppMetadata,
  BenchLocalAgentAccessState,
  BenchLocalDiscoveredModel,
  BenchPackVerifierStatus
} from "@/shared/desktop-api";

const DETACHED_LOGS_VIEW =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).get("view") === "logs";



export function App() {
  if (DETACHED_LOGS_VIEW) {
    return <DetachedLogsWindow />;
  }

  const isMacPlatform = typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");
  const [loadState, setLoadState] = useState<LoadState | null>(null);
  const [draft, setDraft] = useState<BenchLocalConfig | null>(null);
  const [workspaceState, setWorkspaceState] = useState<BenchLocalWorkspaceState | null>(null);
  const [benchPackInspections, setBenchPackInspections] = useState<BenchPackInspection[]>([]);
  const [registryEntries, setRegistryEntries] = useState<BenchPackRegistryEntry[]>([]);
  const [registryWarning, setRegistryWarning] = useState<string | null>(null);
  const [verifierStatuses, setVerifierStatuses] = useState<Record<string, BenchPackVerifierStatus>>({});
  const [tabMenuOpen, setTabMenuOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }

    return window.localStorage.getItem(SIDEBAR_OPEN_STORAGE_KEY) !== "false";
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [aboutDialogOpen, setAboutDialogOpen] = useState(false);
  const [appMetadata, setAppMetadata] = useState<BenchLocalAppMetadata | null>(null);
  const [agentAccessState, setAgentAccessState] = useState<BenchLocalAgentAccessState | null>(null);
  const [providerModal, setProviderModal] = useState<ProviderModalState | null>(null);
  const [modelModal, setModelModal] = useState<ModelModalState | null>(null);
  const [modelBrowserModal, setModelBrowserModal] = useState<ModelBrowserModalState | null>(null);
  const [tabModelsModal, setTabModelsModal] = useState<TabModelsModalState | null>(null);
  const [samplingModal, setSamplingModal] = useState<SamplingModalState | null>(null);
  const [modelAliasModal, setModelAliasModal] = useState<ModelAliasModalState | null>(null);
  const [workspaceModal, setWorkspaceModal] = useState<WorkspaceModalState>(null);
  const [workspaceContextMenu, setWorkspaceContextMenu] = useState<WorkspaceContextMenuState>(null);
  const [tabContextMenu, setTabContextMenu] = useState<TabContextMenuState>(null);
  const [historyModal, setHistoryModal] = useState<HistoryModalState | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);
  const [verifierPreparationModal, setVerifierPreparationModal] = useState<VerifierPreparationModalState | null>(null);
  const [settingsVerifierPreparationModal, setSettingsVerifierPreparationModal] = useState<SettingsVerifierPreparationModalState | null>(null);
  const [stoppingVerifierStarts, setStoppingVerifierStarts] = useState<Record<string, true>>({});
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [editingTab, setEditingTab] = useState<{ tabId: string; value: string; width: number } | null>(null);
  const [activeRuns, setActiveRuns] = useState<Record<string, ActiveRunEntry>>({});
  const [stoppingRuns, setStoppingRuns] = useState<Record<string, true>>({});
  const [runSummaries, setRunSummaries] = useState<Record<string, BenchPackRunSummary>>({});
  const [runHistories, setRunHistories] = useState<Record<string, BenchPackRunHistoryEntry[]>>({});
  const [liveRuns, setLiveRuns] = useState<Record<string, LiveRunState>>({});
  const [liveScenarioFocus, setLiveScenarioFocus] = useState<Record<string, LiveScenarioFocusState>>({});
  const [loadedHistoryRuns, setLoadedHistoryRuns] = useState<Record<string, LoadedHistoryEntry>>({});
  const [modelAvailabilityById, setModelAvailabilityById] = useState<Record<string, ModelAvailability>>({});
  const [checkingModelAvailability, setCheckingModelAvailability] = useState<Record<string, true>>({});
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsAutoScroll, setLogsAutoScroll] = useState(true);
  const [logsDetached, setLogsDetached] = useState(false);
  const [logDrawerHeight, setLogDrawerHeight] = useState(240);
  const [detailModal, setDetailModal] = useState<DetailModalState | null>(null);
  const [isBusy, setIsBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appNotice, setAppNotice] = useState<string | null>(null);
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const [benchPackMutations, setBenchPackMutations] = useState<Record<string, BenchPackMutationState>>({});
  const { toastMessages, dismissToast, pushToast } = useAppToasts();
  const {
    appUpdateState,
    downloadedUpdateVersion,
    showDownloadedUpdateBanner,
    checkForAppUpdates,
    installDownloadedAppUpdate,
    markDownloadedUpdateNotified
  } = useAppUpdates(setError);
  const { availableThemes, setAvailableThemes, systemPrefersDark, themeOptions, currentThemeLabel } = useAppTheme(
    draft?.ui.theme
  );
  useAppBootstrap({
    setIsBusy,
    setError,
    setRegistryWarning,
    setLoadState,
    setDraft,
    setWorkspaceState,
    setRunSummaries,
    setLoadedHistoryRuns,
    setBenchPackInspections,
    setRegistryEntries,
    setAvailableThemes,
    setAgentAccessState,
    setVerifierStatuses,
    setActiveRuns,
    setAppNotice
  });
  const themeMenuRef = useRef<HTMLDivElement | null>(null);
  const settingsOpenRef = useRef(false);
  const workspaceStateRef = useRef<BenchLocalWorkspaceState | null>(null);
  const benchPackInspectionsRef = useRef<BenchPackInspection[]>([]);
  useAppDesktopEffects({
    appMetadata,
    setAppMetadata,
    setAboutDialogOpen,
    setSettingsOpen,
    settingsOpen,
    settingsOpenRef,
    setSettingsNotice,
    sidebarOpen
  });
  useAppMenuEffects({
    workspaceContextMenu,
    tabContextMenu,
    setWorkspaceContextMenu,
    setTabContextMenu,
    themeMenuOpen,
    themeMenuRef,
    setThemeMenuOpen
  });
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
  useWorkspaceUpdates({
    setWorkspaceState,
    setRunSummaries,
    setLoadedHistoryRuns
  });


  const providerIds = useMemo(() => Object.keys(draft?.providers ?? {}), [draft]);
  const readyInspections = useMemo(() => benchPackInspections.filter((inspection) => inspection.status === "ready"), [benchPackInspections]);
  const activeWorkspace = useMemo<BenchLocalWorkspace | null>(
    () => (workspaceState?.activeWorkspaceId ? workspaceState.workspaces[workspaceState.activeWorkspaceId] ?? null : null),
    [workspaceState]
  );
  const workspaceTabs = useMemo<BenchLocalWorkspaceTab[]>(
    () =>
      activeWorkspace?.tabIds
        .map((tabId) => workspaceState?.tabs[tabId])
        .filter((tab): tab is BenchLocalWorkspaceTab => Boolean(tab)) ?? [],
    [activeWorkspace, workspaceState]
  );
  const activeTab = useMemo<BenchLocalWorkspaceTab | null>(
    () => (activeWorkspace?.activeTabId ? workspaceState?.tabs[activeWorkspace.activeTabId] ?? null : workspaceTabs[0] ?? null),
    [activeWorkspace, workspaceState, workspaceTabs]
  );
  const activeInspection = useMemo(
    () => benchPackInspections.find((inspection) => inspection.id === activeTab?.benchPackId) ?? null,
    [benchPackInspections, activeTab]
  );
  const activeVerifierStatus = useMemo(
    () => (activeInspection ? verifierStatuses[activeInspection.id] ?? null : null),
    [activeInspection, verifierStatuses]
  );
  const activeTabModels = useMemo(() => (draft ? resolveTabModels(activeTab, draft.models) : []), [draft, activeTab]);
  const activeRunSummary = useMemo(() => (activeTab ? runSummaries[activeTab.id] ?? null : null), [runSummaries, activeTab]);
  const activeLiveRun = useMemo(() => (activeTab ? liveRuns[activeTab.id] ?? null : null), [liveRuns, activeTab]);
  const activeLiveScenarioFocus = useMemo(
    () => (activeTab ? liveScenarioFocus[activeTab.id] ?? null : null),
    [liveScenarioFocus, activeTab]
  );
  const activeRunBlocker = useMemo(
    () =>
      activeInspection && draft
        ? getRequiredVerifierRunBlocker(activeInspection.manifest, draft.benchpacks[activeInspection.id], activeVerifierStatus ?? undefined)
        : null,
    [activeInspection, activeVerifierStatus, draft]
  );
  const activeLoadedHistory = useMemo(
    () => (activeTab ? loadedHistoryRuns[activeTab.id] ?? null : null),
    [loadedHistoryRuns, activeTab]
  );
  const activeDisplayModels = useMemo(() => {
    if (!draft) {
      return [];
    }

    if (activeLoadedHistory) {
      return resolveHistoryModels(activeRunSummary, draft.models);
    }

    return activeTabModels;
  }, [draft, activeLoadedHistory, activeRunSummary, activeTabModels]);
  const activeDisplayModelIds = useMemo(
    () => activeDisplayModels.map((model) => model.id).join("\0"),
    [activeDisplayModels]
  );
  const activeLogEvents = activeLiveRun?.events ?? activeRunSummary?.events ?? [];
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  useAppLogEffects({
    activeLogEvents,
    workspaceName: activeWorkspace?.name ?? "No Workspace",
    tabTitle: activeTab?.title ?? "No Active Tab",
    logsOpen,
    logsAutoScroll,
    logContainerRef,
    setLogsDetached,
    setLogDrawerHeight
  });
  const tabStripShellRef = useRef<HTMLDivElement | null>(null);
  const tabStripRef = useRef<HTMLDivElement | null>(null);
  const tabChipRefs = useRef(new Map<string, HTMLButtonElement>());
  const modelDiscoveryCacheRef = useRef<Record<string, BenchLocalDiscoveredModel[]>>({});
  const modelAvailabilityRequestRef = useRef(0);
  const modelAvailabilityPendingRef = useRef<Record<string, number>>({});
  const replayRunTokensRef = useRef(new Map<string, symbol>());
  const [tabStripOverflow, setTabStripOverflow] = useState(false);
  const [activeTabMask, setActiveTabMask] = useState<{ left: number; width: number } | null>(null);
  useTabStripLayout({
    workspaceTabs,
    activeWorkspaceId: activeWorkspace?.id ?? null,
    activeTabId: activeTab?.id ?? null,
    sidebarOpen,
    tabStripOverflow,
    tabStripShellRef,
    tabStripRef,
    tabChipRefs,
    setTabStripOverflow,
    setActiveTabMask
  });

  const hasUnsavedChanges =
    loadState && draft ? JSON.stringify(loadState.config) !== JSON.stringify(draft) : false;

  const updateDraft = (updater: (current: BenchLocalConfig) => BenchLocalConfig) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      return updater(cloneConfig(current));
    });
  };

  const persistWorkspaceState = async (nextState: BenchLocalWorkspaceState) => {
    setWorkspaceState(nextState);

    try {
      const saved = await window.benchlocal.workspaces.save(nextState);
      setWorkspaceState(saved.state);
    } catch (workspaceError) {
      setError(workspaceError instanceof Error ? workspaceError.message : "Failed to save workspace state.");
    }
  };

  const updateWorkspaceState = (updater: (current: BenchLocalWorkspaceState) => BenchLocalWorkspaceState) => {
    setWorkspaceState((current) => {
      if (!current) {
        return current;
      }

      const next = updater(structuredClone(current));
      void persistWorkspaceState(next);
      return next;
    });
  };

  const loadBenchPackInspections = async () => {
    try {
      const inspections = await window.benchlocal.benchPacks.list();
      setBenchPackInspections(inspections);
    } catch (pluginError) {
      setError(pluginError instanceof Error ? pluginError.message : "Failed to inspect configured Bench Packs.");
    }
  };

  const loadRegistryEntries = async () => {
    try {
      const entries = await window.benchlocal.benchPacks.registry();
      setRegistryEntries(entries);
      setRegistryWarning(null);
    } catch (registryError) {
      setRegistryWarning(formatRegistryWarning(registryError));
    }
  };

  useExternalAppSubscriptions({
    setLoadState,
    setDraft,
    setError,
    loadBenchPackInspections,
    loadRegistryEntries,
    setAgentAccessState,
    setBenchPackMutations,
    setSettingsVerifierPreparationModal
  });
  const loadVerifierStatuses = async () => {
    try {
      const statuses = await window.benchlocal.verifiers.list();
      setVerifierStatuses(Object.fromEntries(statuses.map((status) => [status.benchPackId, status])));
    } catch (verifierError) {
      setError(verifierError instanceof Error ? verifierError.message : "Failed to load verifier status.");
    }
  };

  const { loadHistoryForBenchPack, restoreHistoryRun } = useBenchPackHistoryActions({
    activeTab,
    updateWorkspaceState,
    setRunHistories,
    setRunSummaries,
    setLiveRuns,
    setLoadedHistoryRuns,
    setError
  });
  const {
    handleWebPackRunSummarySaved,
    startWebBenchPackState,
    stopWebBenchPackState,
    requestWebBenchPackStop
  } = useWebBenchPackRunActions({
    loadedHistoryRuns,
    setRunSummaries,
    setLoadedHistoryRuns,
    setActiveRuns,
    setStoppingRuns,
    setLiveRuns,
    updateWorkspaceState,
    loadHistoryForBenchPack
  });
  const { refreshModelAvailability } = useModelAvailabilityActions({
    draft,
    defaultModels: activeDisplayModels,
    requestRef: modelAvailabilityRequestRef,
    pendingRef: modelAvailabilityPendingRef,
    setModelAvailabilityById,
    setCheckingModelAvailability,
    setError
  });
  useEffect(() => {
    if (!appNotice) {
      return;
    }

    pushToast(appNotice, "success");
    setAppNotice(null);
  }, [appNotice, pushToast]);

  useEffect(() => {
    if (!settingsNotice) {
      return;
    }

    pushToast(settingsNotice, "success");
    setSettingsNotice(null);
  }, [settingsNotice, pushToast]);

  useEffect(() => {
    if (!error) {
      return;
    }

    pushToast(error, "danger");
    setError(null);
  }, [error, pushToast]);

  useEffect(() => {
    if (!showDownloadedUpdateBanner || !downloadedUpdateVersion) {
      return;
    }

    pushToast(describeAppUpdateState(appUpdateState), "success");
    markDownloadedUpdateNotified(downloadedUpdateVersion);
  }, [appUpdateState, downloadedUpdateVersion, pushToast, showDownloadedUpdateBanner]);

  useEffect(() => {
    workspaceStateRef.current = workspaceState;
  }, [workspaceState]);

  useEffect(() => {
    benchPackInspectionsRef.current = benchPackInspections;
  }, [benchPackInspections]);

  useEffect(() => {
    if (!settingsOpen || settingsTab !== "verification") {
      return;
    }

    void loadVerifierStatuses();
  }, [settingsOpen, settingsTab]);

  useEffect(() => {
    if (!settingsOpen || settingsTab !== "advanced") {
      return;
    }

    setSettingsTab("providers");
  }, [settingsOpen, settingsTab]);

  const persistConfig = async (
    nextConfig: BenchLocalConfig,
    options?: {
      notice?: string | null;
      preserveFilesystemDraft?: boolean;
      previousDraft?: BenchLocalConfig | null;
      previousLoadConfig?: BenchLocalConfig | null;
    }
  ): Promise<boolean> => {
    if (!nextConfig) {
      return false;
    }

    setIsBusy(true);
    setError(null);

    try {
      const result = await window.benchlocal.config.save(nextConfig);
      setLoadState(result);
      setDraft(
        options?.preserveFilesystemDraft && options.previousDraft && options.previousLoadConfig
          ? reapplyPendingFilesystemDraft(result.config, options.previousDraft, options.previousLoadConfig)
          : cloneConfig(result.config)
      );
      await loadBenchPackInspections();
      await loadRegistryEntries();
      if (settingsOpenRef.current && options?.notice) {
        setSettingsNotice(options.notice);
      }
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save BenchLocal config.");
      return false;
    } finally {
      setIsBusy(false);
    }
  };

  const save = async (): Promise<boolean> => {
    if (!draft) {
      return false;
    }

    return persistConfig(draft, { notice: "Saved ~/.benchlocal/config.toml" });
  };

  const { configureAgentAccess, regenerateAgentToken } = useAgentAccessActions({
    setAgentAccessState,
    setSettingsNotice,
    setError
  });
  const { installBenchPack, installBenchPackFromUrl, updateBenchPack, uninstallInstalledBenchPack } = useBenchPackManagementActions({
    registryEntries,
    activeRuns,
    hasUnsavedChanges,
    settingsOpenRef,
    save,
    setLoadState,
    setDraft,
    setBenchPackInspections,
    setRegistryEntries,
    setRegistryWarning,
    setVerifierStatuses,
    setBenchPackMutations,
    setIsBusy,
    setSettingsNotice,
    setError
  });
  const reset = () => {
    if (!loadState) {
      return;
    }

    setDraft(cloneConfig(loadState.config));
    setProviderModal(null);
    setModelModal(null);
    if (settingsOpenRef.current) {
      setSettingsNotice("Reverted unsaved changes.");
    }
    setError(null);
  };

  const saveThemeSelection = async (themeId: string) => {
    if (!draft) {
      return;
    }

    const previousDraft = cloneConfig(draft);
    const previousLoadConfig = loadState ? cloneConfig(loadState.config) : null;
    const nextConfig = previousLoadConfig ? cloneConfig(previousLoadConfig) : cloneConfig(draft);
    nextConfig.ui.theme = themeId;
    setDraft(nextConfig);

    const saved = await persistConfig(nextConfig, {
      preserveFilesystemDraft: true,
      previousDraft,
      previousLoadConfig
    });
    if (!saved) {
      setDraft(previousDraft);
    }
  };

  // 语言切换：更新 draft 并立即持久化（参照 saveThemeSelection 模式）
  const currentLocale = draft?.ui.locale ?? "en";
  const setLocale = (locale: SupportedLocale) => {
    if (!draft) {
      return;
    }
    void saveLocaleSelection(locale);
  };

  const saveLocaleSelection = async (locale: string) => {
    if (!draft) {
      return;
    }
    const previousDraft = cloneConfig(draft);
    const previousLoadConfig = loadState ? cloneConfig(loadState.config) : null;
    const nextConfig = previousLoadConfig ? cloneConfig(previousLoadConfig) : cloneConfig(draft);
    nextConfig.ui.locale = locale;
    setDraft(nextConfig);
    const saved = await persistConfig(nextConfig, {
      preserveFilesystemDraft: true,
      previousDraft,
      previousLoadConfig
    });
    if (!saved) {
      setDraft(previousDraft);
    }
  };

  // 同步 <html lang> 属性
  useEffect(() => {
    document.documentElement.lang = currentLocale === "zh" ? "zh-CN" : "en";
  }, [currentLocale]);

  const { saveVerifierConfig, cancelSettingsVerifierStart } = useVerifierConfigActions({
    draft,
    loadState,
    persistConfig,
    setDraft,
    setStoppingVerifierStarts,
    setSettingsVerifierPreparationModal,
    setError
  });
  const scrollTabStrip = (delta: number) => {
    tabStripRef.current?.scrollBy({
      left: delta,
      behavior: "smooth"
    });
  };

  const handleTabStripWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const strip = tabStripRef.current;

    if (!strip || !tabStripOverflow) {
      return;
    }

    const horizontalDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;

    if (Math.abs(horizontalDelta) < 1) {
      return;
    }

    event.preventDefault();
    strip.scrollBy({
      left: horizontalDelta,
      behavior: "auto"
    });
  };

  const { runTab, resetTabRunState, resumeTabRun, replayTabRun, stopTabRun, retryScenarioCells } = useTableBenchPackRunActions({
    draft,
    workspaceState,
    benchPackInspections,
    activeRuns,
    loadedHistoryRuns,
    runSummaries,
    hasUnsavedChanges,
    replayRunTokensRef,
    save,
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
  const { createWorkspace, renameWorkspace, deleteWorkspace, activateWorkspace } = useWorkspaceCollectionActions({
    workspaceState,
    activeRuns,
    updateWorkspaceState,
    setError,
    setWorkspaceContextMenu,
    setRunSummaries,
    setLiveRuns,
    setActiveRuns,
    setStoppingRuns
  });
  const { exportWorkspace, importWorkspace } = useWorkspaceTransferActions({
    workspaceState,
    updateWorkspaceState,
    setAppNotice,
    setError
  });
  const { createTab, duplicateTab, assignBenchPackToTab, activateTab, reorderTab, closeTab } = useWorkspaceTabActions({
    activeWorkspace,
    activeRuns,
    benchPackInspections,
    updateWorkspaceState,
    setError,
    setTabMenuOpen,
    setTabContextMenu,
    setRunSummaries,
    setLiveRuns,
    setActiveRuns
  });
  const startEditingTab = (tabId: string, currentTitle: string) => {
    const width = tabChipRefs.current.get(tabId)?.offsetWidth ?? 180;
    setEditingTab({
      tabId,
      value: currentTitle,
      width
    });
  };

  const commitEditingTab = () => {
    if (!editingTab) {
      return;
    }

    const nextTitle = editingTab.value.trim() || "New Tab";

    updateWorkspaceState((current) => {
      const tab = current.tabs[editingTab.tabId];

      if (!tab) {
        return current;
      }

      tab.title = nextTitle;
      tab.updatedAt = new Date().toISOString();
      return current;
    });

    setEditingTab(null);
  };

  const cancelEditingTab = () => {
    setEditingTab(null);
  };

  const { retryScenarioFromDetail } = useScenarioRetryAction({
    workspaceState,
    activeRuns,
    hasUnsavedChanges,
    save,
    loadHistoryForBenchPack,
    setDetailModal,
    setLiveRuns,
    setRunSummaries,
    setAppNotice,
    setError
  });
  const { clearLoadedHistoryRun, deleteSelectedHistoryForBenchPack } = useLoadedHistoryActions({
    workspaceState,
    loadedHistoryRuns,
    updateWorkspaceState,
    setLoadedHistoryRuns,
    setRunSummaries,
    setLiveRuns,
    setRunHistories,
    setHistoryModal,
    setAppNotice,
    setError
  });
  const { saveProviderModal, deleteProvider, duplicateProvider } = useProviderConfigActions({
    draft,
    loadState,
    providerModal,
    persistConfig,
    updateWorkspaceState,
    setProviderModal
  });
  const confirmDeleteProvider = (providerId: string) => {
    const provider = draft?.providers[providerId];
    const linkedModelCount = (draft?.models ?? []).filter((model) => model.provider === providerId).length;

    setConfirmDialog({
      title: "Delete Provider",
      subtitle:
        linkedModelCount > 0
          ? `Delete ${provider?.name ?? "this provider"}? This will also delete ${linkedModelCount} linked ${linkedModelCount === 1 ? "model" : "models"} and remove them from any tab selections.`
          : `Delete ${provider?.name ?? "this provider"}?`,
      confirmLabel: "Delete Provider",
      tone: "danger",
      onConfirm: () => {
        void deleteProvider(providerId).then((deleted) => {
          if (deleted) {
            setProviderModal(null);
          }
        });
      }
    });
  };

  const { openModelBrowser } = useModelDiscovery({
    draft,
    modelModal,
    cacheRef: modelDiscoveryCacheRef,
    setModelBrowserModal,
    setError
  });
  const { saveModelModal, deleteModel, duplicateModel } = useModelConfigActions({
    draft,
    loadState,
    modelModal,
    persistConfig,
    updateWorkspaceState,
    setError,
    setModelModal
  });
  const confirmDeleteModel = (index: number) => {
    const model = draft?.models[index];
    if (!model) {
      return;
    }

    const linkedTabCount = workspaceState
      ? Object.values(workspaceState.tabs).filter((tab) =>
          tab.modelSelections.some((selection) => selection.modelId === model.id)
        ).length
      : 0;

    setConfirmDialog({
      title: "Delete Model",
      subtitle:
        linkedTabCount > 0
          ? `Delete ${model.label}? This will also remove it from ${linkedTabCount} tab ${linkedTabCount === 1 ? "selection" : "selections"}.`
          : `Delete ${model.label}?`,
      confirmLabel: "Delete Model",
      tone: "danger",
      onConfirm: () => {
        void deleteModel(index).then((deleted) => {
          if (deleted) {
            setModelModal(null);
          }
        });
      }
    });
  };

  return (
    <I18nProvider locale={currentLocale} setLocale={setLocale}>
      <div>
      <main className="page-shell">
        <section className="desktop-shell">
          <AppTopbar
            isMacPlatform={isMacPlatform}
            sidebarOpen={sidebarOpen}
            settingsOpen={settingsOpen}
            settingsThemeAvailable={Boolean(draft)}
            agentAccessRunning={Boolean(agentAccessState?.running)}
            readyInspections={readyInspections}
            tabMenuOpen={tabMenuOpen}
            setTabMenuOpen={setTabMenuOpen}
            canCreateTab={Boolean(activeWorkspace)}
            appUpdateDownloaded={appUpdateState?.status === "downloaded"}
            downloadedUpdateVersion={downloadedUpdateVersion}
            themeMenuRef={themeMenuRef}
            themeMenuOpen={themeMenuOpen}
            currentThemeLabel={currentThemeLabel}
            themeOptions={themeOptions}
            selectedThemeId={draft?.ui.theme ?? "system"}
            availableThemes={availableThemes}
            systemPrefersDark={systemPrefersDark}
            onToggleSidebar={() => setSidebarOpen((current) => !current)}
            onCreateBenchPackTab={(benchPackId) => {
              if (activeTab && !activeTab.benchPackId) {
                assignBenchPackToTab(activeTab.id, benchPackId);
                return;
              }

              createTab(benchPackId);
            }}
            onOpenSettings={() => setSettingsOpen(true)}
            onInstallDownloadedUpdate={() => void installDownloadedAppUpdate()}
            onToggleThemeMenu={() => setThemeMenuOpen((current) => !current)}
            onSelectTheme={(themeId) => {
              setThemeMenuOpen(false);
              void saveThemeSelection(themeId);
            }}
          />

          {settingsOpen && draft ? (
            <AppSettingsSceneHost
              settingsTab={settingsTab}
              setSettingsTab={setSettingsTab}
              draft={draft}
              configPath={loadState?.path ?? ""}
              hasUnsavedChanges={hasUnsavedChanges}
              isBusy={isBusy}
              providerIds={providerIds}
              benchPackInspections={benchPackInspections}
              registryEntries={registryEntries}
              registryWarning={registryWarning}
              benchPackMutations={benchPackMutations}
              verifierStatuses={verifierStatuses}
              agentAccessState={agentAccessState}
              settingsOpenRef={settingsOpenRef}
              setSettingsOpen={setSettingsOpen}
              setSettingsNotice={setSettingsNotice}
              setProviderModal={setProviderModal}
              setModelModal={setModelModal}
              setError={setError}
              setStoppingVerifierStarts={setStoppingVerifierStarts}
              setSettingsVerifierPreparationModal={setSettingsVerifierPreparationModal}
              setVerifierStatuses={setVerifierStatuses}
              setConfirmDialog={setConfirmDialog}
              setIsBusy={setIsBusy}
              save={save}
              reset={reset}
              duplicateProvider={duplicateProvider}
              duplicateModel={duplicateModel}
              loadRegistryEntries={loadRegistryEntries}
              installBenchPack={installBenchPack}
              installBenchPackFromUrl={installBenchPackFromUrl}
              updateBenchPack={updateBenchPack}
              uninstallInstalledBenchPack={uninstallInstalledBenchPack}
              configureAgentAccess={configureAgentAccess}
              regenerateAgentToken={regenerateAgentToken}
              updateDraft={updateDraft}
              saveVerifierConfig={saveVerifierConfig}
              onLocaleChange={saveLocaleSelection}
            />
          ) : (
            <AppWorkspaceShell
              sidebarOpen={sidebarOpen}
              workspaceState={workspaceState}
              activeWorkspaceId={activeWorkspace?.id ?? null}
              isLoading={isBusy && !draft}
              logsOpen={logsOpen}
              logsDetached={logsDetached}
              logTitle={activeTab ? activeTab.title : "No Active Tab"}
              logEvents={activeLogEvents}
              logsAutoScroll={logsAutoScroll}
              logDrawerHeight={logDrawerHeight}
              logContainerRef={logContainerRef}
              onCreateWorkspace={createWorkspace}
              onActivateWorkspace={activateWorkspace}
              onOpenWorkspaceContextMenu={({ workspaceId, workspaceName, x, y }) =>
                setWorkspaceContextMenu({ workspaceId, workspaceName, x, y })
              }
              onRenameWorkspace={(workspaceId, workspaceName) =>
                setWorkspaceModal({
                  mode: "rename",
                  workspaceId,
                  name: workspaceName
                })
              }
              onImportWorkspace={() => void importWorkspace()}
              onLogsAutoScrollChange={setLogsAutoScroll}
              onCloseLogs={() => setLogsOpen(false)}
              onStartLogResize={() => {
                document.body.dataset.logResizeActive = "true";
              }}
            >
              {draft ? (
	                  activeWorkspace ? (
                    <AppTabbedWorkspace
                      tabs={workspaceTabs}
                      inspections={benchPackInspections}
                      activeTab={activeTab}
                      activeInspection={activeInspection}
                      activeRuns={activeRuns}
                      liveRuns={liveRuns}
                      editingTab={editingTab}
                      draggedTabId={draggedTabId}
                      tabStripOverflow={tabStripOverflow}
                      activeTabMask={activeTabMask}
                      tabStripShellRef={tabStripShellRef}
                      tabStripRef={tabStripRef}
                      tabChipRefs={tabChipRefs}
                      webPanes={workspaceTabs.map((tab) => (
                        <AppWebBenchPackPane
                          key={tab.id}
                          tab={tab}
                          activeTabId={activeTab?.id ?? null}
                          draft={draft}
                          inspections={benchPackInspections}
                          modelAvailabilityById={modelAvailabilityById}
                          checkingModelAvailability={checkingModelAvailability}
                          runSummaries={runSummaries}
                          loadedHistoryRuns={loadedHistoryRuns}
                          activeRuns={activeRuns}
                          stoppingRuns={stoppingRuns}
                          setTabModelsModal={setTabModelsModal}
                          setSamplingModal={setSamplingModal}
                          startWebBenchPackState={startWebBenchPackState}
                          stopWebBenchPackState={stopWebBenchPackState}
                          requestWebBenchPackStop={requestWebBenchPackStop}
                          handleWebPackRunSummarySaved={handleWebPackRunSummarySaved}
                          clearLoadedHistoryRun={clearLoadedHistoryRun}
                        />
                      ))}
                      tablePane={
                        activeInspection && activeTab ? (
                          <AppTableBenchPackPane
                            activeTab={activeTab}
                            activeInspection={activeInspection}
                            draft={draft}
                            activeVerifierStatus={activeVerifierStatus}
                            activeRunBlocker={activeRunBlocker}
                            activeDisplayModels={activeDisplayModels}
                            modelAvailabilityById={modelAvailabilityById}
                            checkingModelAvailability={checkingModelAvailability}
                            activeRunSummary={activeRunSummary}
                            runHistories={runHistories}
                            activeLiveRun={activeLiveRun}
                            activeLoadedHistory={activeLoadedHistory}
                            activeRuns={activeRuns}
                            activeLiveScenarioFocus={activeLiveScenarioFocus}
                            stoppingRuns={stoppingRuns}
                            setLiveScenarioFocus={setLiveScenarioFocus}
                            updateWorkspaceState={updateWorkspaceState}
                            setTabModelsModal={setTabModelsModal}
                            setSamplingModal={setSamplingModal}
                            setHistoryModal={setHistoryModal}
                            setModelAliasModal={setModelAliasModal}
                            setSettingsTab={setSettingsTab}
                            setSettingsOpen={setSettingsOpen}
                            loadVerifierStatuses={loadVerifierStatuses}
                            refreshModelAvailability={refreshModelAvailability}
                            clearLoadedHistoryRun={clearLoadedHistoryRun}
                            resetTabRunState={resetTabRunState}
                            replayTabRun={replayTabRun}
                            resumeTabRun={resumeTabRun}
                            runTab={runTab}
                            stopTabRun={stopTabRun}
                            retryScenarioCells={retryScenarioCells}
                            setDetailModal={setDetailModal}
                          />
                        ) : null
                      }
                      emptyPane={
                        <AppWorkspaceEmptyState
                          providerCount={Object.keys(draft?.providers ?? {}).length}
                          modelCount={draft?.models.length ?? 0}
                          installedBenchPackCount={readyInspections.length}
                          onOpenSettingsTab={(tab) => {
                            setSettingsTab(tab);
                            setSettingsOpen(true);
                          }}
                          onSelectBenchPack={activeTab ? () => setTabMenuOpen(true) : undefined}
                        />
                      }
                      onWheel={handleTabStripWheel}
                      onDropTab={reorderTab}
                      onStartEditingTab={startEditingTab}
                      onCommitEditingTab={commitEditingTab}
                      onCancelEditingTab={cancelEditingTab}
                      onActivateTab={activateTab}
                      onRequestCloseTab={(tabId, tabTitle) =>
                        setConfirmDialog({
                          title: "Close Tab",
                          subtitle: `Close "${tabTitle}"? The Bench Pack tab will be removed from this workspace.`,
                          confirmLabel: "Close Tab",
                          onConfirm: () => closeTab(tabId)
                        })
                      }
                      onOpenNewTab={() => setTabMenuOpen(true)}
                      onScrollTabs={scrollTabStrip}
                      setDraggedTabId={setDraggedTabId}
                      setEditingTab={setEditingTab}
                      setWorkspaceContextMenu={setWorkspaceContextMenu}
                      setTabContextMenu={setTabContextMenu}
                    />
	                  ) : (
                      <AppWorkspaceEmptyState
                        providerCount={Object.keys(draft?.providers ?? {}).length}
                        modelCount={draft?.models.length ?? 0}
                        installedBenchPackCount={readyInspections.length}
                        onOpenSettingsTab={(tab) => {
                          setSettingsTab(tab);
                          setSettingsOpen(true);
                        }}
                      />
	                  )
	                ) : null}
            </AppWorkspaceShell>
          )}
          {!settingsOpen ? (
            <StatusFooter
              workspaceName={activeWorkspace?.name ?? "No Workspace"}
              tabTitle={activeTab?.title ?? "No Tab"}
              logsOpen={logsOpen}
              logsDetached={logsDetached}
              eventCount={activeLogEvents.length}
              onToggleLogs={() => setLogsOpen((current) => !current)}
              onToggleDetachedLogs={async () => {
                if (logsDetached) {
                  await window.benchlocal.logs.closeDetachedWindow();
                  setLogsDetached(false);
                  return;
                }

                await window.benchlocal.logs.openDetachedWindow();
                setLogsDetached(true);
                setLogsOpen(false);
              }}
            />
          ) : null}
        </section>

      </main>

      <ToastViewport messages={toastMessages} onDismiss={dismissToast} />
      <AppModelOverlays
        draft={draft}
        providerIds={providerIds}
        providerModal={providerModal}
        modelModal={modelModal}
        modelBrowserModal={modelBrowserModal}
        tabModelsModal={tabModelsModal}
        samplingModal={samplingModal}
        modelAliasModal={modelAliasModal}
        setProviderModal={setProviderModal}
        setModelModal={setModelModal}
        setModelBrowserModal={setModelBrowserModal}
        setTabModelsModal={setTabModelsModal}
        setSamplingModal={setSamplingModal}
        setModelAliasModal={setModelAliasModal}
        setError={setError}
        saveProviderModal={saveProviderModal}
        saveModelModal={saveModelModal}
        openModelBrowser={openModelBrowser}
        confirmDeleteProvider={confirmDeleteProvider}
        confirmDeleteModel={confirmDeleteModel}
        updateWorkspaceState={updateWorkspaceState}
      />
      <AppOverlays
        aboutDialogOpen={aboutDialogOpen}
        appMetadata={appMetadata}
        appUpdateState={appUpdateState}
        workspaceModal={workspaceModal}
        historyModal={historyModal}
        confirmDialog={confirmDialog}
        settingsVerifierPreparationModal={settingsVerifierPreparationModal}
        verifierPreparationModal={verifierPreparationModal}
        stoppingVerifierStarts={stoppingVerifierStarts}
        stoppingRuns={stoppingRuns}
        workspaceContextMenu={workspaceContextMenu}
        tabContextMenu={tabContextMenu}
        detailModal={detailModal}
        onCheckForUpdates={() => void checkForAppUpdates()}
        onInstallUpdate={() => void installDownloadedAppUpdate()}
        onCloseAbout={() => setAboutDialogOpen(false)}
        onWorkspaceNameChange={(value) => setWorkspaceModal((current) => (current ? { ...current, name: value } : current))}
        onCloseWorkspaceModal={() => setWorkspaceModal(null)}
        onSubmitWorkspaceRename={() => {
          if (!workspaceModal?.name.trim()) {
            setError("Workspace name is required.");
            return;
          }

          renameWorkspace(workspaceModal.workspaceId, workspaceModal.name);
          setWorkspaceModal(null);
        }}
        onCloseHistoryModal={() => setHistoryModal(null)}
        onOpenHistoryRun={(runId, mode) => {
          if (!historyModal) {
            return;
          }

          void restoreHistoryRun(historyModal.benchPackId, runId, mode);
          setHistoryModal(null);
        }}
        onDeleteSelectedHistory={(runIds) => {
          if (!historyModal) {
            return;
          }

          setConfirmDialog({
            title: `Delete ${runIds.length} selected ${
              runIds.length === 1 ? "history" : "histories"
            } for ${historyModal.benchPackName}?`,
            subtitle: "This permanently deletes the selected saved test runs.",
            confirmLabel: "Delete Selected",
            tone: "danger",
            onConfirm: () => {
              void deleteSelectedHistoryForBenchPack(historyModal.benchPackId, historyModal.benchPackName, runIds);
            }
          });
        }}
        onCloseConfirmDialog={() => setConfirmDialog(null)}
        onCancelSettingsVerifierStart={(benchPackId) => void cancelSettingsVerifierStart(benchPackId)}
        onStopTabRun={(tabId) => void stopTabRun(tabId)}
        onCloseWorkspaceMenu={() => setWorkspaceContextMenu(null)}
        onCloseTabMenu={() => setTabContextMenu(null)}
        onExportWorkspace={(workspaceId) => void exportWorkspace(workspaceId)}
        onRequestDeleteWorkspace={(workspaceId, workspaceName) =>
          setConfirmDialog({
            title: "Delete Workspace",
            subtitle: `Delete "${workspaceName}" and all of its tabs? This cannot be undone.`,
            confirmLabel: "Delete Workspace",
            tone: "danger",
            onConfirm: () => deleteWorkspace(workspaceId)
          })
        }
        onDuplicateTab={(tabId) => duplicateTab(tabId)}
        onRenameTab={(tabId, tabTitle) => startEditingTab(tabId, tabTitle)}
        onRequestCloseTab={(tabId, tabTitle) =>
          setConfirmDialog({
            title: "Close Tab",
            subtitle: `Close "${tabTitle}"? The Bench Pack tab will be removed from this workspace.`,
            confirmLabel: "Close Tab",
            onConfirm: () => closeTab(tabId)
          })
        }
        onCloseDetail={() => setDetailModal(null)}
        onRetryDetail={() => {
          if (detailModal) {
            void retryScenarioFromDetail(detailModal);
          }
        }}
      />
    </div>
    </I18nProvider>
  );
}
