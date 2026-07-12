import type {
  BenchLocalExecutionMode,
  BenchLocalModelConfig,
  BenchLocalWorkspaceTab,
  BenchLocalWorkspaceTabModelSelection,
  BenchPackRunSummary,
  ProgressEvent,
  ScenarioMeta,
  ScenarioResult
} from "@core";
import type { ResolvedTabModel } from "../models/model-config";
import { getCellKey, type LiveRunState, type RetryScenarioCell } from "./run-utils";
export function normalizeTabModelSelections(
  selections: BenchLocalWorkspaceTabModelSelection[]
): BenchLocalWorkspaceTabModelSelection[] {
  const seen = new Set<string>();

  return selections
    .filter((selection) => {
      const modelId = selection.modelId.trim();

      if (!modelId || seen.has(modelId)) {
        return false;
      }

      seen.add(modelId);
      return true;
    })
    .map((selection) => ({
      modelId: selection.modelId.trim(),
      alias: selection.alias?.trim() || undefined
    }));
}

export function normalizeEditableTabModelSelections(
  selections: BenchLocalWorkspaceTabModelSelection[]
): BenchLocalWorkspaceTabModelSelection[] {
  const seen = new Set<string>();

  return selections
    .filter((selection) => {
      const modelId = selection.modelId.trim();

      if (!modelId || seen.has(modelId)) {
        return false;
      }

      seen.add(modelId);
      return true;
    })
    .map((selection) => ({
      modelId: selection.modelId.trim(),
      alias: selection.alias
    }));
}

export function resolveTabModels(tab: BenchLocalWorkspaceTab | null, models: BenchLocalModelConfig[]): ResolvedTabModel[] {
  const enabledModels = models.filter((model) => model.enabled);
  const modelMap = new Map(enabledModels.map((model) => [model.id, model]));

  return normalizeTabModelSelections(tab?.modelSelections ?? []).reduce<ResolvedTabModel[]>((resolved, selection) => {
      const model = modelMap.get(selection.modelId);

      if (!model) {
        return resolved;
      }

      resolved.push({
        ...model,
        alias: selection.alias,
        displayLabel: selection.alias || model.label
      });

      return resolved;
    }, []);
}

export function resolveHistoryModels(
  runSummary: BenchPackRunSummary | null,
  models: BenchLocalModelConfig[]
): ResolvedTabModel[] {
  if (!runSummary) {
    return [];
  }

  const modelMap = new Map(models.map((model) => [model.id, model]));
  const runStartedEvent = runSummary.events.find(
    (event): event is Extract<ProgressEvent, { type: "run_started" }> => event.type === "run_started"
  );
  const orderedModelIds = [
    ...(runStartedEvent?.models.map((model) => model.id) ?? []),
    ...Object.keys(runSummary.resultsByModel)
  ].filter((modelId, index, all) => modelId && all.indexOf(modelId) === index);

  return orderedModelIds.map((modelId) => {
    const currentModel = modelMap.get(modelId);
    const historicalLabel = runStartedEvent?.models.find((model) => model.id === modelId)?.label;
    const label = currentModel?.label ?? historicalLabel ?? modelId;

    return {
      id: modelId,
      provider: currentModel?.provider ?? "history",
      model: currentModel?.model ?? modelId,
      label,
      group: currentModel?.group ?? "history",
      enabled: currentModel?.enabled ?? false,
      displayLabel: label
    };
  });
}


export function buildHistoryModelSelections(
  runSummary: BenchPackRunSummary | null,
  models: BenchLocalModelConfig[]
): BenchLocalWorkspaceTabModelSelection[] {
  return resolveHistoryModels(runSummary, models).map((model) => ({
    modelId: model.id,
    alias: model.displayLabel !== model.label ? model.displayLabel : undefined
  }));
}

export type ReplayCell = {
  modelId: string;
  scenarioId: string;
  result: ScenarioResult;
};

export function buildReplayGroups(
  summary: BenchPackRunSummary,
  scenarios: ScenarioMeta[],
  modelIds: string[]
): ReplayCell[][] {
  const scenarioOrder = scenarios.map((scenario) => scenario.id);
  const resultMap = new Map<string, ScenarioResult>();

  for (const [modelId, results] of Object.entries(summary.resultsByModel)) {
    for (const result of results) {
      resultMap.set(`${modelId}::${result.scenarioId}`, result);
    }
  }

  const singletonCellsByScenarioThenModel = scenarioOrder.flatMap((scenarioId) =>
    modelIds.flatMap((modelId) => {
      const result = resultMap.get(`${modelId}::${scenarioId}`);
      return result ? [[{ modelId, scenarioId, result } satisfies ReplayCell]] : [];
    })
  );

  switch (summary.executionMode ?? "parallel_by_test_case") {
    case "serial":
      return singletonCellsByScenarioThenModel;
    case "serial_by_model":
      return modelIds.flatMap((modelId) =>
        scenarioOrder.flatMap((scenarioId) => {
          const result = resultMap.get(`${modelId}::${scenarioId}`);
          return result ? [[{ modelId, scenarioId, result } satisfies ReplayCell]] : [];
        })
      );
    case "parallel_by_test_case":
      return scenarioOrder
        .map((scenarioId) =>
          modelIds.flatMap((modelId) => {
            const result = resultMap.get(`${modelId}::${scenarioId}`);
            return result ? [{ modelId, scenarioId, result } satisfies ReplayCell] : [];
          })
        )
        .filter((group) => group.length > 0);
    case "parallel_by_model":
      return modelIds
        .map((modelId) =>
          scenarioOrder.flatMap((scenarioId) => {
            const result = resultMap.get(`${modelId}::${scenarioId}`);
            return result ? [{ modelId, scenarioId, result } satisfies ReplayCell] : [];
          })
        )
        .filter((group) => group.length > 0);
    case "full_parallel":
      return [
        scenarioOrder.flatMap((scenarioId) =>
          modelIds.flatMap((modelId) => {
            const result = resultMap.get(`${modelId}::${scenarioId}`);
            return result ? [{ modelId, scenarioId, result } satisfies ReplayCell] : [];
          })
        )
      ].filter((group) => group.length > 0);
    default:
      return singletonCellsByScenarioThenModel;
  }
}

