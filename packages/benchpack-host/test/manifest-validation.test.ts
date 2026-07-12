import type { BenchPackRegistryEntry } from "@benchlocal/core";
import { describe, expect, it } from "vitest";
import { createWebBenchPackManifestFromRegistryEntry } from "../src/install/manifest-validation.js";

function entry(entryUrl: string): BenchPackRegistryEntry {
  return {
    id: "web-pack",
    name: "Web Pack",
    author: "BenchLocal",
    version: "1.0.0",
    description: "test",
    source: { type: "web", entry: entryUrl }
  } as BenchPackRegistryEntry;
}

describe("web manifest validation", () => {
  it("derives a constrained allowed origin and standard permissions", () => {
    const manifest = createWebBenchPackManifestFromRegistryEntry(entry("https://example.com/packs/index.html"));
    expect(manifest.type).toBe("web");
    expect(manifest.web?.allowedOrigins).toEqual(["https://example.com"]);
    expect(manifest.web?.permissions).toContain("inference:chat");
  });

  it("rejects insecure Web entry URLs", () => {
    expect(() => createWebBenchPackManifestFromRegistryEntry(entry("http://example.com/pack"))).toThrow(
      "must use an https entry URL"
    );
  });
});
