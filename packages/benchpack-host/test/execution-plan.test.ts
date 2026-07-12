import type { ScenarioResult } from "@benchlocal/core";
import { describe, expect, it } from "vitest";
import { normalizeRunsPerTest, selectMajorityRepeatedScenarioResult } from "../src/runs/execution-plan.js";

function result(status: ScenarioResult["status"], score: number, attempt: number): ScenarioResult {
  return {
    scenarioId: "scenario-a",
    status,
    score,
    summary: `attempt ${attempt}`,
    rawLog: `log ${attempt}`,
    timings: { durationMs: attempt * 10 }
  };
}

describe("run execution plan", () => {
  it("normalizes unsupported repeat counts", () => {
    expect(normalizeRunsPerTest(5)).toBe(5);
    expect(normalizeRunsPerTest(2)).toBe(1);
    expect(normalizeRunsPerTest("3")).toBe(1);
  });

  it("uses majority status and the highest-scoring representative", () => {
    const merged = selectMajorityRepeatedScenarioResult([
      result("pass", 0.6, 1),
      result("fail", 0.9, 2),
      result("pass", 0.8, 3)
    ]);

    expect(merged.status).toBe("pass");
    expect(merged.score).toBe(0.8);
    expect(merged.note).toContain("attempt 3/3");
    expect(merged.timings?.durationMs).toBe(60);
    expect(merged.rawLog).toContain("--- run 1/3 ---");
  });
});
