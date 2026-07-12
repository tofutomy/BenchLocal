import { describe, expect, it } from "vitest";
import * as host from "../src/index.js";

const requiredRuntimeExports = [
  "loadBenchPackRegistry",
  "inspectConfiguredBenchPacks",
  "installBenchPackFromRegistry",
  "installBenchPackFromUrl",
  "updateBenchPackFromRegistry",
  "uninstallBenchPack",
  "checkConfiguredModelAvailability",
  "getConfiguredBenchPackVerifierStatus",
  "startConfiguredBenchPackVerifiers",
  "stopConfiguredBenchPackVerifiers",
  "deleteConfiguredBenchPackVerifierImage",
  "runConfiguredBenchPack",
  "retryScenarioForBenchPackRun",
  "resumeBenchPackRun",
  "listRunHistoryForBenchPack",
  "loadRunSummaryForBenchPack",
  "deleteRunHistoryForBenchPack",
  "clearRunHistoryForBenchPack",
  "createBenchPackHost"
] as const;

describe("benchpack-host public API", () => {
  it("keeps every public runtime capability available from the package barrel", () => {
    // 通过单一断言锁住 public barrel，防止模块迁移时漏掉外部调用方依赖的导出。
    for (const exportName of requiredRuntimeExports) {
      expect(exportName in host).toBe(true);
      expect(typeof host[exportName]).toBe("function");
    }
  });
});
