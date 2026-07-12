// 统一处理 run、Verifier 和外部进程的取消信号，确保不同领域使用相同错误语义。
export function createAbortError(signal?: AbortSignal): Error {
  const reason = signal?.reason;

  if (reason instanceof Error) {
    return reason;
  }

  return new Error("Run cancelled by user.");
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return;
  }

  throw createAbortError(signal);
}

export async function waitForPromiseWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return promise;
  }

  throwIfAborted(signal);

  return await new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(createAbortError(signal));
    };

    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

export async function waitForAbortableDelay(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (delayMs <= 0) {
    throwIfAborted(signal);
    return;
  }

  if (!signal) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return;
  }

  throwIfAborted(signal);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      reject(createAbortError(signal));
    };

    signal.addEventListener("abort", onAbort, { once: true });
  });
}