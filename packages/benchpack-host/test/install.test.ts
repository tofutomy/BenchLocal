import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDefaultConfig, loadConfigFile, type BenchLocalConfig, type BenchPackManifest } from "@benchlocal/core";
import { installBenchPackFromRegistry, type BenchPackInstallProgress } from "../src/index.js";

const tempRoots: string[] = [];

async function createInstallConfig(): Promise<{ root: string; config: BenchLocalConfig }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "benchlocal-install-test-"));
  tempRoots.push(root);
  vi.spyOn(os, "homedir").mockReturnValue(root);

  const base = createDefaultConfig();
  return {
    root,
    config: {
      ...base,
      run_storage_dir: path.join(root, "runs"),
      benchpack_storage_dir: path.join(root, "benchpacks"),
      log_storage_dir: path.join(root, "logs"),
      cache_dir: path.join(root, "cache"),
      registry: {
        official_url: "https://registry.example.test/registry.json"
      }
    }
  };
}

function mockJsonFetchQueue(payloads: unknown[]): void {
  const queue = [...payloads];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const payload = queue.shift();
      if (payload === undefined) {
        return new Response(JSON.stringify({ error: "unexpected fetch" }), { status: 500 });
      }

      return new Response(JSON.stringify(payload), { status: 200 });
    })
  );
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("installBenchPackFromRegistry", () => {
  it("emits the web install phase sequence and persists the installed Bench Pack", async () => {
    const { root, config } = await createInstallConfig();
    const manifest: BenchPackManifest = {
      schemaVersion: 1,
      protocolVersion: 1,
      type: "web",
      id: "web-pack",
      name: "Web Pack",
      version: "1.2.3",
      entry: "https://packs.example.test/web-pack/index.html",
      web: {
        bridgeVersion: 1,
        allowedOrigins: ["https://packs.example.test"],
        permissions: ["models:list", "models:read"]
      },
      capabilities: {
        tools: false,
        multiTurn: false,
        streamingProgress: true,
        verification: false
      }
    };
    mockJsonFetchQueue([
      {
        schemaVersion: 1,
        packs: [
          {
            id: "web-pack",
            name: "Web Pack",
            version: "1.2.3",
            source: {
              type: "web",
              entry: "https://packs.example.test/web-pack/index.html",
              manifest: "https://packs.example.test/web-pack/benchlocal.pack.json"
            }
          }
        ]
      },
      manifest
    ]);
    const progress: BenchPackInstallProgress[] = [];

    const nextConfig = await installBenchPackFromRegistry(config, "web-pack", (event) => {
      progress.push(event);
    });

    expect(progress.map((event) => event.phase)).toEqual([
      "resolving",
      "downloading",
      "validating",
      "activating",
      "complete"
    ]);
    expect(nextConfig.default_benchpack).toBe("web-pack");
    expect(nextConfig.benchpacks["web-pack"]).toMatchObject({
      enabled: true,
      source: "registry",
      version: "1.2.3"
    });
    await expect(loadConfigFile(path.join(root, ".benchlocal", "config.toml"))).resolves.toMatchObject({
      default_benchpack: "web-pack"
    });
    await expect(fs.stat(path.join(root, "benchpacks", "web-pack", "current.json"))).resolves.toBeDefined();
  });
});
