import type { HostContext } from "@benchlocal/core";
import { describe, expect, it, vi } from "vitest";
import { startInferenceRelay } from "../src/providers/inference-endpoints.js";

describe("inference relay boundary", () => {
  it("does not bind a server when no models are configured", async () => {
    const logger: HostContext["logger"] = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    const relay = await startInferenceRelay([], [], [], logger);
    expect(relay.endpoints).toEqual([]);
    await expect(relay.dispose()).resolves.toBeUndefined();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("reports a failed endpoint when a model references a missing provider", async () => {
    const logger: HostContext["logger"] = {
      debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn()
    };
    const models = [{ id: "model-a", provider: "missing", model: "upstream-a", enabled: true }] as HostContext["models"];

    const relay = await startInferenceRelay([], models, [], logger);
    expect(relay.endpoints).toEqual([
      expect.objectContaining({ modelId: "model-a", providerId: "missing", status: "failed" })
    ]);
    await relay.dispose();
  });
});
