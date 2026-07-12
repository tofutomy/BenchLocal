import { describe, expect, it, vi } from "vitest";
import { hydrateBenchLocalRuntimeDependencies, type RuntimeHydrationOperations } from "../src/install/runtime-hydration.js";

describe("runtime hydration seam", () => {
  it("copies every required runtime dependency through injected operations", async () => {
    const operations: RuntimeHydrationOperations = {
      fs: { mkdir: vi.fn(), rm: vi.fn(), cp: vi.fn() } as unknown as RuntimeHydrationOperations["fs"],
      pathExists: vi.fn().mockResolvedValue(true),
      resolveRuntimeRoot: vi.fn().mockResolvedValue("C:/runtime")
    };
    await hydrateBenchLocalRuntimeDependencies("C:/stage", operations);
    expect(operations.fs.cp).toHaveBeenCalledTimes(4);
    expect(operations.fs.rm).toHaveBeenCalledTimes(4);
  });

  it("fails before copying when a bundled dependency is absent", async () => {
    const operations: RuntimeHydrationOperations = {
      fs: { mkdir: vi.fn(), rm: vi.fn(), cp: vi.fn() } as unknown as RuntimeHydrationOperations["fs"],
      pathExists: vi.fn().mockResolvedValue(false),
      resolveRuntimeRoot: vi.fn().mockResolvedValue("C:/runtime")
    };
    await expect(hydrateBenchLocalRuntimeDependencies("C:/stage", operations)).rejects.toThrow("@benchlocal/sdk");
    expect(operations.fs.cp).not.toHaveBeenCalled();
  });
});
