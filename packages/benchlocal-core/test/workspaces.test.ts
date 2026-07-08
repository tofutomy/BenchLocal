import { afterEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createDefaultWorkspaceState,
  loadOrCreateWorkspaceState,
  loadWorkspaceStateFile,
  saveWorkspaceStateFile
} from "../src/workspaces.js";

const tempRoots: string[] = [];

async function createTempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "benchlocal-workspace-test-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("workspace state persistence", () => {
  it("creates a default workspace with the requested default Bench Pack", async () => {
    const root = await createTempRoot();
    const statePath = path.join(root, "state.json");

    const result = await loadOrCreateWorkspaceState(statePath, "default-pack");
    const tab = result.state.tabs[Object.keys(result.state.tabs)[0]];

    expect(result.created).toBe(true);
    expect(tab.title).toBe("default-pack");
    expect(tab.benchPackId).toBe("default-pack");
    await expect(fs.stat(statePath)).resolves.toBeDefined();
  });

  it("normalizes legacy tab fields and removes invalid workspace references", async () => {
    const root = await createTempRoot();
    const statePath = path.join(root, "state.json");
    const now = new Date().toISOString();

    await fs.writeFile(
      statePath,
      JSON.stringify(
        {
          schema_version: 1,
          activeWorkspaceId: "missing-workspace",
          workspaceOrder: ["missing-workspace", "workspace-1"],
          workspaces: {
            "workspace-1": {
              id: "workspace-1",
              name: "Workspace",
              tabIds: ["missing-tab", "tab-1"],
              activeTabId: "missing-tab",
              createdAt: now,
              updatedAt: now
            }
          },
          tabs: {
            "tab-1": {
              id: "tab-1",
              title: "Legacy Tab",
              pluginId: "legacy-pack",
              focusedScenarioId: null,
              modelSelections: [{ modelId: "model-a" }],
              samplingOverrides: { temperature: 0.2 },
              executionMode: "parallel_models",
              runsPerTest: 2,
              createdAt: now,
              updatedAt: now
            }
          }
        },
        null,
        2
      ),
      "utf8"
    );

    const state = await loadWorkspaceStateFile(statePath);

    expect(state.activeWorkspaceId).toBe("workspace-1");
    expect(state.workspaceOrder).toEqual(["workspace-1"]);
    expect(state.workspaces["workspace-1"].tabIds).toEqual(["tab-1"]);
    expect(state.workspaces["workspace-1"].activeTabId).toBe("tab-1");
    expect(state.tabs["tab-1"]).toMatchObject({
      benchPackId: "legacy-pack",
      executionMode: "parallel_by_model",
      runsPerTest: 1,
      loadedRunId: null
    });
    expect(state.tabs["tab-1"].modelSelections).toEqual([{ modelId: "model-a" }]);
  });

  it("saves a normalized workspace state", async () => {
    const root = await createTempRoot();
    const statePath = path.join(root, "nested", "state.json");
    const state = createDefaultWorkspaceState();
    const tabId = Object.keys(state.tabs)[0];
    state.tabs[tabId].runsPerTest = 4;

    const saved = await saveWorkspaceStateFile(state, statePath);

    expect(saved.tabs[tabId].runsPerTest).toBe(1);
    await expect(fs.stat(statePath)).resolves.toBeDefined();
  });
});

