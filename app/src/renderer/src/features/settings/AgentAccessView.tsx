import { useEffect, useState } from "react";
import { CircleAlert, Copy, Logs, RotateCcw, Save, Server } from "lucide-react";
import type { BenchLocalAgentAccess } from "@core";
import type { BenchLocalAgentAccessState } from "@/shared/desktop-api";
import { Field, FieldToggle, Panel } from "../../shared/components/settings-primitives";
import { useI18n } from "../../shared/i18n";

export function AgentAccessView({
  state,
  onConfigure,
  onRegenerateToken
}: {
  state: BenchLocalAgentAccessState | null;
  onConfigure: (input: { enabled: boolean; access?: BenchLocalAgentAccess; port?: number }) => void;
  onRegenerateToken: () => void;
}) {
  const { t } = useI18n();
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
      <Panel title={t("settings.agent.title")} subtitle={t("settings.agent.subtitle")} tone="sky" icon={<Server size={16} />}>
        <div className="agent-experimental-message">
          <CircleAlert size={15} />
          <span>
            {t("settings.agent.experimental")}
          </span>
        </div>

        <div className="agent-access-status-row">
          <span className={`status-chip ${state?.running ? "status-ready" : "status-inactive"}`}>
            {state?.running ? t("common.running") : state?.enabled ? t("common.stopped") : t("common.disabled")}
          </span>
          {state?.baseUrl ? <span className="settings-row-secondary settings-mono-cell">{state.baseUrl}</span> : null}
          {state ? <span className="status-chip status-idle">{state.access === "local_network" ? t("settings.agent.localNetwork") : t("settings.agent.localhost")}</span> : null}
          {state ? <span className="status-chip status-idle">{state.connectedClients} {t("settings.agent.clients")}</span> : null}
        </div>

        <div className="entry-grid two-col">
          <label className="field-block">
            <span className="field-label">{t("settings.agent.access")}</span>
            <select
              className="config-input"
              value={accessDraft}
              onChange={(event) => setAccessDraft(event.target.value as BenchLocalAgentAccess)}
            >
              <option value="localhost">{t("settings.agent.localhost")}</option>
              <option value="local_network">{t("settings.agent.localNetwork")}</option>
            </select>
          </label>
          <FieldToggle label={t("settings.agent.localAgentApi")} checked={enabledDraft} onChange={setEnabledDraft} />
        </div>

        <div className="entry-grid two-col">
          <Field
            label={t("settings.agent.port")}
            value={portDraft}
            placeholder={t("settings.agent.portPlaceholder")}
            type="number"
            onChange={setPortDraft}
          />
        </div>

        <div className="agent-field-row agent-field-row-token">
          <Field label={t("settings.agent.bearerToken")} value={state?.token ?? ""} readOnly onChange={() => undefined} />
          <button type="button" className="ghost-button ghost-button-compact" onClick={() => copyText(state?.token)} disabled={!state?.token}>
            <Copy size={14} />
            {t("common.copy")}
          </button>
          <button type="button" className="ghost-button ghost-button-compact" onClick={onRegenerateToken}>
            <RotateCcw size={14} />
            Regenerate
          </button>
        </div>

        <div className="agent-field-row">
          <Field label={t("settings.agent.guide")} value={agentGuideUrl} readOnly onChange={() => undefined} />
          <button type="button" className="ghost-button ghost-button-compact" onClick={() => copyText(agentGuideUrl)} disabled={!agentGuideUrl}>
            <Copy size={14} />
            {t("common.copy")}
          </button>
        </div>

        <div className="agent-field-row">
          <Field label={t("settings.agent.openapi")} value={openApiUrl} readOnly onChange={() => undefined} />
          <button type="button" className="ghost-button ghost-button-compact" onClick={() => copyText(openApiUrl)} disabled={!openApiUrl}>
            <Copy size={14} />
            {t("common.copy")}
          </button>
        </div>

        <div className="agent-field-row">
          <Field label={t("settings.agent.mcpEndpoint")} value={mcpUrl} readOnly onChange={() => undefined} />
          <button type="button" className="ghost-button ghost-button-compact" onClick={() => copyText(mcpUrl)} disabled={!mcpUrl}>
            <Copy size={14} />
            {t("common.copy")}
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
            {t("common.save")}
          </button>
        </div>
      </Panel>

      <Panel title={t("settings.agent.httpEndpoints")} subtitle="Commands use JSON or MCP; live progress uses Server-Sent Events." tone="slate" icon={<Logs size={16} />}>
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
