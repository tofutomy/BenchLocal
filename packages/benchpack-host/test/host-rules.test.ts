import { describe, expect, it, vi } from "vitest";
import type { BenchLocalVerifierConfig, ProgressEvent, VerifierSpec } from "@benchlocal/core";
import {
  BENCH_PACK_INSTALL_PHASES,
  createInstallProgress,
  reportInstallProgress
} from "../src/install-progress.js";
import { mergeSummaryEvents } from "../src/run-summary.js";
import { bootstrapVerifierConfig, getVerifierUrl } from "../src/verifier-config.js";

const verifierSpec: VerifierSpec = {
  id: "api",
  transport: "http",
  required: true,
  defaultMode: "docker",
  cloud: {
    baseUrl: "https://verifier.example.test",
    healthcheckPath: "/health"
  },
  docker: {
    image: "example/verifier:1",
    listenPort: 8080,
    healthcheckPath: "/health"
  },
  customUrl: {
    defaultUrl: "http://127.0.0.1:9000",
    healthcheckPath: "/health"
  }
};

describe("install progress rules", () => {
  it("keeps the expected install phase order stable", () => {
    expect(BENCH_PACK_INSTALL_PHASES).toEqual([
      "resolving",
      "downloading",
      "extracting",
      "hydrating",
      "validating",
      "activating",
      "removing",
      "complete"
    ]);
  });

  it("reports normalized progress payloads", async () => {
    const reporter = vi.fn();
    const progress = createInstallProgress("pack-a", "install", "downloading", "Downloading Bench Pack artifact.");

    await reportInstallProgress(reporter, progress);

    expect(reporter).toHaveBeenCalledWith({
      benchPackId: "pack-a",
      action: "install",
      phase: "downloading",
      message: "Downloading Bench Pack artifact."
    });
  });
});

describe("verifier config rules", () => {
  it("bootstraps verifier config from manifest defaults and preserves existing overrides", () => {
    const existing: BenchLocalVerifierConfig = {
      mode: "custom_url",
      auto_start: false,
      custom_url: "http://localhost:7777"
    };

    expect(bootstrapVerifierConfig(verifierSpec, existing)).toEqual({
      mode: "custom_url",
      auto_start: false,
      custom_url: "http://localhost:7777",
      cloud_url: "https://verifier.example.test",
      docker_image: "example/verifier:1"
    });
  });

  it("resolves docker, cloud, and custom verifier URLs consistently", () => {
    expect(getVerifierUrl(verifierSpec)).toEqual({
      mode: "docker",
      details: "BenchLocal assigns a free local port automatically."
    });
    expect(getVerifierUrl(verifierSpec, { mode: "cloud", auto_start: true })).toEqual({
      mode: "cloud",
      url: "https://verifier.example.test",
      details: "https://verifier.example.test"
    });
    expect(getVerifierUrl(verifierSpec, { mode: "custom_url", auto_start: true, custom_url: "http://localhost:7777" })).toEqual({
      mode: "custom_url",
      url: "http://localhost:7777",
      details: "http://localhost:7777"
    });
  });
});

describe("run summary merge rules", () => {
  it("appends only persisted events missing from the current in-memory stream", () => {
    const current: ProgressEvent[] = [
      { type: "run_started", runId: "run-1", models: [], totalScenarios: 1 },
      { type: "scenario_started", scenarioId: "s1", title: "Scenario 1", index: 1, total: 1 }
    ];
    const persisted: ProgressEvent[] = [
      ...current,
      { type: "scenario_finished", scenarioId: "s1" },
      { type: "run_finished", scores: {} }
    ];

    expect(mergeSummaryEvents(current, persisted)).toEqual(persisted);
  });

  it("keeps current events when persisted history is absent or shorter", () => {
    const current: ProgressEvent[] = [{ type: "run_started", runId: "run-1", models: [], totalScenarios: 1 }];

    expect(mergeSummaryEvents(current)).toBe(current);
    expect(mergeSummaryEvents(current, [])).toBe(current);
  });
});
