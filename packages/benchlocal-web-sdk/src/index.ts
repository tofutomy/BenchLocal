import type {
  BenchLocalChatRequest,
  BenchLocalChatResponse,
  BenchLocalChatStreamEvent,
  GenerationRequest,
  ModelAvailability,
  RegisteredModel,
  WebBenchPackHistoryPayload
} from "@benchlocal/core";

export type {
  BenchLocalChatRequest,
  BenchLocalChatResponse,
  BenchLocalChatStreamEvent,
  GenerationRequest,
  ModelAvailability,
  RegisteredModel,
  WebBenchPackHistoryPayload
} from "@benchlocal/core";

export const BENCHLOCAL_WEB_BRIDGE_VERSION = 1 as const;
export const BENCHLOCAL_WEB_PACK_MESSAGE_SOURCE = "benchlocal-web-pack" as const;
export const BENCHLOCAL_WEB_HOST_MESSAGE_SOURCE = "benchlocal-host" as const;

export type BenchLocalWebBridgeMethod =
  | "capabilities"
  | "models.list"
  | "models.getSelected"
  | "inference.chat"
  | "inference.streamChat"
  | "runs.startState"
  | "runs.stopState"
  | "runs.updateProgress"
  | "history.load"
  | "history.save"
  | "history.writeArtifact";

export interface BenchLocalWebPackRequestMessage<TPayload = unknown> {
  source: typeof BENCHLOCAL_WEB_PACK_MESSAGE_SOURCE;
  bridgeVersion: typeof BENCHLOCAL_WEB_BRIDGE_VERSION;
  requestId: string;
  streamId?: string;
  method: BenchLocalWebBridgeMethod;
  payload?: TPayload;
}

export type BenchLocalWebHostResponseMessage<TResult = unknown> =
  | {
      source: typeof BENCHLOCAL_WEB_HOST_MESSAGE_SOURCE;
      bridgeVersion: typeof BENCHLOCAL_WEB_BRIDGE_VERSION;
      requestId: string;
      ok: true;
      result: TResult;
    }
  | {
      source: typeof BENCHLOCAL_WEB_HOST_MESSAGE_SOURCE;
      bridgeVersion: typeof BENCHLOCAL_WEB_BRIDGE_VERSION;
      requestId: string;
      ok: false;
      error: {
        message: string;
        code?: string;
        retryable?: boolean;
      };
    };

export interface BenchLocalWebHostStreamMessage<TEvent = unknown> {
  source: typeof BENCHLOCAL_WEB_HOST_MESSAGE_SOURCE;
  bridgeVersion: typeof BENCHLOCAL_WEB_BRIDGE_VERSION;
  streamId: string;
  event: TEvent;
  done?: boolean;
}

export interface BenchLocalWebCapabilities {
  bridgeVersion: typeof BENCHLOCAL_WEB_BRIDGE_VERSION;
  permissions: string[];
  pack: {
    id: string;
    name: string;
    version: string;
    entry: string;
    buildId?: string;
  };
  history?: {
    runId?: string;
    mode?: "live" | "history";
    playback: boolean;
  };
}

export interface BenchLocalWebModelList {
  models: Array<RegisteredModel & { providerId?: string }>;
  availability?: ModelAvailability[];
}

export interface BenchLocalWebSelectedModels {
  models: Array<RegisteredModel & { providerId?: string }>;
  availability?: ModelAvailability[];
}

export interface BenchLocalWebModelChangeEvent extends BenchLocalWebSelectedModels {}

export interface BenchLocalWebRunProgressInput {
  status?: "created" | "running" | "completed" | "cancelled" | "error";
  message?: string;
  progress?: number;
  metadata?: Record<string, unknown>;
}

export interface BenchLocalWebRunProgressResult {
  accepted: true;
  runId?: string;
}

export interface BenchLocalWebRunStateInput {
  message?: string;
  metadata?: Record<string, unknown>;
}

export interface BenchLocalWebRunStopRequestedEvent {
  requestedAt: string;
  reason?: string;
}

export interface BenchLocalWebEnvironmentDetectOptions {
  timeoutMs?: number;
}

export interface BenchLocalWebEnvironmentInfo {
  isEmbedded: boolean;
  isInsideBenchLocal: boolean;
  bridgeAvailable: boolean;
  bridgeVersion?: typeof BENCHLOCAL_WEB_BRIDGE_VERSION;
  capabilities?: BenchLocalWebCapabilities;
  reason?: "top-level" | "timeout" | "error";
  error?: string;
}

export interface BenchLocalWebHistorySaveInput extends WebBenchPackHistoryPayload {}

export interface BenchLocalWebHistoryLoadResult<TMetadata extends Record<string, unknown> = Record<string, unknown>> {
  runId?: string;
  payload?: Omit<WebBenchPackHistoryPayload, "metadata"> & {
    metadata?: TMetadata;
  };
}

export interface BenchLocalWebArtifactWriteInput {
  kind: string;
  label: string;
  path?: string;
  contentType?: string;
  content: string | ArrayBuffer | Uint8Array;
}

