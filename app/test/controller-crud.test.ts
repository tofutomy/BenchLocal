import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { BenchLocalController } from "../src/main/controller.js";
import { loadConfigFile, loadOrCreateConfig, loadWorkspaceStateFile } from "@core";

const tempRoots: string[] = [];

async function createIsolatedHome(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "benchlocal-controller-test-"));
  tempRoots.push(root);
  vi.spyOn(os, "homedir").mockReturnValue(root);
  await loadOrCreateConfig(path.join(root, ".benchlocal", "config.toml"));
  return root;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("BenchLocalController provider/model/workspace mutations", () => {
  it("creates providers and models through the persisted config boundary", async () => {
    const root = await createIsolatedHome();
    const controller = new BenchLocalController();

    await controller.createProvider({
      id: "local",
      kind: "openai_compatible",
      name: "Local",
      base_url: "http://127.0.0.1:11434"
    });
    await controller.createModel({
      id: "local-model",
      provider: "local",
      model: "llama3",
      label: "Local Model"
    });

    const config = await loadConfigFile(path.join(root, ".benchlocal", "config.toml"));
    expect(config.providers.local).toMatchObject({ name: "Local", base_url: "http://127.0.0.1:11434" });
    expect(config.models).toEqual([
      expect.objectContaining({ id: "local-model", provider: "local", model: "llama3", label: "Local Model" })
    ]);
  });

  it("removes provider models from workspace selections when deleting a provider", async () => {
    const root = await createIsolatedHome();
    const controller = new BenchLocalController();
    await controller.createProvider({
      id: "local",
      kind: "openai_compatible",
      name: "Local",
      base_url: "http://127.0.0.1:11434"
    });
    await controller.createModel({ id: "local-model", provider: "local", model: "llama3", label: "Local Model" });

    const loadedWorkspace = await controller.loadWorkspaceState();
    const tabId = Object.keys(loadedWorkspace.state.tabs)[0];
    await controller.selectTabModels(tabId, { modelIds: ["local-model"] });
    await controller.deleteProvider("local");

    const config = await loadConfigFile(path.join(root, ".benchlocal", "config.toml"));
    const workspace = await loadWorkspaceStateFile(path.join(root, ".benchlocal", "state.json"));
    expect(config.providers.local).toBeUndefined();
    expect(config.models).toEqual([]);
    expect(workspace.tabs[tabId].modelSelections).toEqual([]);
  });
});
