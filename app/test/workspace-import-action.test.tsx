// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useWorkspaceTransferActions } from "../src/renderer/src/features/workspaces/useWorkspaceTransferActions";
import type { BenchLocalWorkspaceState } from "@core";

afterEach(() => Reflect.deleteProperty(window, "benchlocal"));

it("remaps imported IDs and accepts the legacy pluginId field", async () => {
  const imported = {
    imported: true,
    workspace: { id: "old-workspace", name: "Existing", tabIds: ["old-tab"], activeTabId: "old-tab" },
    tabs: {
      "old-tab": {
        id: "old-tab",
        title: "Imported",
        pluginId: "legacy-pack",
        focusedScenarioId: null,
        modelSelections: []
      }
    }
  };
  Object.defineProperty(window, "benchlocal", {
    configurable: true,
    value: { workspaces: { import: vi.fn().mockResolvedValue(imported) } }
  });
  vi.spyOn(crypto, "randomUUID")
    .mockReturnValueOnce("00000000-0000-0000-0000-000000000001")
    .mockReturnValueOnce("00000000-0000-0000-0000-000000000002");
  const initial = {
    schema_version: 1,
    activeWorkspaceId: "existing",
    workspaceOrder: ["existing"],
    workspaces: { existing: { id: "existing", name: "Existing", tabIds: [], activeTabId: null, createdAt: "now", updatedAt: "now" } },
    tabs: {}
  } as BenchLocalWorkspaceState;
  const { result } = renderHook(() => {
    const [state, setState] = useState(initial);
    const actions = useWorkspaceTransferActions({
      workspaceState: state,
      updateWorkspaceState: (updater) => setState((current) => updater(structuredClone(current))),
      setAppNotice: vi.fn(),
      setError: vi.fn()
    });
    return { state, actions };
  });

  await act(async () => result.current.actions.importWorkspace());

  const workspaceId = "workspace-00000000-0000-0000-0000-000000000001";
  const tabId = "tab-00000000-0000-0000-0000-000000000002";
  expect(result.current.state.workspaces[workspaceId]?.name).toBe("Existing Imported");
  expect(result.current.state.workspaces[workspaceId]?.activeTabId).toBe(tabId);
  expect(result.current.state.tabs[tabId]?.benchPackId).toBe("legacy-pack");
});
