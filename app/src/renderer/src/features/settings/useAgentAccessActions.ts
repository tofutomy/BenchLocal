import type { Dispatch, SetStateAction } from "react";
import type { BenchLocalAgentAccess } from "@core";
import type { BenchLocalAgentAccessState } from "@/shared/desktop-api";

type Options = {
  setAgentAccessState: Dispatch<SetStateAction<BenchLocalAgentAccessState | null>>;
  setSettingsNotice: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
};

// 封装 Agent Access 的桌面 API 调用和设置页反馈。
export function useAgentAccessActions({ setAgentAccessState, setSettingsNotice, setError }: Options) {
  const configureAgentAccess = async (input: { enabled: boolean; access?: BenchLocalAgentAccess; port?: number }) => {
    setError(null);
    try {
      const state = await window.benchlocal.agent.configure(input);
      setAgentAccessState(state);
      setSettingsNotice(state.enabled ? "Enabled local Agent Access." : "Disabled local Agent Access.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to update Agent Access.");
    }
  };

  const regenerateAgentToken = async () => {
    setError(null);
    try {
      const state = await window.benchlocal.agent.regenerateToken();
      setAgentAccessState(state);
      setSettingsNotice("Regenerated the Agent Access token.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to regenerate Agent Access token.");
    }
  };

  return { configureAgentAccess, regenerateAgentToken };
}
