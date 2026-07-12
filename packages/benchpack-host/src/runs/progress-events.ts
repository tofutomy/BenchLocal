import type { ProgressEvent } from "@benchlocal/core";

export function mergeSummaryEvents(current: ProgressEvent[], persisted?: ProgressEvent[]): ProgressEvent[] {
  if (!persisted || persisted.length <= current.length) {
    return current;
  }

  return [...current, ...persisted.slice(current.length)];
}