export function groupRetryCellsForExecutionMode(
  cells: RetryScenarioCell[],
  executionMode: BenchLocalExecutionMode,
  scenarios: ScenarioMeta[],
  models: ResolvedTabModel[]
): RetryScenarioCell[][] {
  const cellsByKey = new Map(cells.map((cell) => [getCellKey(cell.modelId, cell.scenarioId), cell]));
  const scenarioOrder = scenarios.map((scenario) => scenario.id);
  const modelOrder = models.map((model) => model.id);
  // 保留 runId，使来自不同模型历史快照的重试仍写回各自的原始运行。
  const cellFor = (modelId: string, scenarioId: string): RetryScenarioCell | null =>
    cellsByKey.get(getCellKey(modelId, scenarioId)) ?? null;
  const singletonByScenarioThenModel = scenarioOrder.flatMap((scenarioId) =>
    modelOrder.flatMap((modelId) => {
      const cell = cellFor(modelId, scenarioId);
      return cell ? [[cell]] : [];
    })
  );

  switch (executionMode) {
    case "serial":
      return singletonByScenarioThenModel;
    case "serial_by_model":
      return modelOrder.flatMap((modelId) =>
        scenarioOrder.flatMap((scenarioId) => {
          const cell = cellFor(modelId, scenarioId);
          return cell ? [[cell]] : [];
        })
      );
    case "parallel_by_test_case":
      return scenarioOrder
        .map((scenarioId) => modelOrder.flatMap((modelId) => cellFor(modelId, scenarioId) ?? []))
        .filter((group) => group.length > 0);
    case "parallel_by_model":
      return modelOrder
        .map((modelId) => scenarioOrder.flatMap((scenarioId) => cellFor(modelId, scenarioId) ?? []))
        .filter((group) => group.length > 0);
    case "full_parallel":
      return [singletonByScenarioThenModel.flat()].filter((group) => group.length > 0);
    default:
      return singletonByScenarioThenModel;
  }
}

export function upsertTabModelAlias(
  tab: BenchLocalWorkspaceTab,
  models: BenchLocalModelConfig[],
  modelId: string,
  alias: string
): BenchLocalWorkspaceTabModelSelection[] {
  const normalized = normalizeTabModelSelections(tab.modelSelections);
  const nextAlias = alias.trim() || undefined;
  let found = false;

  const next = normalized.map((selection) => {
    if (selection.modelId !== modelId) {
      return selection;
    }

    found = true;
    return {
      ...selection,
      alias: nextAlias
    };
  });

  if (!found) {
    next.push({
      modelId,
      alias: nextAlias
    });
  }

  return next;
}

export function pushScenarioResult(
  current: Record<string, ScenarioResult[]>,
  modelId: string,
  result: ScenarioResult
): Record<string, ScenarioResult[]> {
  return {
    ...current,
    [modelId]: [...(current[modelId] ?? []).filter((candidate) => candidate.scenarioId !== result.scenarioId), result]
  };
}

export function updateLiveRunState(
  current: LiveRunState | undefined,
  event: ProgressEvent
): LiveRunState {
  const next: LiveRunState = current ?? {
    events: [],
    resultsByModel: {},
    activeCellKeys: []
  };

  const eventKey =
    "modelId" in event && "scenarioId" in event ? `${event.modelId}::${event.scenarioId}` : null;

  next.events = [...next.events, event];

  if (event.type === "run_started") {
    next.runId = event.runId;
  }

  if (event.type === "model_progress" && eventKey && !next.activeCellKeys.includes(eventKey)) {
    next.activeCellKeys = [...next.activeCellKeys, eventKey];
  }

  if (event.type === "scenario_result" && eventKey) {
    next.resultsByModel = pushScenarioResult(next.resultsByModel, event.modelId, event.result);
    next.activeCellKeys = next.activeCellKeys.filter((key) => key !== eventKey);
  }

  if (event.type === "run_finished" || event.type === "run_error") {
    next.activeCellKeys = [];
  }

  return next;
}
