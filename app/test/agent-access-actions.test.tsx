// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useAgentAccessActions } from "../src/renderer/src/features/settings/useAgentAccessActions";
import type { BenchLocalAgentAccessState } from "../src/shared/desktop-api";

afterEach(() => Reflect.deleteProperty(window, "benchlocal"));

it("updates Agent Access state and notice after configuration", async () => {
  const state = { enabled: true } as BenchLocalAgentAccessState;
  Object.defineProperty(window, "benchlocal", {
    configurable: true,
    value: { agent: { configure: vi.fn().mockResolvedValue(state) } }
  });
  const { result } = renderHook(() => {
    const [agentState, setAgentState] = useState<BenchLocalAgentAccessState | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const actions = useAgentAccessActions({ setAgentAccessState: setAgentState, setSettingsNotice: setNotice, setError });
    return { agentState, notice, error, actions };
  });

  await act(async () => result.current.actions.configureAgentAccess({ enabled: true }));

  expect(result.current.agentState).toBe(state);
  expect(result.current.notice).toBe("Enabled local Agent Access.");
  expect(result.current.error).toBeNull();
});
