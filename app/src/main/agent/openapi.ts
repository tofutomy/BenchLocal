// OpenAPI 文档生成保持为纯函数，便于后续逐步改为 capability registry 驱动。
export function createOpenApiDocument(port?: number) {
    const host = "127.0.0.1";
    const serverUrl = port ? `http://${host}:${port}` : `http://${host}`;
    const bearerSecurity = [{ bearerAuth: [] }];
    const jsonContent = (schema: Record<string, unknown>) => ({
      "application/json": {
        schema
      }
    });

    return {
      openapi: "3.1.0",
      info: {
        title: "BenchLocal Agent API",
        version: "1.0.0",
        description: "Local BenchLocal control API for agents. Commands use JSON HTTP; live progress uses Server-Sent Events."
      },
      servers: [{ url: serverUrl }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer"
          }
        },
        schemas: {
          ErrorResponse: {
            type: "object",
            properties: {
              error: {
                type: "object",
                properties: {
                  message: { type: "string" },
                  statusCode: { type: "number" }
                }
              }
            }
          }
        }
      },
      paths: {
        "/mcp": {
          post: {
            summary: "Handle MCP Streamable HTTP JSON-RPC requests.",
            description: "Standard MCP endpoint exposing BenchLocal resources, prompts, and benchlocal_* tools. Uses the same bearer token as the Agent API.",
            security: bearerSecurity,
            responses: {
              "200": { description: "MCP JSON-RPC response or event stream." }
            }
          }
        },
        "/v1/health": {
          get: {
            summary: "Check whether the local agent API is reachable.",
            security: [],
            responses: {
              "200": { description: "Health state" }
            }
          }
        },
        "/v1/agent-guide": {
          get: {
            summary: "Return agent-readable Markdown instructions.",
            security: bearerSecurity,
            responses: {
              "200": {
                description: "Markdown guide",
                content: {
                  "text/markdown": {
                    schema: { type: "string" }
                  }
                }
              }
            }
          }
        },
        "/v1/openapi.json": {
          get: {
            summary: "Return this OpenAPI document.",
            security: bearerSecurity,
            responses: {
              "200": { description: "OpenAPI document" }
            }
          }
        },
        "/v1/events": {
          get: {
            summary: "Subscribe to live BenchLocal events with Server-Sent Events.",
            security: bearerSecurity,
            responses: {
              "200": {
                description: "SSE stream",
                content: {
                  "text/event-stream": {
                    schema: { type: "string" }
                  }
                }
              }
            }
          }
        },
        "/v1/config": { get: { summary: "Return redacted BenchLocal config.", security: bearerSecurity, responses: { "200": { description: "Config" } } } },
        "/v1/workspaces": { get: { summary: "Return workspace state.", security: bearerSecurity, responses: { "200": { description: "Workspace state" } } } },
        "/v1/benchpacks": { get: { summary: "Return installed Bench Packs.", security: bearerSecurity, responses: { "200": { description: "Bench Packs" } } } },
        "/v1/benchpacks/registry": { get: { summary: "Return Bench Pack registry entries.", security: bearerSecurity, responses: { "200": { description: "Registry" } } } },
        "/v1/providers": {
          get: { summary: "Return configured providers with secrets redacted.", security: bearerSecurity, responses: { "200": { description: "Providers" } } },
          post: { summary: "Create a provider.", security: bearerSecurity, responses: { "201": { description: "Provider created" } } }
        },
        "/v1/providers/{providerId}": {
          get: { summary: "Return one provider with secrets redacted.", security: bearerSecurity, responses: { "200": { description: "Provider" } } },
          patch: { summary: "Update a provider.", security: bearerSecurity, responses: { "200": { description: "Provider updated" } } },
          delete: { summary: "Delete a provider and linked models.", security: bearerSecurity, responses: { "200": { description: "Provider deleted" } } }
        },
        "/v1/providers/{providerId}/duplicate": {
          post: { summary: "Duplicate one provider record only.", security: bearerSecurity, responses: { "201": { description: "Provider duplicated" } } }
        },
        "/v1/providers/{providerId}/models/discover": {
          get: { summary: "Discover provider models when supported.", security: bearerSecurity, responses: { "200": { description: "Discovered models" } } }
        },
        "/v1/models": {
          get: { summary: "Return configured models.", security: bearerSecurity, responses: { "200": { description: "Models" } } },
          post: { summary: "Create a model.", security: bearerSecurity, responses: { "201": { description: "Model created" } } }
        },
        "/v1/models/{modelId}": {
          get: { summary: "Return one model.", security: bearerSecurity, responses: { "200": { description: "Model" } } },
          patch: { summary: "Update a model.", security: bearerSecurity, responses: { "200": { description: "Model updated" } } },
          delete: { summary: "Delete a model and remove it from tab selections.", security: bearerSecurity, responses: { "200": { description: "Model deleted" } } }
        },
        "/v1/models/{modelId}/duplicate": {
          post: { summary: "Duplicate one model record.", security: bearerSecurity, responses: { "201": { description: "Model duplicated" } } }
        },
        "/v1/models/availability": { get: { summary: "Check model availability.", security: bearerSecurity, responses: { "200": { description: "Availability" } } } },
        "/v1/models/availability/refresh": {
          post: {
            summary: "Refresh model availability.",
            security: bearerSecurity,
            requestBody: {
              required: false,
              content: jsonContent({
                type: "object",
                additionalProperties: false,
                properties: {
                  modelIds: { type: "array", items: { type: "string" } }
                }
              })
            },
            responses: { "200": { description: "Availability" } }
          }
        },
        "/v1/runs/active": { get: { summary: "Return active runs.", security: bearerSecurity, responses: { "200": { description: "Active runs" } } } },
        "/v1/verifiers": { get: { summary: "Return verifier status.", security: bearerSecurity, responses: { "200": { description: "Verifiers" } } } },
        "/v1/workspaces/{workspaceId}/tabs": {
          post: {
            summary: "Create a workspace tab.",
            security: bearerSecurity,
            parameters: [{ name: "workspaceId", in: "path", required: true, schema: { type: "string" } }],
            requestBody: {
              required: false,
              content: jsonContent({
                type: "object",
                additionalProperties: false,
                properties: {
                  benchPackId: { type: ["string", "null"] },
                  title: { type: "string" },
                  modelSelections: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        modelId: { type: "string" },
                        alias: { type: "string" }
                      },
                      required: ["modelId"]
                    }
                  }
                }
              })
            },
            responses: { "201": { description: "Updated workspace state" } }
          }
        },
        "/v1/tabs/{tabId}": {
          patch: {
            summary: "Patch a tab.",
            security: bearerSecurity,
            parameters: [{ name: "tabId", in: "path", required: true, schema: { type: "string" } }],
            responses: { "200": { description: "Updated workspace state" } }
          }
        },
        "/v1/tabs/{tabId}/select-benchpack": {
          post: {
            summary: "Select a Bench Pack for a tab.",
            security: bearerSecurity,
            parameters: [{ name: "tabId", in: "path", required: true, schema: { type: "string" } }],
            requestBody: {
              required: true,
              content: jsonContent({
                type: "object",
                additionalProperties: false,
                properties: {
                  benchPackId: { type: ["string", "null"] },
                  title: { type: "string" }
                },
                required: ["benchPackId"]
              })
            },
            responses: { "200": { description: "Updated workspace state" } }
          }
        },
        "/v1/tabs/{tabId}/select-models": {
          post: {
            summary: "Select models for a tab.",
            security: bearerSecurity,
            parameters: [{ name: "tabId", in: "path", required: true, schema: { type: "string" } }],
            requestBody: {
              required: true,
              content: jsonContent({
                type: "object",
                additionalProperties: false,
                properties: {
                  modelIds: { type: "array", items: { type: "string" } },
                  selections: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        modelId: { type: "string" },
                        alias: { type: "string" }
                      },
                      required: ["modelId"]
                    }
                  }
                }
              })
            },
            responses: { "200": { description: "Updated workspace state" } }
          }
        },
        "/v1/tabs/{tabId}/sampling": { post: { summary: "Set tab sampling overrides.", security: bearerSecurity, responses: { "200": { description: "Updated workspace state" } } } },
        "/v1/tabs/{tabId}/execution-mode": { post: { summary: "Set tab execution mode.", security: bearerSecurity, responses: { "200": { description: "Updated workspace state" } } } },
        "/v1/tabs/{tabId}/runs-per-test": { post: { summary: "Set tab runs per test.", security: bearerSecurity, responses: { "200": { description: "Updated workspace state" } } } },
        "/v1/tabs/{tabId}/models/availability/refresh": { post: { summary: "Refresh selected tab model availability.", security: bearerSecurity, responses: { "200": { description: "Availability" } } } },
        "/v1/tabs/{tabId}/runs": {
          post: {
            summary: "Start a run for a tab.",
            security: bearerSecurity,
            parameters: [{ name: "tabId", in: "path", required: true, schema: { type: "string" } }],
            responses: { "202": { description: "Run accepted; subscribe to /v1/events for progress." } }
          }
        },
        "/v1/tabs/{tabId}/runs/stop": { post: { summary: "Stop a tab run.", security: bearerSecurity, responses: { "200": { description: "Stop result" } } } },
        "/v1/tabs/{tabId}/runs/{runId}/resume": { post: { summary: "Resume a historical run.", security: bearerSecurity, responses: { "202": { description: "Resume accepted" } } } },
        "/v1/tabs/{tabId}/runs/{runId}/retry-scenario": { post: { summary: "Retry one scenario/model cell.", security: bearerSecurity, responses: { "202": { description: "Retry accepted" } } } },
        "/v1/tabs/{tabId}/runs/{runId}/retry-provider-errors": { post: { summary: "Retry provider-error cells from a saved run.", security: bearerSecurity, responses: { "202": { description: "Retry accepted" } } } },
        "/v1/tabs/{tabId}/runs/{runId}/retry-failed-results": { post: { summary: "Retry non-provider failed cells from a saved run.", security: bearerSecurity, responses: { "202": { description: "Retry accepted" } } } },
        "/v1/benchpacks/{benchPackId}/history": { get: { summary: "Return run history for a Bench Pack.", security: bearerSecurity, responses: { "200": { description: "Run history" } } } },
        "/v1/benchpacks/{benchPackId}/history/{runId}": { get: { summary: "Return a run summary.", security: bearerSecurity, responses: { "200": { description: "Run summary" } } } }
      }
    };
}
