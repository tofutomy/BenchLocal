import type { BenchPackManifest, VerifierEndpoint } from "@benchlocal/core";
import { describe, expect, it, vi } from "vitest";
import { resolveVerifierEndpoints, type VerifierEndpointOperations } from "../src/verifier/endpoint-resolution.js";

const manifest: BenchPackManifest = {
  schemaVersion: 1,
  protocolVersion: 1,
  id: "pack-a",
  name: "Pack A",
  version: "1.0.0",
  entry: "index.js",
  capabilities: { tools: false, multiTurn: false, streamingProgress: true, verification: true },
  verifiers: [{
    id: "judge",
    transport: "http",
    required: true,
    defaultMode: "docker",
    docker: { image: "judge:latest", listenPort: 8080 }
  }]
};

describe("verifier endpoint dependency seam", () => {
  it("delegates Docker resolution through injected operations", async () => {
    const endpoint: VerifierEndpoint = {
      id: "judge", transport: "http", mode: "docker", required: true, status: "running", url: "http://stub"
    };
    const operations: VerifierEndpointOperations = {
      resolveDocker: vi.fn().mockResolvedValue(endpoint),
      probe: vi.fn()
    };

    await expect(resolveVerifierEndpoints("pack-a", undefined, manifest, operations)).resolves.toEqual([endpoint]);
    expect(operations.resolveDocker).toHaveBeenCalledOnce();
    expect(operations.probe).not.toHaveBeenCalled();
  });
});
