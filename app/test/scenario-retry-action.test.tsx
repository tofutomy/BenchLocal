// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { useScenarioRetryAction } from "../src/renderer/src/features/runs/useScenarioRetryAction";
import type { BenchLocalWorkspaceState } from "@core";
import type { DetailModalState } from "../src/renderer/src/features/runs/ResultDetailModal";

it("rejects retrying a detail without a saved run ID", async () => {
  const { result } = renderHook(() => {
    const [error, setError] = useState<string | null>(null);
    const actions = useScenarioRetryAction({
      workspaceState: { tabs: {} } as BenchLocalWorkspaceState,
      activeRuns: {},
      hasUnsavedChanges: false,
      save: vi.fn().mockResolvedValue(true),
      loadHistoryForBenchPack: vi.fn().mockResolvedValue(undefined),
      setDetailModal: vi.fn(),
      setLiveRuns: vi.fn(),
      setRunSummaries: vi.fn(),
      setAppNotice: vi.fn(),
      setError
    });
    return { error, actions };
  });

  await act(async () => result.current.actions.retryScenarioFromDetail({ runId: null } as unknown as DetailModalState));

  expect(result.current.error).toBe("This scenario does not belong to a saved test run yet.");
});
