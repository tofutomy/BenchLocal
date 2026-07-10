// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useProviderConfigActions } from "../src/renderer/src/features/models/useProviderConfigActions";
import type { BenchLocalConfig, BenchLocalWorkspaceState } from "@core";

it("deletes linked models and removes their selections from every tab", async () => {
  const draft = {
    providers: {
      providerA: { kind: "openai_compatible", name: "Provider A", enabled: true, base_url: "http://localhost" },
      providerB: { kind: "openai_compatible", name: "Provider B", enabled: true, base_url: "http://localhost" }
    },
    models: [
      { id: "model-a", provider: "providerA", model: "a", label: "A", group: "default", enabled: true },
      { id: "model-b", provider: "providerB", model: "b", label: "B", group: "default", enabled: true }
    ]
  } as unknown as BenchLocalConfig;
  let workspace = {
    tabs: { "tab-1": { modelSelections: [{ modelId: "model-a" }, { modelId: "model-b" }] } }
  } as unknown as BenchLocalWorkspaceState;
  const persistConfig = vi.fn().mockResolvedValue(true);
  const updateWorkspaceState = vi.fn((updater) => {
    workspace = updater(workspace);
  });

  const { result } = renderHook(() =>
    useProviderConfigActions({
      draft,
      loadState: null,
      providerModal: null,
      persistConfig,
      updateWorkspaceState,
      setProviderModal: vi.fn()
    })
  );

  await expect(result.current.deleteProvider("providerA")).resolves.toBe(true);

  expect(persistConfig.mock.calls[0]?.[0].models.map((model: { id: string }) => model.id)).toEqual(["model-b"]);
  expect(workspace.tabs["tab-1"]?.modelSelections).toEqual([{ modelId: "model-b" }]);
});
