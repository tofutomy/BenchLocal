// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useModelConfigActions } from "../src/renderer/src/features/models/useModelConfigActions";
import type { BenchLocalConfig, BenchLocalWorkspaceState } from "@core";

it("migrates tab selections when an edited model receives a new ID", async () => {
  const draft = {
    providers: { providerA: { kind: "openai_compatible", name: "Provider A", enabled: true, base_url: "http://localhost" } },
    models: [{ id: "old-id", provider: "providerA", model: "old", label: "Old", group: "default", enabled: true }]
  } as unknown as BenchLocalConfig;
  let workspace = { tabs: { "tab-1": { modelSelections: [{ modelId: "old-id" }] } } } as unknown as BenchLocalWorkspaceState;
  const persistConfig = vi.fn().mockResolvedValue(true);
  const { result } = renderHook(() =>
    useModelConfigActions({
      draft,
      loadState: null,
      modelModal: { mode: "edit", index: 0, form: { id: "new-id", provider: "providerA", model: "new", label: "New", group: "default", enabled: true } },
      persistConfig,
      updateWorkspaceState: (updater) => { workspace = updater(workspace); },
      setError: vi.fn(),
      setModelModal: vi.fn()
    })
  );

  await result.current.saveModelModal();

  expect(persistConfig.mock.calls[0]?.[0].models[0]?.id).toBe("new-id");
  expect(workspace.tabs["tab-1"]?.modelSelections).toEqual([{ modelId: "new-id" }]);
});
