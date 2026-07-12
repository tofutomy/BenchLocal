// provider HTTP 错误分类与 fetch 捕获：拦截全局 fetch，记录 provider 请求错误，区分可重试/不可重试状态码。
import { AsyncLocalStorage } from "node:async_hooks";
import { Agent, setGlobalDispatcher } from "undici";

export type CapturedProviderHttpError = {
  status: number;
  responseBlank: boolean;
};

type ProviderFetchCaptureContext = {
  providerBaseUrls: string[];
  providerHttpErrors: CapturedProviderHttpError[];
};

const providerFetchCaptureContext = new AsyncLocalStorage<ProviderFetchCaptureContext>();
let providerFetchCaptureInstalled = false;

// Bench Pack 可能使用全局 fetch；provider 边界统一保留长请求超时策略。
setGlobalDispatcher(new Agent({ bodyTimeout: 0, headersTimeout: 0 }));

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown provider error.";
}

export function isRetryableProviderHttpStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || (status >= 500 && status <= 599);
}

export function isProviderHttpErrorStatus(status: number): boolean {
  return status >= 400 && status <= 599;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getFetchRequestUrl(input: Parameters<typeof fetch>[0]): string | undefined {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.href;
  }

  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.url;
  }

  return undefined;
}

function normalizeUrlPrefix(value: string): string | undefined {
  try {
    const url = new URL(value.endsWith("/") ? value : `${value}/`);
    return url.href;
  } catch {
    return undefined;
  }
}

function isProviderFetchRequest(input: Parameters<typeof fetch>[0], providerBaseUrls: string[]): boolean {
  const requestUrl = getFetchRequestUrl(input);

  if (!requestUrl) {
    return false;
  }

  const normalizedRequestUrl = normalizeUrlPrefix(requestUrl);

  if (!normalizedRequestUrl) {
    return false;
  }

  return providerBaseUrls.some((providerBaseUrl) => {
    const normalizedProviderUrl = normalizeUrlPrefix(providerBaseUrl);
    return normalizedProviderUrl ? normalizedRequestUrl.startsWith(normalizedProviderUrl) : false;
  });
}

function createBlankProviderHttpStatusError(response: Response): Error {
  const error = new Error(`Provider returned HTTP status ${response.status} with a blank response.`);
  const headers = {
    "content-length": response.headers.get("content-length") ?? "0"
  };

  Object.assign(error, {
    status: response.status,
    response: {
      status: response.status,
      statusCode: response.status,
      body: "",
      headers
    }
  });

  return error;
}

function captureProviderHttpError(response: Response, responseBlank: boolean): void {
  if (!isProviderHttpErrorStatus(response.status)) {
    return;
  }

  providerFetchCaptureContext.getStore()?.providerHttpErrors.push({
    status: response.status,
    responseBlank
  });
}

function throwIfBlankRetryableProviderResponse(response: Response, payload: string | ArrayBuffer): void {
  const blankPayload = typeof payload === "string"
    ? payload.trim().length === 0
    : payload.byteLength === 0;

  if (blankPayload) {
    captureProviderHttpError(response, true);
  }

  if (blankPayload && isRetryableProviderHttpStatus(response.status)) {
    throw createBlankProviderHttpStatusError(response);
  }
}

function wrapProviderHttpResponse(response: Response): Response {
  const readText = response.text.bind(response);
  const readArrayBuffer = response.arrayBuffer.bind(response);
  const cloneResponse = response.clone.bind(response);

  Object.defineProperties(response, {
    clone: {
      value: () => wrapProviderHttpResponse(cloneResponse())
    },
    text: {
      value: async () => {
        const text = await readText();
        throwIfBlankRetryableProviderResponse(response, text);
        return text;
      }
    },
    json: {
      value: async () => {
        const text = await response.text();
        return JSON.parse(text) as unknown;
      }
    },
    arrayBuffer: {
      value: async () => {
        const buffer = await readArrayBuffer();
        throwIfBlankRetryableProviderResponse(response, buffer);
        return buffer;
      }
    }
  });

  return response;
}

