// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useModelAvailabilityActions } from "../src/renderer/src/features/models/useModelAvailabilityActions";
import type { BenchLocalConfig, ModelAvailability } from "@core";
import type { ResolvedTabModel } from "../src/renderer/src/features/models/model-config";

afterEach(() => Reflect.deleteProperty(window, "benchlocal"));

it("stores availability and clears the checking state", async () => {
  const entry = { modelId: "model-1", providerId: "provider-1", status: "online" } as ModelAvailability;
  Object.defineProperty(window, "benchlocal", {
    configurable: true,
    value: { models: { availability: vi.fn().mockResolvedValue([entry]) } }
  });
  const { result } = renderHook(() => {
    const [availability, setAvailability] = useState<Record<string, ModelAvailability>>({});
    const [checking, setChecking] = useState<Record<string, true>>({});
    const actions = useModelAvailabilityActions({
      draft: {} as BenchLocalConfig,
      defaultModels: [{ id: "model-1" } as ResolvedTabModel],
      requestRef: useRef(0),
      pendingRef: useRef({}),
      setModelAvailabilityById: setAvailability,
      setCheckingModelAvailability: setChecking,
      setError: () => undefined
    });
    return { availability, checking, actions };
  });

  await act(async () => result.current.actions.refreshModelAvailability());

  expect(result.current.availability["model-1"]).toBe(entry);
  expect(result.current.checking).toEqual({});
});
