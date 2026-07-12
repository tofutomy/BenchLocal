// Run summary lock 独立于 Docker lock，避免不同副作用领域共享隐式状态。
const runSummaryLocks = new Map<string, Promise<void>>();

export async function withRunSummaryLock<T>(
  runKey: string,
  operation: () => Promise<T>
): Promise<T> {
  const previous = runSummaryLocks.get(runKey) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => gate);
  runSummaryLocks.set(runKey, tail);

  await previous.catch(() => undefined);

  try {
    return await operation();
  } finally {
    release();
    if (runSummaryLocks.get(runKey) === tail) {
      runSummaryLocks.delete(runKey);
    }
  }
}
