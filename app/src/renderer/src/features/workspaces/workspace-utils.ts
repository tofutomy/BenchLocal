import type { BenchPackInspection } from "@core";

export const SIDEBAR_OPEN_STORAGE_KEY = "benchlocal.sidebar-open";

export function createWorkspaceName(existingCount: number): string {
  return existingCount === 0 ? "My Workspace" : `Workspace ${existingCount + 1}`;
}

export function createTabTitle(benchPackId: string, inspections: BenchPackInspection[]): string {
  return inspections.find((inspection) => inspection.id === benchPackId)?.manifest?.name ?? benchPackId;
}