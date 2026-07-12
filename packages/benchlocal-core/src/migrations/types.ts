export type PersistedDocument = Record<string, unknown>;

export function isPersistedDocument(value: unknown): value is PersistedDocument {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function copyPersistedDocument(value: unknown): PersistedDocument {
  return isPersistedDocument(value) ? { ...value } : {};
}