export interface BenchLocalWebArtifactWriteResult {
  kind: string;
  label: string;
  path: string;
  contentType?: string;
}

export interface BenchLocalWebClientOptions {
  target?: Window;
  targetOrigin?: string;
  requestTimeoutMs?: number;
}

export interface BenchLocalWebClient {
  capabilities(): Promise<BenchLocalWebCapabilities>;
  environment: {
    isEmbedded: boolean;
    detect(options?: BenchLocalWebEnvironmentDetectOptions): Promise<BenchLocalWebEnvironmentInfo>;
    isInsideBenchLocal(options?: BenchLocalWebEnvironmentDetectOptions): Promise<boolean>;
  };
  models: {
    list(): Promise<BenchLocalWebModelList>;
    getSelected(): Promise<BenchLocalWebSelectedModels>;
    onChanged(callback: (event: BenchLocalWebModelChangeEvent) => void): () => void;
  };
  inference: {
    chat(request: BenchLocalChatRequest): Promise<BenchLocalChatResponse>;
    streamChat(request: BenchLocalChatRequest): AsyncIterable<BenchLocalChatStreamEvent>;
  };
  runs: {
    startState(input?: BenchLocalWebRunStateInput): Promise<BenchLocalWebRunProgressResult>;
    stopState(input?: BenchLocalWebRunStateInput): Promise<BenchLocalWebRunProgressResult>;
    updateProgress(input: BenchLocalWebRunProgressInput): Promise<BenchLocalWebRunProgressResult>;
    onStopRequested(callback: (event: BenchLocalWebRunStopRequestedEvent) => void): () => void;
  };
  history: {
    load<TMetadata extends Record<string, unknown> = Record<string, unknown>>(): Promise<BenchLocalWebHistoryLoadResult<TMetadata>>;
    save(input: BenchLocalWebHistorySaveInput): Promise<BenchLocalWebRunProgressResult>;
    writeArtifact(input: BenchLocalWebArtifactWriteInput): Promise<BenchLocalWebArtifactWriteResult>;
  };
}

