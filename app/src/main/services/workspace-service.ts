import { randomUUID } from "node:crypto";
import type {
  BenchLocalConfig,
  BenchLocalExecutionMode,
  BenchLocalWorkspaceState,
  BenchLocalWorkspaceTabModelSelection,
  GenerationRequest
} from "@core";
import {
  getWorkspaceStatePath,
  loadOrCreateWorkspaceState,
  saveWorkspaceStateFile
} from "@core";
import type { AgentEventBus } from "./agent-event-bus";
import type { ConfigService } from "./config-service";

function normalizeRunsPerTest(value: unknown): number {
  return [1, 3, 5, 7, 9].includes(value as number) ? (value as number) : 1;
}

function normalizeModelSelections(
  selections: BenchLocalWorkspaceTabModelSelection[],
  config: BenchLocalConfig
): BenchLocalWorkspaceTabModelSelection[] {
  const availableIds = new Set(config.models.filter((model) => model.enabled).map((model) => model.id));
  const seen = new Set<string>();
  const normalized: BenchLocalWorkspaceTabModelSelection[] = [];

  for (const selection of selections) {
    const modelId = selection.modelId.trim();

    if (!modelId || seen.has(modelId) || !availableIds.has(modelId)) {
      continue;
    }

    seen.add(modelId);
    normalized.push({
      modelId,
      ...(selection.alias?.trim() ? { alias: selection.alias.trim() } : {})
    });
  }

  return normalized;
}

function normalizeModelIds(
  modelIds: string[],
  config: BenchLocalConfig
): BenchLocalWorkspaceTabModelSelection[] {
  return normalizeModelSelections(
    modelIds.map((modelId) => ({ modelId })),
    config
  );
}

export class WorkspaceService {
  constructor(
    private readonly eventBus: AgentEventBus,
    private readonly configService: ConfigService
  ) {}

  async loadWorkspaceState() {
    await this.configService.loadConfig();
    return loadOrCreateWorkspaceState(getWorkspaceStatePath());
  }

  async saveWorkspaceState(state: BenchLocalWorkspaceState) {
    await this.configService.loadConfig();
    const statePath = getWorkspaceStatePath();
    const saved = await saveWorkspaceStateFile(state, statePath);
    const result = {
      path: statePath,
      created: false,
      state: saved
    };

    this.eventBus.emitAgentEvent("workspace.updated", { state: saved });
    return result;
  }

  async createWorkspaceTab(
    workspaceId: string,
    input: {
      benchPackId?: string | null;
      title?: string;
      modelSelections?: BenchLocalWorkspaceTabModelSelection[];
    }
  ) {
    const { config } = await this.configService.loadConfig();

    return this.mutateWorkspaceState((state) => {
      const workspace = state.workspaces[workspaceId];

      if (!workspace) {
        throw new Error(`Workspace "${workspaceId}" was not found.`);
      }

      const now = new Date().toISOString();
      const tabId = `tab-${randomUUID()}`;
      const benchPackId = input.benchPackId?.trim() || null;

      state.tabs[tabId] = {
        id: tabId,
        title: input.title?.trim() || (benchPackId ? this.createTabTitle(benchPackId) : "New Tab"),
        benchPackId,
        loadedRunId: null,
        focusedScenarioId: null,
        modelSelections: normalizeModelSelections(input.modelSelections ?? [], config),
        samplingOverrides: {},
        executionMode: "parallel_by_test_case",
        runsPerTest: 1,
        createdAt: now,
        updatedAt: now
      };
      workspace.tabIds.push(tabId);
      workspace.activeTabId = tabId;
      workspace.updatedAt = now;

      return state;
    });
  }

