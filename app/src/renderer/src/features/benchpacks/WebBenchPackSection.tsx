import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, CircleAlert, RotateCcw, SlidersHorizontal, Square } from "lucide-react";
import type {
  ArtifactRef,
  BenchLocalChatRequest,
  BenchLocalChatStreamEvent,
  BenchLocalModelConfig,
  BenchLocalProviderConfig,
  BenchLocalWorkspaceTab,
  BenchPackInspection,
  BenchPackRunSummary,
  ModelAvailability,
  WebBenchPackHistoryPayload
} from "@core";
import type { ModelAvailabilityView } from "../models/model-availability";

const BENCHLOCAL_WEB_BRIDGE_VERSION = 1 as const;
const BENCHLOCAL_WEB_PACK_MESSAGE_SOURCE = "benchlocal-web-pack" as const;
const BENCHLOCAL_WEB_HOST_MESSAGE_SOURCE = "benchlocal-host" as const;

type WebBridgeMethod =
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

type WebPackBridgeRequest = {
  source: typeof BENCHLOCAL_WEB_PACK_MESSAGE_SOURCE;
  bridgeVersion: typeof BENCHLOCAL_WEB_BRIDGE_VERSION;
  requestId: string;
  streamId?: string;
  method: WebBridgeMethod;
  payload?: unknown;
};

type ResolvedWebBenchPackModel = BenchLocalModelConfig & {
  displayLabel: string;
  alias?: string;
};

type LoadedWebBenchPackHistoryEntry = {
  runId: string;
  startedAt: string;
  mode?: "history" | "replay";
};

function isWebPackBridgeRequest(value: unknown): value is WebPackBridgeRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<WebPackBridgeRequest>;
  return (
    candidate.source === BENCHLOCAL_WEB_PACK_MESSAGE_SOURCE &&
    candidate.bridgeVersion === BENCHLOCAL_WEB_BRIDGE_VERSION &&
    typeof candidate.requestId === "string" &&
    typeof candidate.method === "string"
  );
}

