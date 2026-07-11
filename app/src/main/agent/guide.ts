// Markdown Guide 保持为纯函数，HTTP 与 MCP resource 共享同一份内容。
export function createAgentGuide(port?: number): string {
    const host = "127.0.0.1";
    const baseUrl = port ? `http://${host}:${port}` : `http://${host}:<port>`;

    return `# BenchLocal Agent API

BenchLocal exposes local HTTP JSON commands plus Server-Sent Events for live progress.
It also exposes an MCP Streamable HTTP endpoint for agents that prefer standard tool calls.

Base URL: \`${baseUrl}\`
MCP URL: \`${baseUrl}/mcp\`

Authentication:

\`\`\`http
Authorization: Bearer <token>
\`\`\`

The token is shown in BenchLocal Settings > Agent Access. All endpoints except \`GET /v1/health\` require this bearer token.
Provider, model, Bench Pack, tab, and run IDs used in path segments must be URL-encoded. This matters for model IDs such as \`provider:Qwen/Qwen3.5-9B\`.
When Agent Access is set to Local Network, BenchLocal listens on \`0.0.0.0\`; agents on other devices should use this machine's LAN IP address with the same port and bearer token.

## MCP Endpoint

Use \`POST /mcp\` as a Streamable HTTP MCP endpoint with the same bearer token. BenchLocal exposes:

- Resources for guide, OpenAPI, config, workspace, Bench Packs, providers, models, active runs, and recent events.
- Tools named with the \`benchlocal_\` prefix for provider/model CRUD, tab setup, model availability, run start/resume/stop/retry, history reads, and verifier reads.
- Prompt \`benchlocal-run-benchpack\` for the recommended run workflow.

This MCP server is stateless. Long-running run tools return \`accepted: true\`; inspect the UI, call \`benchlocal_get_recent_events\`, or read \`benchlocal://state/events/recent\` for progress.

## Recommended Agent Workflow

1. Call \`GET /v1/health\`.
2. Call \`GET /v1/workspaces\` to find the active workspace and tabs.
3. Call \`GET /v1/benchpacks\`, \`GET /v1/providers\`, and \`GET /v1/models\`.
4. Open \`GET /v1/events\` as an SSE stream and keep it open.
5. Create or update a tab:
   - \`POST /v1/workspaces/:workspaceId/tabs\`
   - \`POST /v1/tabs/:tabId/select-benchpack\`
   - \`POST /v1/tabs/:tabId/select-models\`
6. Refresh model status with \`POST /v1/models/availability/refresh\`.
7. Tune tab run controls when needed:
   - \`POST /v1/tabs/:tabId/sampling\`
   - \`POST /v1/tabs/:tabId/execution-mode\`
   - \`POST /v1/tabs/:tabId/runs-per-test\`
8. Start, resume, stop, or retry runs:
   - \`POST /v1/tabs/:tabId/runs\`
   - \`POST /v1/tabs/:tabId/runs/:runId/resume\`
   - \`POST /v1/tabs/:tabId/runs/:runId/retry-provider-errors\`
   - \`POST /v1/tabs/:tabId/runs/:runId/retry-failed-results\`
   - \`POST /v1/tabs/:tabId/runs/stop\`
9. Watch \`benchpack.run.event\` SSE events until \`run_finished\` or \`run_error\`.

## Model Server Coordination

BenchLocal does not run arbitrary shell commands. Start and stop local model servers outside BenchLocal, then use model availability and run/resume endpoints to coordinate work.

## Important Events

- \`workspace.updated\`
- \`config.updated\`
- \`models.availability.updated\`
- \`benchpack.run.started\`
- \`benchpack.run.event\`
- \`benchpack.run.finished\`
- \`benchpack.run.error\`
- \`verifier.event\`

Every SSE event has this shape:

\`\`\`json
{
  "eventId": "evt-...",
  "createdAt": "2026-05-18T00:00:00.000Z",
  "type": "benchpack.run.event",
  "payload": {}
}
\`\`\`

## Core Endpoints

Read state:

- \`GET /v1/config\` returns redacted config.
- \`GET /v1/workspaces\` returns workspace and tab state.
- \`GET /v1/benchpacks\` returns installed Bench Packs.
- \`GET /v1/providers\` returns configured providers with secrets redacted.
- \`GET /v1/models\` returns configured models.
- \`GET /v1/models/availability\` checks model availability.
- \`GET /v1/runs/active\` returns active runs.
- \`GET /v1/benchpacks/:benchPackId/history\` returns run history.
- \`GET /v1/benchpacks/:benchPackId/history/:runId\` returns a run summary.
- \`GET /v1/verifiers\` returns verifier runtime status.

Mutate workspace:

- \`POST /v1/workspaces/:workspaceId/tabs\`
- \`PATCH /v1/tabs/:tabId\`
- \`POST /v1/tabs/:tabId/select-benchpack\`
- \`POST /v1/tabs/:tabId/select-models\`
- \`POST /v1/tabs/:tabId/sampling\`
- \`POST /v1/tabs/:tabId/execution-mode\`
- \`POST /v1/tabs/:tabId/runs-per-test\`
- \`POST /v1/tabs/:tabId/models/availability/refresh\`

Mutate providers and models:

- \`POST /v1/providers\`
- \`GET /v1/providers/:providerId\`
- \`PATCH /v1/providers/:providerId\`
- \`DELETE /v1/providers/:providerId\`
- \`POST /v1/providers/:providerId/duplicate\`
- \`GET /v1/providers/:providerId/models/discover\`
- \`POST /v1/models\`
- \`GET /v1/models/:modelId\`
- \`PATCH /v1/models/:modelId\`
- \`DELETE /v1/models/:modelId\`
- \`POST /v1/models/:modelId/duplicate\`

Run benchmarks:

- \`POST /v1/tabs/:tabId/runs\`
- \`POST /v1/tabs/:tabId/runs/:runId/resume\`
- \`POST /v1/tabs/:tabId/runs/:runId/retry-scenario\`
- \`POST /v1/tabs/:tabId/runs/:runId/retry-provider-errors\`
- \`POST /v1/tabs/:tabId/runs/:runId/retry-failed-results\`
- \`POST /v1/tabs/:tabId/runs/stop\`

Discovery:

- \`GET /v1/agent-guide\`
- \`GET /v1/openapi.json\`
- \`POST /mcp\`

## Request Examples

Create a tab:

\`\`\`json
{
  "benchPackId": "toolcall-15",
  "title": "ToolCall-15",
  "modelSelections": [{ "modelId": "ollama:qwen3.5:9b" }]
}
\`\`\`

Select models:

\`\`\`json
{
  "modelIds": ["ollama:qwen3.5:9b"]
}
\`\`\`

Start a run:

\`\`\`json
{
  "executionMode": "serial_by_model",
  "runsPerTest": 1
}
\`\`\`

Refresh selected models:

\`\`\`json
{
  "modelIds": ["ollama:qwen3.5:9b"]
}
\`\`\`
`;
}
