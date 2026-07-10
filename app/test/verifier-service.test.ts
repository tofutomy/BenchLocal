import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { BenchPackInspection } from "@core";
import { AgentEventBus } from "../src/main/services/agent-event-bus.js";
import { BenchPackService } from "../src/main/services/benchpack-service.js";
import { ConfigService } from "../src/main/services/config-service.js";
import { VerifierService } from "../src/main/services/verifier-service.js";

const tempRoots: string[] = [];

const verifierInspection: BenchPackInspection = {
  id: "verifier-pack",
  source: "registry",
  status: "ready",
  manifest: {
    schemaVersion: 1,
    protocolVersion: 1,
    id: "verifier-pack",
    name: "Verifier Pack",
    version: "1.0.0",
    entry: "dist/index.js",
    capabilities: {
      tools: false,
      multiTurn: false,
      streamingProgress: true,
      verification: true
    }
  }
};

const regularInspection: BenchPackInspection = {
  id: "regular-pack",
  source: "registry",
  status: "ready",
  manifest: {
    schemaVersion: 1,
    protocolVersion: 1,
    id: "regular-pack",
    name: "Regular Pack",
    version: "1.0.0",
    entry: "dist/index.js",
    capabilities: {
      tools: false,
      multiTurn: false,
      streamingProgress: true,
      verification: false
    }
  }
};

const verifierStatus = {
  benchPackId: "verifier-pack",
  benchPackName: "Verifier Pack",
  verifiers: [],
  docker: { state: "ready" as const, available: true }
};

async function createDependencies(inspections: BenchPackInspection[] = [verifierInspection]) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "benchlocal-verifier-service-test-"));
  tempRoots.push(root);
  vi.spyOn(os, "homedir").mockReturnValue(root);

  const eventBus = new AgentEventBus();
  const configService = new ConfigService(eventBus);
  await configService.loadConfig();
  const benchPackService = new BenchPackService(configService, async () => ({ benchLocalVersion: "0.3.0" }), {
    inspectConfiguredBenchPacks: vi.fn(async () => inspections)
  });
  return { eventBus, configService, benchPackService };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("VerifierService", () => {
  it("lists only packs that declare verifier capabilities", async () => {
    const dependencies = await createDependencies([verifierInspection, regularInspection]);
    const getConfiguredBenchPackVerifierStatus = vi.fn(async (_config: unknown, _benchPackId: string) => verifierStatus);
    const service = new VerifierService(
      dependencies.eventBus,
      dependencies.configService,
      dependencies.benchPackService,
      { getConfiguredBenchPackVerifierStatus }
    );

    await expect(service.listVerifiers()).resolves.toEqual([verifierStatus]);
    expect(getConfiguredBenchPackVerifierStatus).toHaveBeenCalledOnce();
    expect(getConfiguredBenchPackVerifierStatus.mock.calls[0][1]).toBe("verifier-pack");
  });

  it("maps progress events, rejects duplicate starts and releases state after user cancellation", async () => {
    const dependencies = await createDependencies();
    const agentEvents: unknown[] = [];
    dependencies.eventBus.onAgentEvent((event) => agentEvents.push(event));
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const startConfiguredBenchPackVerifiers = vi.fn(
      async (_config: unknown, _benchPackId: string, options?: { abortSignal?: AbortSignal; onProgress?: (progress: {
        verifierId: string;
        phase: "checking_docker";
        message: string;
        keyName: string;
        source: "none";
      }) => void | Promise<void> }) => {
        await options?.onProgress?.({
          verifierId: "default",
          phase: "checking_docker",
          message: "Checking Docker.",
          keyName: "",
          source: "none"
        });
        markStarted?.();
        return new Promise<never>((_resolve, reject) => {
          options?.abortSignal?.addEventListener("abort", () => reject(options.abortSignal?.reason));
        });
      }
    );
    const progress = vi.fn();
    const service = new VerifierService(
      dependencies.eventBus,
      dependencies.configService,
      dependencies.benchPackService,
      {
        getConfiguredBenchPackVerifierStatus: vi.fn(async () => verifierStatus),
        startConfiguredBenchPackVerifiers
      }
    );

    const firstStart = service.startVerifier("verifier-pack", progress);
    await started;
    await expect(service.startVerifier("verifier-pack")).rejects.toThrow(
      'Verifier startup is already active for Bench Pack "verifier-pack".'
    );
    expect(service.hasActiveStarts()).toBe(true);
    expect(service.cancelVerifierStart("verifier-pack")).toEqual({ cancelled: true });
    await expect(firstStart).rejects.toThrow("Verifier start cancelled by user.");

    expect(service.hasActiveStarts()).toBe(false);
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({ type: "verifier_preparing", benchPackId: "verifier-pack", verifierId: "default" })
    );
    expect(agentEvents).toContainEqual(
      expect.objectContaining({ type: "verifier.event", payload: expect.objectContaining({ benchPackId: "verifier-pack" }) })
    );
  });

  it("aborts every active start during shutdown", async () => {
    const dependencies = await createDependencies();
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const service = new VerifierService(
      dependencies.eventBus,
      dependencies.configService,
      dependencies.benchPackService,
      {
        getConfiguredBenchPackVerifierStatus: vi.fn(async () => verifierStatus),
        startConfiguredBenchPackVerifiers: vi.fn(async (_config, _benchPackId, options) => {
          markStarted?.();
          return new Promise<never>((_resolve, reject) => {
            options?.abortSignal?.addEventListener("abort", () => reject(options.abortSignal?.reason));
          });
        })
      }
    );

    const activeStart = service.startVerifier("verifier-pack");
    await started;
    service.cancelActiveStartsForShutdown();
    await expect(activeStart).rejects.toThrow("Verifier start cancelled because BenchLocal is shutting down.");
    expect(service.hasActiveStarts()).toBe(false);
  });
});
