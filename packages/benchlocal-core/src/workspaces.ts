import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getBenchLocalHome } from "./config.js";
import type { GenerationRequest } from "./protocol.js";
import { migrateWorkspaceV1 } from "./migrations/workspace-v1.js";

export type BenchLocalExecutionMode =
  | "serial"
  | "serial_by_model"
  | "parallel_by_model"
  | "parallel_by_test_case"
  | "full_parallel";

export type BenchLocalWorkspaceTabModelSelection = {
  modelId: string;
  alias?: string;
};

export type BenchLocalWorkspaceTab = {
  id: string;
  title: string;
  benchPackId: string | null;
  loadedRunId?: string | null;
  focusedScenarioId: string | null;
  modelSelections: BenchLocalWorkspaceTabModelSelection[];
  samplingOverrides?: GenerationRequest;
  executionMode: BenchLocalExecutionMode;
  runsPerTest: number;
  createdAt: string;
  updatedAt: string;
};

export type BenchLocalWorkspace = {
  id: string;
  name: string;
  tabIds: string[];
  activeTabId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BenchLocalWorkspaceState = {
  schema_version: 1;
  activeWorkspaceId: string | null;
  workspaceOrder: string[];
  workspaces: Record<string, BenchLocalWorkspace>;
  tabs: Record<string, BenchLocalWorkspaceTab>;
};

export type LoadedBenchLocalWorkspaceState = {
  path: string;
  created: boolean;
  state: BenchLocalWorkspaceState;
};

const WorkspaceTabSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  benchPackId: z.string().trim().min(1).nullable().default(null),
  loadedRunId: z.string().trim().min(1).nullable().default(null),
  focusedScenarioId: z.string().trim().min(1).nullable(),
  modelSelections: z
    .array(
      z.object({
        modelId: z.string().trim().min(1),
        alias: z.string().trim().min(1).optional()
      })
    )
    .default([]),
  samplingOverrides: z
    .object({
      temperature: z.number().optional(),
      top_p: z.number().optional(),
      top_k: z.number().optional(),
      min_p: z.number().optional(),
      max_tokens: z.number().int().min(1).optional(),
      seed: z.number().int().optional(),
      stop: z.union([z.string(), z.array(z.string())]).optional(),
      repetition_penalty: z.number().optional(),
      presence_penalty: z.number().optional(),
      frequency_penalty: z.number().optional(),
      reasoning: z
        .object({
          effort: z.enum(["minimal", "low", "medium", "high"]).optional(),
          budget_tokens: z.number().int().min(0).optional(),
          enabled: z.boolean().optional(),
          adaptive: z.boolean().optional(),
          exclude: z.boolean().optional(),
          summary: z.enum(["auto", "concise", "detailed"]).optional(),
          provider: z.record(z.string(), z.unknown()).optional()
        })
        .optional(),
      provider_options: z.record(z.string(), z.unknown()).optional(),
      extra_body: z.record(z.string(), z.unknown()).optional(),
      request_timeout_seconds: z.number().int().min(1).optional()
    })
    .default({}),
  executionMode: z
    .enum(["serial", "serial_by_model", "parallel_by_model", "parallel_by_test_case", "full_parallel"])
    .default("parallel_by_test_case"),
  runsPerTest: z.number().int().min(1).max(10).default(1),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1)
});

const WorkspaceSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  tabIds: z.array(z.string().trim().min(1)).default([]),
  activeTabId: z.string().trim().min(1).nullable(),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1)
});

const WorkspaceStateSchema = z.object({
  schema_version: z.literal(1).default(1),
  activeWorkspaceId: z.string().trim().min(1).nullable(),
  workspaceOrder: z.array(z.string().trim().min(1)).default([]),
  workspaces: z.record(z.string(), WorkspaceSchema).default({}),
  tabs: z.record(z.string(), WorkspaceTabSchema).default({})
});

function normalizeRunsPerTest(value: unknown): number {
  return [1, 3, 5, 7, 9].includes(value as number) ? (value as number) : 1;
}

export function getWorkspaceStatePath(): string {
  return path.join(getBenchLocalHome(), "state.json");
}