  async patchTab(
    tabId: string,
    patch: Partial<{
      title: string;
      focusedScenarioId: string | null;
      modelSelections: BenchLocalWorkspaceTabModelSelection[];
      samplingOverrides: GenerationRequest;
      executionMode: BenchLocalExecutionMode;
      runsPerTest: number;
    }>
  ) {
    const { config } = await this.configService.loadConfig();

    return this.mutateWorkspaceState((state) => {
      const tab = state.tabs[tabId];

      if (!tab) {
        throw new Error(`Tab "${tabId}" was not found.`);
      }

      if (patch.title !== undefined) tab.title = patch.title.trim() || "New Tab";
      if (patch.focusedScenarioId !== undefined) tab.focusedScenarioId = patch.focusedScenarioId?.trim() || null;
      if (patch.modelSelections !== undefined) tab.modelSelections = normalizeModelSelections(patch.modelSelections, config);
      if (patch.samplingOverrides !== undefined) tab.samplingOverrides = patch.samplingOverrides;
      if (patch.executionMode !== undefined) tab.executionMode = patch.executionMode;
      if (patch.runsPerTest !== undefined) tab.runsPerTest = normalizeRunsPerTest(patch.runsPerTest);

      tab.updatedAt = new Date().toISOString();
      return state;
    });
  }

  async selectTabBenchPack(tabId: string, benchPackId: string | null, title?: string) {
    return this.mutateWorkspaceState((state) => {
      const tab = state.tabs[tabId];

      if (!tab) throw new Error(`Tab "${tabId}" was not found.`);

      const normalizedBenchPackId = benchPackId?.trim() || null;
      tab.benchPackId = normalizedBenchPackId;
      tab.loadedRunId = null;
      tab.focusedScenarioId = null;
      tab.title = title?.trim() || (normalizedBenchPackId ? this.createTabTitle(normalizedBenchPackId) : "New Tab");
      tab.updatedAt = new Date().toISOString();
      return state;
    });
  }

  async selectTabModels(
    tabId: string,
    input: { modelIds?: string[]; selections?: BenchLocalWorkspaceTabModelSelection[] }
  ) {
    const { config } = await this.configService.loadConfig();

    return this.mutateWorkspaceState((state) => {
      const tab = state.tabs[tabId];

      if (!tab) throw new Error(`Tab "${tabId}" was not found.`);

      tab.modelSelections = input.selections
        ? normalizeModelSelections(input.selections, config)
        : normalizeModelIds(input.modelIds ?? [], config);
      tab.loadedRunId = null;
      tab.updatedAt = new Date().toISOString();
      return state;
    });
  }

  async setTabLoadedRun(tabId: string, runId: string | null) {
    return this.mutateWorkspaceState((state) => {
      const tab = state.tabs[tabId];

      if (!tab) return state;

      tab.loadedRunId = runId;
      tab.updatedAt = new Date().toISOString();
      return state;
    });
  }

  // Provider/Model 服务通过这两个方法维护跨标签引用，不再直接操作工作区文件。
  async removeModelSelections(modelIds: Set<string>) {
    if (modelIds.size === 0) return this.loadWorkspaceState();

    return this.mutateWorkspaceState((state) => {
      for (const tab of Object.values(state.tabs)) {
        tab.modelSelections = tab.modelSelections.filter((selection) => !modelIds.has(selection.modelId));
      }
      return state;
    });
  }

  async replaceModelSelectionId(previousModelId: string, nextModelId: string) {
    if (previousModelId === nextModelId) return this.loadWorkspaceState();

    return this.mutateWorkspaceState((state) => {
      for (const tab of Object.values(state.tabs)) {
        tab.modelSelections = tab.modelSelections.map((selection) =>
          selection.modelId === previousModelId ? { ...selection, modelId: nextModelId } : selection
        );
      }
      return state;
    });
  }

  private async mutateWorkspaceState(
    updater: (state: BenchLocalWorkspaceState) => BenchLocalWorkspaceState
  ) {
    const { state } = await this.loadWorkspaceState();
    const nextState = updater(structuredClone(state));
    return this.saveWorkspaceState(nextState);
  }

  private createTabTitle(benchPackId: string): string {
    return benchPackId
      .split(/[-_]+/g)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || "New Tab";
  }
}
