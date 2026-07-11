import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

function stringifyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function jsonToolResult(payload: unknown): CallToolResult {
  const structuredContent = typeof payload === "object" && payload !== null && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : { result: payload };
  return {
    structuredContent,
    content: [{ type: "text", text: stringifyJson(payload) }]
  };
}

export function jsonResource(uri: string, payload: unknown) {
  return {
    contents: [{ uri, mimeType: "application/json", text: stringifyJson(payload) }]
  };
}

export function textResource(uri: string, mimeType: string, text: string) {
  return {
    contents: [{ uri, mimeType, text }]
  };
}