function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `benchlocal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function isHostResponseMessage(value: unknown): value is BenchLocalWebHostResponseMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<BenchLocalWebHostResponseMessage>;
  return (
    candidate.source === BENCHLOCAL_WEB_HOST_MESSAGE_SOURCE &&
    candidate.bridgeVersion === BENCHLOCAL_WEB_BRIDGE_VERSION &&
    typeof candidate.requestId === "string" &&
    typeof candidate.ok === "boolean"
  );
}

function isHostStreamMessage(value: unknown): value is BenchLocalWebHostStreamMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<BenchLocalWebHostStreamMessage>;
  return (
    candidate.source === BENCHLOCAL_WEB_HOST_MESSAGE_SOURCE &&
    candidate.bridgeVersion === BENCHLOCAL_WEB_BRIDGE_VERSION &&
    typeof candidate.streamId === "string" &&
    "event" in candidate
  );
}

function isHostEventMessage(value: unknown): value is {
  source: typeof BENCHLOCAL_WEB_HOST_MESSAGE_SOURCE;
  bridgeVersion: typeof BENCHLOCAL_WEB_BRIDGE_VERSION;
  event: string;
  payload?: unknown;
} {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as {
    source?: unknown;
    bridgeVersion?: unknown;
    event?: unknown;
  };
  return (
    candidate.source === BENCHLOCAL_WEB_HOST_MESSAGE_SOURCE &&
    candidate.bridgeVersion === BENCHLOCAL_WEB_BRIDGE_VERSION &&
    typeof candidate.event === "string"
  );
}

type AsyncQueue<TValue> = AsyncIterable<TValue> & {
  push(value: TValue): void;
  fail(error: unknown): void;
  end(): void;
};

function createAsyncQueue<TValue>(): AsyncQueue<TValue> {
  const values: TValue[] = [];
  const waiters: Array<{
    resolve: (value: IteratorResult<TValue>) => void;
    reject: (error: unknown) => void;
  }> = [];
  let closed = false;
  let failure: unknown;

  const settle = () => {
    while (waiters.length > 0 && (values.length > 0 || closed || failure)) {
      const waiter = waiters.shift();
      if (!waiter) {
        continue;
      }

      if (failure) {
        waiter.reject(failure);
      } else if (values.length > 0) {
        waiter.resolve({ value: values.shift() as TValue, done: false });
      } else {
        waiter.resolve({ value: undefined, done: true });
      }
    }
  };

  return {
    push(value) {
      if (closed || failure) {
        return;
      }

      values.push(value);
      settle();
    },
    fail(error) {
      if (closed || failure) {
        return;
      }

      failure = error;
      settle();
    },
    end() {
      if (closed) {
        return;
      }

      closed = true;
      settle();
    },
    [Symbol.asyncIterator]() {
      return {
        next() {
          if (failure) {
            return Promise.reject(failure);
          }

          if (values.length > 0) {
            return Promise.resolve({ value: values.shift() as TValue, done: false });
          }

          if (closed) {
            return Promise.resolve({ value: undefined, done: true });
          }

          return new Promise<IteratorResult<TValue>>((resolve, reject) => {
            waiters.push({ resolve, reject });
          });
        }
      };
    }
  };
}

export function createBenchLocalClient(options: BenchLocalWebClientOptions = {}): BenchLocalWebClient {
  const hostWindow = options.target ?? window.parent;
  const targetOrigin = options.targetOrigin ?? "*";
  const requestTimeoutMs = options.requestTimeoutMs ?? 30000;

  const request = async <TResult, TPayload = unknown>(
    method: BenchLocalWebBridgeMethod,
    payload?: TPayload,
    requestOptions?: { streamId?: string; timeoutMs?: number }
  ): Promise<TResult> => {
    const requestId = createRequestId();
    const timeoutMs = requestOptions?.timeoutMs ?? requestTimeoutMs;

    return new Promise<TResult>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(new Error(`BenchLocal bridge request timed out: ${method}.`));
      }, timeoutMs);

      const onMessage = (event: MessageEvent<unknown>) => {
        if (!isHostResponseMessage(event.data) || event.data.requestId !== requestId) {
          return;
        }

        window.clearTimeout(timeout);
        window.removeEventListener("message", onMessage);

        if (event.data.ok) {
          resolve(event.data.result as TResult);
          return;
        }

        reject(Object.assign(new Error(event.data.error.message), {
          code: event.data.error.code,
          retryable: event.data.error.retryable
        }));
      };

      window.addEventListener("message", onMessage);
      hostWindow.postMessage(
        {
          source: BENCHLOCAL_WEB_PACK_MESSAGE_SOURCE,
          bridgeVersion: BENCHLOCAL_WEB_BRIDGE_VERSION,
          requestId,
          streamId: requestOptions?.streamId,
          method,
          payload
        } satisfies BenchLocalWebPackRequestMessage<TPayload>,
        targetOrigin
      );
    });
  };

  const streamChat = (input: BenchLocalChatRequest): AsyncIterable<BenchLocalChatStreamEvent> => {
    const streamId = createRequestId();
    const queue = createAsyncQueue<BenchLocalChatStreamEvent>();

    const onMessage = (event: MessageEvent<unknown>) => {
      if (!isHostStreamMessage(event.data) || event.data.streamId !== streamId) {
        return;
      }

      queue.push(event.data.event as BenchLocalChatStreamEvent);

      if (event.data.done) {
        window.removeEventListener("message", onMessage);
        queue.end();
      }
    };

    window.addEventListener("message", onMessage);
    void request<{ accepted: true }, BenchLocalChatRequest>("inference.streamChat", input, { streamId }).catch((error) => {
      window.removeEventListener("message", onMessage);
      queue.fail(error);
    });

    return queue;
  };

  const onModelsChanged = (callback: (event: BenchLocalWebModelChangeEvent) => void): (() => void) => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (!isHostEventMessage(event.data) || event.data.event !== "models.changed") {
        return;
      }

      callback((event.data.payload ?? { models: [] }) as BenchLocalWebModelChangeEvent);
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  };

  const onStopRequested = (callback: (event: BenchLocalWebRunStopRequestedEvent) => void): (() => void) => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (!isHostEventMessage(event.data) || event.data.event !== "runs.stopRequested") {
        return;
      }

      callback((event.data.payload ?? { requestedAt: new Date().toISOString() }) as BenchLocalWebRunStopRequestedEvent);
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  };

  const isEmbedded = hostWindow !== window;

  const detectEnvironment = async (
    input: BenchLocalWebEnvironmentDetectOptions = {}
  ): Promise<BenchLocalWebEnvironmentInfo> => {
    if (!isEmbedded) {
      return {
        isEmbedded: false,
        isInsideBenchLocal: false,
        bridgeAvailable: false,
        reason: "top-level"
      };
    }

    try {
      const capabilities = await request<BenchLocalWebCapabilities>("capabilities", undefined, {
        timeoutMs: input.timeoutMs ?? 750
      });

      return {
        isEmbedded,
        isInsideBenchLocal: true,
        bridgeAvailable: true,
        bridgeVersion: capabilities.bridgeVersion,
        capabilities
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        isEmbedded,
        isInsideBenchLocal: false,
        bridgeAvailable: false,
        reason: message.includes("timed out") ? "timeout" : "error",
        error: message
      };
    }
  };

  return {
    capabilities: () => request("capabilities"),
    environment: {
      isEmbedded,
      detect: detectEnvironment,
      isInsideBenchLocal: async (input) => (await detectEnvironment(input)).isInsideBenchLocal
    },
    models: {
      list: () => request("models.list"),
      getSelected: () => request("models.getSelected"),
      onChanged: onModelsChanged
    },
    inference: {
      chat: (input) => request("inference.chat", input),
      streamChat
    },
    runs: {
      startState: (input) => request("runs.startState", input),
      stopState: (input) => request("runs.stopState", input),
      updateProgress: (input) => request("runs.updateProgress", input),
      onStopRequested
    },
    history: {
      load: () => request("history.load"),
      save: (input) => request("history.save", input),
      writeArtifact: (input) => request("history.writeArtifact", input)
    }
  };
}