function installProviderFetchCapture(): void {
  if (providerFetchCaptureInstalled) {
    return;
  }

  const nativeFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = (async (input, init) => {
    const response = await nativeFetch(input, init);
    const context = providerFetchCaptureContext.getStore();

    if (!context || !isProviderFetchRequest(input, context.providerBaseUrls) || !isProviderHttpErrorStatus(response.status)) {
      return response;
    }

    captureProviderHttpError(response, hasBlankContentLength(response));

    return wrapProviderHttpResponse(response);
  }) as typeof fetch;
  providerFetchCaptureInstalled = true;
}

export async function captureProviderFetchErrors<T>(
  providerBaseUrl: string | undefined,
  operation: () => Promise<T>
): Promise<{ result: T; providerHttpError?: CapturedProviderHttpError }> {
  if (!providerBaseUrl) {
    return { result: await operation() };
  }

  installProviderFetchCapture();
  const context: ProviderFetchCaptureContext = {
    providerBaseUrls: [providerBaseUrl],
    providerHttpErrors: []
  };
  const result = await providerFetchCaptureContext.run(context, operation);

  return {
    result,
    providerHttpError: context.providerHttpErrors.at(-1)
  };
}

export function toHttpStatusCode(value: unknown): number | undefined {
  const status = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d{3}$/.test(value.trim())
      ? Number(value)
      : undefined;

  return status !== undefined && Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined;
}

function getStructuredHttpStatusCode(value: unknown, depth = 0): number | undefined {
  if (!isRecord(value) || depth > 2) {
    return undefined;
  }

  const directStatus = toHttpStatusCode(value.status ?? value.statusCode);
  if (directStatus !== undefined) {
    return directStatus;
  }

  return getStructuredHttpStatusCode(value.response, depth + 1) ?? getStructuredHttpStatusCode(value.cause, depth + 1);
}

function isBlankPayloadValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }

  if (typeof value === "string") {
    return value.trim().length === 0;
  }

  if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
    return value.byteLength === 0;
  }

  return false;
}

function hasNonBlankResponsePayload(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return ["body", "responseBody", "data", "error"].some((key) => key in value && !isBlankPayloadValue(value[key]));
}

function hasResponsePayloadMarker(value: unknown): boolean {
  return isRecord(value) && ["body", "responseBody", "data", "error"].some((key) => key in value);
}

function getHeaderValue(headers: unknown, name: string): string | undefined {
  if (!headers) {
    return undefined;
  }

  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }

  if (isRecord(headers)) {
    const directValue = headers[name] ?? headers[name.toLowerCase()];
    return typeof directValue === "string" ? directValue : undefined;
  }

  if (typeof (headers as { get?: unknown }).get === "function") {
    const value = (headers as { get: (headerName: string) => unknown }).get(name);
    return typeof value === "string" ? value : undefined;
  }

  return undefined;
}

function hasBlankContentLength(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const contentLength = getHeaderValue(value.headers, "content-length");
  return contentLength?.trim() === "0";
}

function hasBlankProviderResponse(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const response = value.response;

  if (hasNonBlankResponsePayload(value) || hasNonBlankResponsePayload(response)) {
    return false;
  }

  return hasResponsePayloadMarker(value) ||
    hasResponsePayloadMarker(response) ||
    hasBlankContentLength(value) ||
    hasBlankContentLength(response);
}

export function getProviderHttpErrorFromError(error: unknown): CapturedProviderHttpError | undefined {
  const status = getStructuredHttpStatusCode(error);

  if (status === undefined || !isProviderHttpErrorStatus(status)) {
    return undefined;
  }

  return {
    status,
    responseBlank: hasBlankProviderResponse(error)
  };
}


