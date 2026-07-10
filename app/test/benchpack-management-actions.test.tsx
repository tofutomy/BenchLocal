// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useBenchPackManagementActions } from "../src/renderer/src/features/benchpacks/useBenchPackManagementActions";

afterEach(() => Reflect.deleteProperty(window, "benchlocal"));

it("refuses to uninstall a Bench Pack with an active run", async () => {
  const uninstall = vi.fn();
  Object.defineProperty(window, "benchlocal", { configurable: true, value: { benchPacks: { uninstall } } });
  const { result } = renderHook(() => {
    const [error, setError] = useState<string | null>(null);
    const actions = useBenchPackManagementActions({
      registryEntries: [],
      activeRuns: { "tab-1": { benchPackId: "pack-1", mode: "host" } },
      hasUnsavedChanges: false,
      settingsOpenRef: { current: false },
      save: vi.fn().mockResolvedValue(true),
      setLoadState: vi.fn(),
      setDraft: vi.fn(),
      setBenchPackInspections: vi.fn(),
      setRegistryEntries: vi.fn(),
      setRegistryWarning: vi.fn(),
      setVerifierStatuses: vi.fn(),
      setBenchPackMutations: vi.fn(),
      setIsBusy: vi.fn(),
      setSettingsNotice: vi.fn(),
      setError
    });
    return { error, actions };
  });

  await act(async () => result.current.actions.uninstallInstalledBenchPack("pack-1"));

  expect(uninstall).not.toHaveBeenCalled();
  expect(result.current.error).toBe("Stop active Bench Pack runs before uninstalling this pack.");
});
