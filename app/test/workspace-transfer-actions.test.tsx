// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useWorkspaceTransferActions } from "../src/renderer/src/features/workspaces/useWorkspaceTransferActions";
import type { BenchLocalWorkspaceState } from "@core";

afterEach(() => Reflect.deleteProperty(window, "benchlocal"));

it("passes the current workspace state to export", async () => {
  const state = { workspaces: {}, tabs: {} } as BenchLocalWorkspaceState;
  const exportWorkspace = vi.fn().mockResolvedValue({ exported: false });
  Object.defineProperty(window, "benchlocal", {
    configurable: true,
    value: { workspaces: { export: exportWorkspace } }
  });
  const { result } = renderHook(() => useWorkspaceTransferActions({
    workspaceState: state,
    updateWorkspaceState: vi.fn(),
    setAppNotice: vi.fn(),
    setError: vi.fn()
  }));

  await result.current.exportWorkspace("workspace-1");

  expect(exportWorkspace).toHaveBeenCalledWith({ workspaceId: "workspace-1", state });
});
