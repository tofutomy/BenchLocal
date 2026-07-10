// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { useVerifierConfigActions } from "../src/renderer/src/features/settings/useVerifierConfigActions";
import type { BenchLocalConfig } from "@core";

it("restores the previous draft when saving verifier config fails", async () => {
  const initial = {
    benchpacks: { "pack-1": { verifiers: { judge: { mode: "cloud", base_url: "before" } } } }
  } as unknown as BenchLocalConfig;
  const { result } = renderHook(() => {
    const [draft, setDraft] = useState<BenchLocalConfig | null>(initial);
    const actions = useVerifierConfigActions({
      draft,
      loadState: null,
      persistConfig: vi.fn().mockResolvedValue(false),
      setDraft,
      setStoppingVerifierStarts: vi.fn(),
      setSettingsVerifierPreparationModal: vi.fn(),
      setError: vi.fn()
    });
    return { draft, actions };
  });

  await act(async () => result.current.actions.saveVerifierConfig("pack-1", "judge", (verifier) => ({
    ...verifier,
    base_url: "after"
  })));

  expect((result.current.draft?.benchpacks["pack-1"]?.verifiers?.judge as { base_url?: string })?.base_url).toBe("before");
});
