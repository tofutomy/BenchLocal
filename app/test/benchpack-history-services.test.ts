import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { BenchLocalConfig } from "@core";
import { AgentEventBus } from "../src/main/services/agent-event-bus.js";
import { BenchPackService, type BenchPackMutationProgress } from "../src/main/services/benchpack-service.js";
import { ConfigService } from "../src/main/services/config-service.js";
import { HistoryService } from "../src/main/services/history-service.js";

const tempRoots: string[] = [];

async function createConfigService() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "benchlocal-benchpack-history-services-test-"));
  tempRoots.push(root);
  vi.spyOn(os, "homedir").mockReturnValue(root);

  const configService = new ConfigService(new AgentEventBus());
  await configService.loadConfig();
  return configService;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("bench pack and history services", () => {
  it("persists host installation results and forwards runtime progress", async () => {
    const configService = await createConfigService();
    const progress: BenchPackMutationProgress[] = [];
    const runtime = { benchLocalVersion: "0.3.0" };
    const installBenchPackFromRegistry = vi.fn(
      async (
        config: BenchLocalConfig,
        benchPackId: string,
        reporter?: (event: BenchPackMutationProgress) => void | Promise<void>,
        receivedRuntime?: { benchLocalVersion?: string }
      ) => {
        expect(receivedRuntime).toEqual(runtime);
        await reporter?.({
          benchPackId,
          action: "install",
          phase: "complete",
          message: "Installed."
        });
        const nextConfig = structuredClone(config);
        nextConfig.benchpacks[benchPackId] = {
          enabled: true,
          source: "registry",
          version: "1.0.0"
        };
        return nextConfig;
      }
    );
    const service = new BenchPackService(configService, async () => runtime, {
      installBenchPackFromRegistry
    });

    const result = await service.installBenchPack("sample-pack", (event) => progress.push(event));
    const persisted = await configService.loadConfig();

    expect(result.config.benchpacks["sample-pack"]).toMatchObject({ version: "1.0.0" });
    expect(persisted.config.benchpacks["sample-pack"]).toMatchObject({ version: "1.0.0" });
    expect(progress).toEqual([
      {
        benchPackId: "sample-pack",
        action: "install",
        phase: "complete",
        message: "Installed."
      }
    ]);
    expect(installBenchPackFromRegistry).toHaveBeenCalledOnce();
  });

  it("passes runtime compatibility when inspecting configured packs", async () => {
    const configService = await createConfigService();
    const runtime = { benchLocalVersion: "0.3.0" };
    const inspectConfiguredBenchPacks = vi.fn(async (_config: BenchLocalConfig, receivedRuntime?: { benchLocalVersion?: string }) => {
      expect(receivedRuntime).toEqual(runtime);
      return [];
    });
    const service = new BenchPackService(configService, async () => runtime, {
      inspectConfiguredBenchPacks
    });

    await expect(service.listBenchPacks()).resolves.toEqual([]);
    expect(inspectConfiguredBenchPacks).toHaveBeenCalledOnce();
  });

  it("routes history operations through the current persisted configuration", async () => {
    const configService = await createConfigService();
    const listRunHistoryForBenchPack = vi.fn(async (config: BenchLocalConfig, benchPackId: string) => {
      expect(config.schema_version).toBe(1);
      expect(benchPackId).toBe("sample-pack");
      return [];
    });
    const deleteRunHistoryForBenchPack = vi.fn(
      async (_config: BenchLocalConfig, benchPackId: string, runIds: string[]) => ({
        removedRunIds: benchPackId === "sample-pack" ? runIds : []
      })
    );
    const service = new HistoryService(configService, {
      listRunHistoryForBenchPack,
      deleteRunHistoryForBenchPack
    });

    await expect(service.listRunHistory("sample-pack")).resolves.toEqual([]);
    await expect(service.deleteRunHistory("sample-pack", ["run-1", "run-2"])).resolves.toEqual({
      removedRunIds: ["run-1", "run-2"]
    });
    expect(listRunHistoryForBenchPack).toHaveBeenCalledOnce();
    expect(deleteRunHistoryForBenchPack).toHaveBeenCalledOnce();
  });
});
