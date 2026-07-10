import { useEffect, useState } from "react";
import { CircleAlert, Copy, Logs, RotateCcw, Save, Server } from "lucide-react";
import type { BenchLocalAgentAccess } from "@core";
import type { BenchLocalAgentAccessState } from "@/shared/desktop-api";
import { Field, FieldToggle, Panel } from "../../shared/components/settings-primitives";

export function AgentAccessView({
  state,
  onConfigure,
  onRegenerateToken
}: {
  state: BenchLocalAgentAccessState | null;
  onConfigure: (input: { enabled: boolean; access?: BenchLocalAgentAccess; port?: number }) => void;
  onRegenerateToken: () => void;
}) {
  const [enabledDraft, setEnabledDraft] = useState(state?.enabled ?? false);
  const [accessDraft, setAccessDraft] = useState<BenchLocalAgentAccess>(state?.access ?? "localhost");
  const [portDraft, setPortDraft] = useState(state?.configuredPort ? String(state.configuredPort) : "");

  useEffect(() => {
    setEnabledDraft(state?.enabled ?? false);
    setAccessDraft(state?.access ?? "localhost");
    setPortDraft(state?.configuredPort ? String(state.configuredPort) : "");
  }, [state?.enabled, state?.access, state?.configuredPort]);

  const apply = () => {
    const normalizedPort = portDraft.trim() ? Number(portDraft.trim()) : undefined;
    onConfigure({
      enabled: enabledDraft,
      access: accessDraft,
      ...(Number.isFinite(normalizedPort) && normalizedPort ? { port: normalizedPort } : {})
    });
  };

  const copyText = (value?: string) => {
    if (!value || typeof navigator === "undefined") {
      return;
    }

    void navigator.clipboard?.writeText(value);
  };
  const agentGuideUrl = state?.baseUrl ? `${state.baseUrl}/v1/agent-guide` : "";
  const openApiUrl = state?.baseUrl ? `${state.baseUrl}/v1/openapi.json` : "";
  const mcpUrl = state?.baseUrl ? `${state.baseUrl}/mcp` : "";
  const httpEndpoints = [
    ["POST", "/mcp"],
    ["GET", "/v1/health"],
    ["GET", "/v1/agent-guide"],
    ["GET", "/v1/openapi.json"],
    ["GET", "/v1/events"],
    ["GET", "/v1/benchpacks"],
    ["GET", "/v1/providers"],
    ["POST", "/v1/providers"],
    ["PATCH", "/v1/providers/:providerId"],
    ["DELETE", "/v1/providers/:providerId"],
    ["GET", "/v1/models"],
    ["POST", "/v1/models"],
    ["PATCH", "/v1/models/:modelId"],
    ["DELETE", "/v1/models/:modelId"],
    ["POST", "/v1/tabs/:tabId/models/availability/refresh"],
    ["POST", "/v1/tabs/:tabId/sampling"],
    ["POST", "/v1/tabs/:tabId/execution-mode"],
    ["POST", "/v1/tabs/:tabId/runs"],
    ["POST", "/v1/tabs/:tabId/runs/:runId/resume"],
    ["POST", "/v1/tabs/:tabId/runs/:runId/retry-provider-errors"],
    ["POST", "/v1/tabs/:tabId/runs/:runId/retry-failed-results"]
  ] as const;

  return (
    <section className="advanced-grid">
      <Panel title="Agent Access" subtitle="Local API and event stream for AI agents." tone="sky" icon={<Server size={16} />}>
        <div className="agent-experimental-message">
          <CircleAlert size={15} />
          <span>
            This feature is in experimental/preview stage. Feel free to report bugs.
          </span>
        </div>

        <div className="agent-access-status-row">
          <span className={`status-chip ${state?.running ? "status-ready" : "status-inactive"}`}>
            {state?.running ? "running" : state?.enabled ? "stopped" : "disabled"}
          </span>
          {state?.baseUrl ? <span className="settings-row-secondary settings-mono-cell">{state.baseUrl}</span> : null}
          {state ? <span className="status-chip status-idle">{state.access === "local_network" ? "local network" : "localhost"}</span> : null}
          {state ? <span className="status-chip status-idle">{state.connectedClients} clients</span> : null}
        </div>

        <div className="entry-grid two-col">
          <label className="field-block">
            <span className="field-label">Access</span>
            <select
              className="config-input"
              value={accessDraft}
              onChange={(event) => setAccessDraft(event.target.value as BenchLocalAgentAccess)}
            >
              <option value="localhost">Localhost only</option>
              <option value="local_network">Local network</option>
            </select>
          </label>
          <FieldToggle label="Local Agent API" checked={enabledDraft} onChange={setEnabledDraft} />
        </div>

        <div className="entry-grid two-col">
          <Field
            label="Port"
            value={portDraft}
            placeholder="Auto"
            type="number"
            onChange={setPortDraft}
          />
        </div>

        <div className="agent-field-row agent-field-row-token">
          <Field label="Bearer Token" value={state?.token ?? ""} readOnly onChange={() => undefined} />
          <button type="button" className="ghost-button ghost-button-compact" onClick={() => copyText(state?.token)} disabled={!state?.token}>
            <Copy size={14} />
            Copy
          </button>
          <button type="button" className="ghost-button ghost-button-compact" onClick={onRegenerateToken}>
            <RotateCcw size={14} />
            Regenerate
          </button>
        </div>

        <div className="agent-field-row">
          <Field label="Agent Guide URL" value={agentGuideUrl} readOnly onChange={() => undefined} />
          <button type="button" className="ghost-button ghost-button-compact" onClick={() => copyText(agentGuideUrl)} disabled={!agentGuideUrl}>
            <Copy size={14} />
            Copy
          </button>
        </div>

        <div className="agent-field-row">
          <Field label="OpenAPI URL" value={openApiUrl} readOnly onChange={() => undefined} />
          <button type="button" className="ghost-button ghost-button-compact" onClick={() => copyText(openApiUrl)} disabled={!openApiUrl}>
            <Copy size={14} />
            Copy
          </button>
        </div>

        <div className="agent-field-row">
          <Field label="MCP URL" value={mcpUrl} readOnly onChange={() => undefined} />
          <button type="button" className="ghost-button ghost-button-compact" onClick={() => copyText(mcpUrl)} disabled={!mcpUrl}>
            <Copy size={14} />
            Copy
          </button>
        </div>

        {state?.message ? (
          <div className="helper-copy helper-copy-compact">
            <p>{state.message}</p>
          </div>
        ) : null}

        <div className="settings-actions">
          <button type="button" className="primary-button" onClick={apply}>
            <Save size={14} />
            Save Setting
          </button>
        </div>
      </Panel>

      <Panel title="HTTP Surface" subtitle="Commands use JSON or MCP; live progress uses Server-Sent Events." tone="slate" icon={<Logs size={16} />}>
        <div className="agent-endpoint-list">
          {httpEndpoints.map(([method, path]) => (
            <div key={`${method}-${path}`} className="agent-endpoint-row">
              <span className={`agent-endpoint-method method-${method.toLowerCase()}`}>{method}</span>
              <span className="agent-endpoint-path">{path}</span>
            </div>
          ))}
        </div>
      </Panel>
    </section>
  );
}
