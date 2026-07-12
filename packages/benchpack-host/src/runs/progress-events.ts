// 进度事件合并：将持久化事件与当前事件按长度差归并，用于 retry/resume 恢复事件流。
import type { ProgressEvent } from "@benchlocal/core";

export function mergeSummaryEvents(current: ProgressEvent[], persisted?: ProgressEvent[]): ProgressEvent[] {
  if (!persisted || persisted.length <= current.length) {
    return current;
  }

  return [...current, ...persisted.slice(current.length)];
}