export function createDefaultWorkspaceState(defaultBenchPack = ""): BenchLocalWorkspaceState {
  const now = new Date().toISOString();
  const workspaceId = `workspace-${randomUUID()}`;
  const tabId = `tab-${randomUUID()}`;
  const hasDefaultBenchPack = Boolean(defaultBenchPack.trim());

  return {
    schema_version: 1,
    activeWorkspaceId: workspaceId,
    workspaceOrder: [workspaceId],
    workspaces: {
      [workspaceId]: {
        id: workspaceId,
        name: "My Workspace",
        tabIds: [tabId],
        activeTabId: tabId,
        createdAt: now,
        updatedAt: now
      }
    },
    tabs: {
      [tabId]: {
        id: tabId,
        title: hasDefaultBenchPack ? defaultBenchPack : "New Tab",
        benchPackId: hasDefaultBenchPack ? defaultBenchPack : null,
        loadedRunId: null,
        focusedScenarioId: null,
        modelSelections: [],
        samplingOverrides: {},
        executionMode: "parallel_by_test_case",
        runsPerTest: 1,
        createdAt: now,
        updatedAt: now
      }
    }
  };
}

function normalizeWorkspaceState(raw: unknown, defaultBenchPack = ""): BenchLocalWorkspaceState {
  const defaults = createDefaultWorkspaceState(defaultBenchPack);
  // 旧字段只在 migration 中处理，下面仅归一化和校验当前 v1 结构。
  const parsed = WorkspaceStateSchema.parse(migrateWorkspaceV1(raw));

  const workspaces = { ...parsed.workspaces };
  const tabs = { ...parsed.tabs };
  const workspaceOrder = parsed.workspaceOrder.filter((workspaceId) => workspaces[workspaceId]);

  for (const [workspaceId, workspace] of Object.entries(workspaces)) {
    const validTabIds = workspace.tabIds.filter((tabId) => tabs[tabId]);
    const activeTabId = workspace.activeTabId && validTabIds.includes(workspace.activeTabId) ? workspace.activeTabId : validTabIds[0] ?? null;
    workspaces[workspaceId] = {
      ...workspace,
      tabIds: validTabIds,
      activeTabId
    };
  }

  for (const [tabId, tab] of Object.entries(tabs)) {
    tabs[tabId] = {
      ...tab,
      modelSelections: (tab.modelSelections ?? []).filter((selection) => Boolean(selection.modelId)),
      samplingOverrides: Object.fromEntries(
        Object.entries(tab.samplingOverrides ?? {}).filter(([, value]) => value !== undefined)
      ),
      loadedRunId: tab.loadedRunId ?? null,
      executionMode: tab.executionMode ?? "parallel_by_test_case",
      runsPerTest: normalizeRunsPerTest(tab.runsPerTest)
    };
  }

  const normalizedOrder = workspaceOrder.length > 0 ? workspaceOrder : Object.keys(workspaces);
  const activeWorkspaceId =
    parsed.activeWorkspaceId && workspaces[parsed.activeWorkspaceId]
      ? parsed.activeWorkspaceId
      : normalizedOrder[0] ?? null;

  if (normalizedOrder.length === 0) {
    return defaults;
  }

  return {
    schema_version: 1,
    activeWorkspaceId,
    workspaceOrder: normalizedOrder,
    workspaces,
    tabs
  };
}

export async function loadWorkspaceStateFile(
  statePath = getWorkspaceStatePath(),
  defaultBenchPack = ""
): Promise<BenchLocalWorkspaceState> {
  const raw = await fs.readFile(statePath, "utf8");
  return normalizeWorkspaceState(JSON.parse(raw), defaultBenchPack);
}

export async function loadOrCreateWorkspaceState(
  statePath = getWorkspaceStatePath(),
  defaultBenchPack = ""
): Promise<LoadedBenchLocalWorkspaceState> {
  await fs.mkdir(path.dirname(statePath), { recursive: true });

  try {
    const state = await loadWorkspaceStateFile(statePath, defaultBenchPack);
    return {
      path: statePath,
      created: false,
      state
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown workspace bootstrap error.";

    if (!/ENOENT/.test(message)) {
      throw error;
    }
  }

  const state = createDefaultWorkspaceState(defaultBenchPack);
  await saveWorkspaceStateFile(state, statePath, defaultBenchPack);

  return {
    path: statePath,
    created: true,
    state
  };
}

export async function saveWorkspaceStateFile(
  state: BenchLocalWorkspaceState,
  statePath = getWorkspaceStatePath(),
  defaultBenchPack = ""
): Promise<BenchLocalWorkspaceState> {
  const normalized = normalizeWorkspaceState(state, defaultBenchPack);
  await fs.mkdir(path.dirname(statePath), { recursive: true });

  const tempPath = `${statePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(normalized, null, 2), "utf8");
  await fs.rename(tempPath, statePath);

  return normalized;
}
