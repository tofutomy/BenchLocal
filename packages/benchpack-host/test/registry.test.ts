import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultConfig, type BenchLocalConfig } from "@benchlocal/core";
import { loadBenchPackRegistry } from "../src/index.js";

function createRegistryConfig(url = "https://registry.example.test/registry.json"): BenchLocalConfig {
  return {
    ...createDefaultConfig(),
    registry: {
      official_url: url
    }
  };
}

function mockFetchResponse(payload: unknown, init?: ResponseInit): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(payload), { status: 200, ...init }))
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadBenchPackRegistry", () => {
  it("fetches, validates, and sorts registry entries by name", async () => {
    mockFetchResponse({
      schemaVersion: 1,
      packs: [
        {
          id: "z-pack",
          name: "Zulu Pack",
          version: "1.0.0",
          source: { type: "archive", url: "https://example.test/z-pack.tgz" }
        },
        {
          id: "a-pack",
          name: "Alpha Pack",
          version: "1.0.0",
          source: { type: "github", repo: "owner/a-pack", tag: "v1.0.0" }
        },
        {
          id: "web-pack",
          name: "Browser Pack",
          version: "1.0.0",
          source: {
            type: "web",
            entry: "https://example.test/web-pack/index.html",
            manifest: "https://example.test/web-pack/benchlocal.pack.json",
            integrity: "sha256-test",
            buildId: "build-1"
          }
        }
      ]
    });

    const entries = await loadBenchPackRegistry(createRegistryConfig());

    expect(entries.map((entry) => entry.name)).toEqual(["Alpha Pack", "Browser Pack", "Zulu Pack"]);
    expect(fetch).toHaveBeenCalledWith("https://registry.example.test/registry.json", {
      method: "GET",
      headers: { accept: "application/json" }
    });
  });

  it("rejects non-ok registry responses", async () => {
    mockFetchResponse({ error: "nope" }, { status: 503 });

    await expect(loadBenchPackRegistry(createRegistryConfig())).rejects.toThrow(/Failed to fetch Bench Pack registry \(503\)/);
  });

  it("rejects invalid registry payloads", async () => {
    mockFetchResponse({ schemaVersion: 1, packs: [{ id: "broken" }] });

    await expect(loadBenchPackRegistry(createRegistryConfig())).rejects.toThrow(/registry payload is invalid/);
  });
});
