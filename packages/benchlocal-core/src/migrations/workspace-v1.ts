import { copyPersistedDocument, isPersistedDocument, type PersistedDocument } from "./types.js";

const LEGACY_EXECUTION_MODES: Record<string, string> = {
  parallel_models: "parallel_by_model",
  parallel_scenarios: "parallel_by_test_case"
};

function migrateWorkspaceTabV1(value: unknown): unknown {
  if (!isPersistedDocument(value)) return value;

  const migrated = { ...value };
  if (migrated.benchPackId === undefined && (typeof migrated.pluginId === "string" || migrated.pluginId === null)) {
    migrated.benchPackId = migrated.pluginId;
  }
  if (typeof migrated.executionMode === "string") {
    migrated.executionMode = LEGACY_EXECUTION_MODES[migrated.executionMode] ?? migrated.executionMode;
  }
  delete migrated.pluginId;
  return migrated;
}

/** 迁移工作区历史字段，且不修改调用方传入的原始对象。 */
export function migrateWorkspaceV1(raw: unknown): PersistedDocument {
  const migrated = copyPersistedDocument(raw);
  if (isPersistedDocument(migrated.tabs)) {
    migrated.tabs = Object.fromEntries(
      Object.entries(migrated.tabs).map(([tabId, tab]) => [tabId, migrateWorkspaceTabV1(tab)])
    );
  }
  return migrated;
}
