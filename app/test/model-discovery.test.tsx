// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useModelDiscovery } from "../src/renderer/src/features/models/useModelDiscovery";
import type { BenchLocalConfig } from "@core";
import type { ModelBrowserModalState } from "../src/renderer/src/features/models/ModelBrowserModal";

afterEach(() => Reflect.deleteProperty(window, "benchlocal"));

function renderDiscovery(cache: Record<string, Array<{ id: string }>> = {}) {
  const draft = { providers: { providerA: { kind: "openai_compatible", name: "Provider A", enabled: true, base_url: "http://localhost" } } } as unknown as BenchLocalConfig;
  return renderHook(() => {
    const [modal, setModal] = useState<ModelBrowserModalState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const actions = useModelDiscovery({
      draft,
      modelModal: { mode: "create", form: { id: "", provider: "providerA", model: "", label: "", group: "default", enabled: true } },
      cacheRef: useRef(cache),
      setModelBrowserModal: setModal,
      setError
    });
    return { modal, error, actions };
  });
}

it("uses cached discovered models without another desktop API call", async () => {
  const discover = vi.fn();
  Object.defineProperty(window, "benchlocal", { configurable: true, value: { models: { discover } } });
  const { result } = renderDiscovery({ "openai_compatible::http://localhost": [{ id: "cached-model" }] });

  await act(async () => { await result.current.actions.openModelBrowser(); });

  expect(discover).not.toHaveBeenCalled();
  expect(result.current.modal).toMatchObject({ loading: false, selectedModelId: "cached-model" });
});

it("shows discovery errors in the browser modal", async () => {
  Object.defineProperty(window, "benchlocal", { configurable: true, value: { models: { discover: vi.fn().mockRejectedValue(new Error("offline")) } } });
  const { result } = renderDiscovery();

  await act(async () => { await result.current.actions.openModelBrowser(); });

  expect(result.current.modal).toMatchObject({ loading: false, error: "offline" });
});
