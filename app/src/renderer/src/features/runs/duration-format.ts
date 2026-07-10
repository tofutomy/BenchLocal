export function formatDurationMs(durationMs?: number): string | null {
  if (durationMs === undefined || !Number.isFinite(durationMs)) {
    return null;
  }

  if (durationMs < 1000) {
    return `${Math.max(0, Math.round(durationMs))} ms`;
  }

  if (durationMs < 60_000) {
    return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)} s`;
  }

  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1000);
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}