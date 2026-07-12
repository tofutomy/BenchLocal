import type { ScenarioResult } from "@benchlocal/core";

/** 仅接受 UI 与配置协议支持的奇数重复次数，非法值安全回退为单次执行。 */
export function normalizeRunsPerTest(value: unknown): number {
  return [1, 3, 5, 7, 9].includes(value as number) ? (value as number) : 1;
}

function getScenarioResultTieBreakRank(result: ScenarioResult): number {
  if (result.status === "pass") return 3;
  if (result.status === "partial") return 2;
  return 1;
}

function compareScenarioResultTieBreak(left: ScenarioResult, right: ScenarioResult): number {
  const rankDelta = getScenarioResultTieBreakRank(left) - getScenarioResultTieBreakRank(right);
  if (rankDelta !== 0) return rankDelta;

  const leftScore = left.score ?? left.points ?? Number.NEGATIVE_INFINITY;
  const rightScore = right.score ?? right.points ?? Number.NEGATIVE_INFINITY;
  const scoreDelta = leftScore - rightScore;
  if (scoreDelta !== 0) return scoreDelta;

  const leftIsProviderError = left.errorType === "provider_error";
  const rightIsProviderError = right.errorType === "provider_error";
  if (leftIsProviderError !== rightIsProviderError) return leftIsProviderError ? -1 : 1;
  return 0;
}

function getMajorityStatus(results: ScenarioResult[]): ScenarioResult["status"] {
  const passCount = results.filter((result) => result.status === "pass").length;
  const failCount = results.filter((result) => result.status === "fail").length;
  const partialCount = results.filter((result) => result.status === "partial").length;
  const threshold = Math.floor(results.length / 2) + 1;

  if (passCount >= threshold) return "pass";
  if (failCount >= threshold) return "fail";
  if (partialCount >= threshold) return "partial";
  return "partial";
}

function selectRepresentativeScenarioResult(
  results: ScenarioResult[],
  status: ScenarioResult["status"]
): { result: ScenarioResult; index: number } {
  const candidates = results
    .map((result, index) => ({ result, index }))
    .filter((candidate) => candidate.result.status === status);
  const pool = candidates.length > 0 ? candidates : results.map((result, index) => ({ result, index }));

  return pool.reduce(
    (best, candidate) => compareScenarioResultTieBreak(candidate.result, best.result) > 0 ? candidate : best,
    pool[0]
  );
}

/** 将重复执行结果按多数状态合并，并保留最具代表性的输出与完整原始日志。 */
export function selectMajorityRepeatedScenarioResult(results: ScenarioResult[]): ScenarioResult {
  if (results.length <= 1) return results[0];

  const majorityStatus = getMajorityStatus(results);
  const representative = selectRepresentativeScenarioResult(results, majorityStatus);
  const passCount = results.filter((result) => result.status === "pass").length;
  const partialCount = results.filter((result) => result.status === "partial").length;
  const failCount = results.filter((result) => result.status === "fail").length;
  const startedAt = results.find((result) => result.timings?.startedAt)?.timings?.startedAt;
  const completedAt = [...results].reverse().find((result) => result.timings?.completedAt)?.timings?.completedAt;
  const durationMs = results.reduce((total, result) => total + (result.timings?.durationMs ?? 0), 0);

  return {
    ...representative.result,
    status: majorityStatus,
    summary: `Majority across ${results.length} runs: ${passCount} pass, ${partialCount} partial, ${failCount} fail. ${representative.result.summary}`.trim(),
    note: [`Selected representative attempt ${representative.index + 1}/${results.length}.`, representative.result.note]
      .filter(Boolean).join(" "),
    rawLog: results.map((result, index) => `--- run ${index + 1}/${results.length} ---\n${result.rawLog}`).join("\n\n"),
    output: representative.result.output,
    verifier: representative.result.verifier,
    artifacts: representative.result.artifacts,
    timings: { startedAt, completedAt, durationMs }
  };
}
