import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { BenchPackInspection } from "@core";
import { expandHomePath } from "@core";
import { AgentEventBus } from "../src/main/services/agent-event-bus.js";
import { BenchPackService } from "../src/main/services/benchpack-service.js";
import { ConfigService } from "../src/main/services/config-service.js";
import { HistoryService } from "../src/main/services/history-service.js";
import { WebPackService } from "../src/main/services/webpack-service.js";

const tempRoots: string[] = [];

async function createServices(inspections: BenchPackInspection[] = []) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "benchlocal-webpack-service-test-"));
  tempRoots.push(root);
  vi.spyOn(os, "homedir").mockReturnValue(root);

  const configService = new ConfigService(new AgentEventBus());
  const loaded = await configService.loadConfig();
  loaded.config.providers.local = {
    kind: "openai_compatible",
    name: "Local",
    enabled: true,
    base_url: "http://127.0.0.1:11434/v1",
    api_key: "secret-token"
  };
  loaded.config.models = [
    {
      id: "local-model",
      provider: "local",
      model: "llama3",
      label: "Local Model",
      group: "Local",
      enabled: true
    }
  ];
  await configService.saveConfig(loaded.config);

  const benchPackService = new BenchPackService(configService, async () => ({ benchLocalVersion: "0.3.0" }), {
    inspectConfiguredBenchPacks: vi.fn(async () => inspections)
  });
  const historyService = new HistoryService(configService);
  const webPackService = new WebPackService(configService, benchPackService, historyService);
  return { configService, historyService, webPackService };
}

const webInspection: BenchPackInspection = {
  id: "web-pack",
  source: "registry",
  status: "ready",
  manifest: {
    schemaVersion: 1,
    protocolVersion: 1,
    type: "web",
    id: "web-pack",
    name: "Web Pack",
    version: "1.0.0",
    entry: "https://example.com/pack",
    web: {
      bridgeVersion: 1,
      allowedOrigins: ["https://example.com"],
      permissions: [],
      buildId: "build-1",
      manifestHash: "hash-1"
    },
    capabilities: {
      tools: false,
      multiTurn: true,
      streamingProgress: true,
      verification: false
    }
  }
};

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("WebPackService", () => {
  it("normalizes non-stream chat responses and forwards provider credentials", async () => {
    const { webPackService } = await createServices();
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer secret-token");
      expect(JSON.parse(String(init?.body))).toMatchObject({ model: "llama3", stream: false });
      return new Response(
        JSON.stringify({
          id: "response-1",
          choices: [{ message: { role: "assistant", content: "Hello" }, finish_reason: "stop" }]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await webPackService.runWebPackChat({
      modelId: "local-model",
      messages: [{ role: "user", content: "Hi" }]
    });

    expect(response).toMatchObject({
      id: "response-1",
      modelId: "local-model",
      content: "Hello",
      finishReason: "stop"
    });
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:11434/v1/chat/completions");
  });

  it("emits start, delta and accumulated done events for SSE streams", async () => {
    const { webPackService } = await createServices();
    const encoder = new TextEncoder();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode('data: {"id":"stream-1","choices":[{"delta":{"content":"Hel"}}]}\n\n'));
              controller.enqueue(encoder.encode('data: {"id":"stream-1","choices":[{"delta":{"content":"lo"}}]}\n\n'));
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            }
          }),
          { status: 200 }
        )
      )
    );
    const events: Array<{ type: string; content?: string }> = [];

    await webPackService.streamWebPackChat(
      { modelId: "local-model", messages: [{ role: "user", content: "Hi" }] },
      (event) => {
        events.push(event);
      }
    );

    expect(events.map((event) => event.type)).toEqual(["start", "delta", "delta", "done"]);
    expect(events.at(-1)).toMatchObject({ type: "done", content: "Hello" });
  });

  it("persists Web Pack history and confines artifacts to the run directory", async () => {
    const { configService, historyService, webPackService } = await createServices([webInspection]);
    const saved = await webPackService.saveWebPackHistory({
      benchPackId: "web-pack",
      runId: "run-1",
      modelIds: ["local-model"],
      payload: { status: "running", metadata: { step: 1 } }
    });
    const result = await webPackService.writeWebPackArtifact({
      benchPackId: "web-pack",
      runId: "run-1",
      modelIds: ["local-model"],
      artifact: {
        kind: "text",
        label: "Result",
        path: "../../escape.txt",
        contentType: "text/plain",
        content: "artifact body"
      }
    });

    const loaded = await historyService.loadRunHistory("web-pack", "run-1");
    const config = await configService.loadConfig();
    const artifactPath = path.join(
      expandHomePath(config.config.run_storage_dir),
      "web-pack",
      "run-1",
      "artifacts",
      "escape.txt"
    );
    expect(saved.packType).toBe("web");
    expect(result.artifact.path?.replaceAll("\\", "/")).toBe("artifacts/escape.txt");
    expect(await fs.readFile(artifactPath, "utf8")).toBe("artifact body");
    expect(loaded.webHistory?.artifacts).toEqual([result.artifact]);
  });
});