function getOriginFromUrl(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function WebBenchPackSection({
  tab,
  inspection,
  selectedModels,
  providers,
  modelAvailabilityById,
  checkingModelAvailability,
  runSummary,
  loadedHistory,
  isRunning,
  isStopping,
  onStartState,
  onStopState,
  onRequestStop,
  onEditModels,
  onEditSampling,
  onHistorySaved,
  onClearHistory,
  getProviderDisplayName,
  getModelAvailabilityView
}: {
  tab: BenchLocalWorkspaceTab;
  inspection: BenchPackInspection;
  selectedModels: ResolvedWebBenchPackModel[];
  providers: Record<string, BenchLocalProviderConfig>;
  modelAvailabilityById: Record<string, ModelAvailability>;
  checkingModelAvailability: Record<string, true>;
  runSummary: BenchPackRunSummary | null;
  loadedHistory: LoadedWebBenchPackHistoryEntry | null;
  isRunning: boolean;
  isStopping: boolean;
  onStartState: () => void;
  onStopState: () => void;
  onRequestStop: () => void;
  onEditModels: () => void;
  onEditSampling: () => void;
  onHistorySaved: (summary: BenchPackRunSummary) => void;
  onClearHistory: () => void;
  getProviderDisplayName: (providers: Record<string, BenchLocalProviderConfig>, providerId: string) => string;
  getModelAvailabilityView: (
    model: ResolvedWebBenchPackModel,
    modelAvailabilityById: Record<string, ModelAvailability>,
    checkingModelAvailability: Record<string, true>
  ) => ModelAvailabilityView;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const liveRunIdRef = useRef<string | null>(null);
  const [bridgeTargetOrigin, setBridgeTargetOrigin] = useState<string | null>(null);
  const manifest = inspection.manifest;
  const entryUrl = manifest?.entry ?? "";
  const frameKey = `${inspection.id}-${loadedHistory?.runId ?? "live"}-${entryUrl}`;
  const entryOrigin = getOriginFromUrl(entryUrl);
  const allowedOrigins = useMemo(
    () => new Set([entryOrigin, ...(manifest?.web?.allowedOrigins ?? [])].filter((origin): origin is string => Boolean(origin))),
    [entryOrigin, manifest?.web?.allowedOrigins]
  );
  const permissions = useMemo(() => new Set<string>(manifest?.web?.permissions ?? []), [manifest?.web?.permissions]);
  const selectedModelIds = useMemo(() => selectedModels.map((model) => model.id), [selectedModels]);
  const bridgeModels = useMemo(
    () =>
      selectedModels.map(({ displayLabel, alias: _alias, ...model }) => ({
        ...model,
        providerId: model.provider,
        provider: getProviderDisplayName(providers, model.provider),
        label: displayLabel
      })),
    [getProviderDisplayName, providers, selectedModels]
  );
  const selectedModelAvailability = useMemo(
    () => selectedModels.map((model) => getModelAvailabilityView(model, modelAvailabilityById, checkingModelAvailability)),
    [checkingModelAvailability, getModelAvailabilityView, modelAvailabilityById, selectedModels]
  );

  const postHostEvent = useCallback((event: string, payload?: unknown): boolean => {
    const iframeWindow = iframeRef.current?.contentWindow;

    if (!iframeWindow || !bridgeTargetOrigin) {
      return false;
    }

    try {
      iframeWindow.postMessage(
        {
          source: BENCHLOCAL_WEB_HOST_MESSAGE_SOURCE,
          bridgeVersion: BENCHLOCAL_WEB_BRIDGE_VERSION,
          event,
          payload
        },
        bridgeTargetOrigin
      );
      return true;
    } catch (error) {
      console.warn(`Skipped Web Bench Pack host event "${event}" before the frame was ready.`, error);
      return false;
    }
  }, [bridgeTargetOrigin]);

  useEffect(() => {
    setBridgeTargetOrigin(null);
    liveRunIdRef.current = null;
  }, [frameKey]);

  useEffect(() => {
    if (!loadedHistory && runSummary?.runId) {
      liveRunIdRef.current = runSummary.runId;
    }
  }, [loadedHistory, runSummary?.runId]);

  useEffect(() => {
    if (!bridgeTargetOrigin) {
      return;
    }

    postHostEvent("models.changed", {
      models: bridgeModels,
      availability: selectedModelAvailability
    });
  }, [bridgeModels, bridgeTargetOrigin, postHostEvent, selectedModelAvailability]);

  const requestStop = () => {
    onRequestStop();
    postHostEvent("runs.stopRequested", {
      requestedAt: new Date().toISOString(),
      reason: "user"
    });
  };

  useEffect(() => {
    const iframeWindow = iframeRef.current?.contentWindow;

    if (!iframeWindow || !manifest || !entryUrl) {
      return;
    }

    const postResponse = (targetWindow: Window, targetOrigin: string, requestId: string, result: unknown, ok = true) => {
      targetWindow.postMessage(
        ok
          ? {
              source: BENCHLOCAL_WEB_HOST_MESSAGE_SOURCE,
              bridgeVersion: BENCHLOCAL_WEB_BRIDGE_VERSION,
              requestId,
              ok: true,
              result
            }
          : {
              source: BENCHLOCAL_WEB_HOST_MESSAGE_SOURCE,
              bridgeVersion: BENCHLOCAL_WEB_BRIDGE_VERSION,
              requestId,
              ok: false,
              error: {
                message: result instanceof Error ? result.message : String(result)
              }
            },
        targetOrigin
      );
    };

    const postStreamEvent = (
      targetWindow: Window,
      targetOrigin: string,
      streamId: string,
      event: BenchLocalChatStreamEvent,
      done?: boolean
    ) => {
      targetWindow.postMessage(
        {
          source: BENCHLOCAL_WEB_HOST_MESSAGE_SOURCE,
          bridgeVersion: BENCHLOCAL_WEB_BRIDGE_VERSION,
          streamId,
          event,
          done
        },
        targetOrigin
      );
    };

    const requirePermission = (permission: string) => {
      if (!permissions.has(permission)) {
        throw new Error(`Web Bench Pack permission denied: ${permission}.`);
      }
    };

    const handleMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== iframeWindow || !isWebPackBridgeRequest(event.data)) {
        return;
      }

      if (!allowedOrigins.has(event.origin)) {
        return;
      }

      const request = event.data;
      const targetWindow = event.source as Window;
      const targetOrigin = event.origin;
      setBridgeTargetOrigin((current) => (current === targetOrigin ? current : targetOrigin));

      void (async () => {
        switch (request.method) {
          case "capabilities":
            postResponse(targetWindow, targetOrigin, request.requestId, {
              bridgeVersion: BENCHLOCAL_WEB_BRIDGE_VERSION,
              permissions: Array.from(permissions),
              pack: {
                id: manifest.id,
                name: manifest.name,
                version: manifest.version,
                entry: manifest.entry,
                buildId: manifest.web?.buildId
              },
              history: {
                runId: runSummary?.runId,
                mode: loadedHistory ? "history" : "live",
                playback: manifest.web?.historyPlayback === true
              }
            });
            break;
          case "models.list":
            requirePermission("models:list");
            postResponse(targetWindow, targetOrigin, request.requestId, {
              models: bridgeModels,
              availability: selectedModelAvailability
            });
            break;
          case "models.getSelected":
            requirePermission("models:read");
            postResponse(targetWindow, targetOrigin, request.requestId, {
              models: bridgeModels,
              availability: selectedModelAvailability
            });
            break;
          case "inference.chat":
            requirePermission("inference:chat");
            postResponse(
              targetWindow,
              targetOrigin,
              request.requestId,
              await window.benchlocal.webPacks.chat(request.payload as BenchLocalChatRequest)
            );
            break;
          case "inference.streamChat": {
            requirePermission("inference:stream");
            if (!request.streamId) {
              throw new Error("Streaming inference requires a stream id.");
            }

            let unsubscribe: () => void = () => undefined;
            unsubscribe = window.benchlocal.webPacks.streamChat(
              {
                streamId: request.streamId,
                request: request.payload as BenchLocalChatRequest
              },
              (payload) => {
                postStreamEvent(targetWindow, targetOrigin, payload.streamId, payload.event, payload.done);

                if (payload.done) {
                  unsubscribe();
                }
              }
            );
            postResponse(targetWindow, targetOrigin, request.requestId, { accepted: true });
            break;
          }
          case "runs.startState":
            requirePermission("runs:write");
            onStartState();
            postResponse(targetWindow, targetOrigin, request.requestId, { accepted: true });
            break;
          case "runs.stopState":
            requirePermission("runs:write");
            onStopState();
            postResponse(targetWindow, targetOrigin, request.requestId, { accepted: true });
            break;
          case "runs.updateProgress": {
            requirePermission("runs:write");
            const payload = isRecord(request.payload) ? request.payload : {};
            const status = typeof payload.status === "string" ? payload.status as WebBenchPackHistoryPayload["status"] : "running";
            const summary = await window.benchlocal.webPacks.saveHistory({
              benchPackId: inspection.id,
              runId: loadedHistory ? runSummary?.runId ?? tab.loadedRunId : liveRunIdRef.current,
              modelIds: selectedModelIds,
              payload: {
                status,
                metadata: isRecord(payload.metadata) ? payload.metadata : undefined,
                events: [{
                  type: "progress",
                  createdAt: new Date().toISOString(),
                  payload
                }]
              }
            });
            liveRunIdRef.current = summary.runId;
            onHistorySaved(summary);
            postResponse(targetWindow, targetOrigin, request.requestId, { accepted: true, runId: summary.runId });
            break;
          }
          case "history.load":
            requirePermission("history:read");
            postResponse(targetWindow, targetOrigin, request.requestId, {
              runId: runSummary?.runId,
              payload: runSummary?.webHistory
            });
            break;
          case "history.save": {
            requirePermission("history:write");
            const summary = await window.benchlocal.webPacks.saveHistory({
              benchPackId: inspection.id,
              runId: loadedHistory ? runSummary?.runId ?? tab.loadedRunId : liveRunIdRef.current,
              modelIds: selectedModelIds,
              payload: request.payload as WebBenchPackHistoryPayload
            });
            liveRunIdRef.current = summary.runId;
            onHistorySaved(summary);
            postResponse(targetWindow, targetOrigin, request.requestId, { accepted: true, runId: summary.runId, summary });
            break;
          }
          case "history.writeArtifact": {
            requirePermission("artifacts:write");
            const artifactPayload = request.payload as {
              kind: string;
              label: string;
              path?: string;
              contentType?: string;
              content: unknown;
            };
            const result = await window.benchlocal.webPacks.writeArtifact({
              benchPackId: inspection.id,
              runId: loadedHistory ? runSummary?.runId ?? tab.loadedRunId : liveRunIdRef.current,
              modelIds: selectedModelIds,
              artifact: artifactPayload
            });
            liveRunIdRef.current = result.summary.runId;
            onHistorySaved(result.summary);
            postResponse(targetWindow, targetOrigin, request.requestId, result.artifact satisfies ArtifactRef);
            break;
          }
          default:
            throw new Error(`Unsupported Web Bench Pack bridge method: ${request.method}.`);
        }
      })().catch((error) => {
        postResponse(targetWindow, targetOrigin, request.requestId, error, false);
      });
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [
    allowedOrigins,
    bridgeModels,
    entryUrl,
    inspection.id,
    loadedHistory,
    manifest,
    onHistorySaved,
    onStartState,
    onStopState,
    permissions,
    runSummary,
    selectedModelAvailability,
    selectedModelIds,
    tab.loadedRunId
  ]);

  if (!manifest || !entryUrl) {
    return (
      <section className="web-benchpack-shell">
        <div className="empty-workspace benchmark-empty-state">
          <div className="empty-workspace-card benchmark-empty-card">
            <div className="benchmark-empty-icon"><CircleAlert size={18} /></div>
            <p className="eyebrow">Web Bench Pack</p>
            <h3 className="panel-title">This Web Bench Pack is missing its hosted entry.</h3>
            <p className="section-copy">Update or reinstall the Bench Pack from the registry.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="web-benchpack-shell">
      <div className="web-benchpack-toolbar">
        <div>
          <p className="eyebrow">Interactive Bench Pack</p>
          <h2>{manifest.name}</h2>
        </div>
        <div className="section-actions">
          {isRunning ? (
            <button type="button" className="button-warn" onClick={requestStop} disabled={isStopping}>
              <Square size={14} />
              {isStopping ? "Stopping..." : "Stop"}
            </button>
          ) : null}
          {loadedHistory ? (
            <button type="button" className="ghost-button" onClick={onClearHistory}>
              <RotateCcw size={14} />
              Back to Live
            </button>
          ) : null}
          <button type="button" className="ghost-button" onClick={onEditSampling}>
            <SlidersHorizontal size={14} />
            Samplings
          </button>
          <button type="button" className="ghost-button" onClick={onEditModels}>
            <Bot size={14} />
            Edit Models
          </button>
        </div>
      </div>
      <div className="web-benchpack-status-row">
        <span className="status-chip status-idle">{manifest.version}</span>
        <span className="status-chip status-idle">{selectedModels.length} selected model{selectedModels.length === 1 ? "" : "s"}</span>
        {runSummary?.runId ? <span className="status-chip status-idle">{runSummary.runId}</span> : null}
      </div>
      <iframe
        key={frameKey}
        ref={iframeRef}
        title={manifest.name}
        src={entryUrl}
        className="web-benchpack-frame"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
        referrerPolicy="no-referrer"
      />
    </section>
  );
}
