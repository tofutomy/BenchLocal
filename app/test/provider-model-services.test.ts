import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { AgentEventBus } from "../src/main/services/agent-event-bus.js";
import { ConfigService } from "../src/main/services/config-service.js";
import { ModelService } from "../src/main/services/model-service.js";
import { ProviderService } from "../src/main/services/provider-service.js";
import { WorkspaceService } from "../src/main/services/workspace-service.js";

const tempRoots: string[] = [];

async function createServices() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "benchlocal-provider-model-services-test-"));
  tempRoots.push(root);
  vi.spyOn(os, "homedir").mockReturnValue(root);

  const eventBus = new AgentEventBus();
  const configService = new ConfigService(eventBus);
  const workspaceService = new WorkspaceService(eventBus, configService);
  const providerService = new ProviderService(configService, workspaceService);
  const modelService = new ModelService(eventBus, configService, workspaceService);
  await configService.loadConfig();

  return { configService, workspaceService, providerService, modelService };
}

async function createLocalModel(
  providerService: ProviderService,
  modelService: ModelService,
  modelId = "local-model"
) {
  await providerService.createProvider({
    id: "local",
    kind: "openai_compatible",
    name: "Local",
    base_url: "http://127.0.0.1:11434"
  });
  await modelService.createModel({
    id: modelId,
    provider: "local",
    model: "llama3",
    label: "Local Model"
  });
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("provider and model services", () => {
  it("migrates every workspace selection when a model id changes", async () => {
    const { workspaceService, providerService, modelService } = await createServices();
    await createLocalModel(providerService, modelService);
    const loadedWorkspace = await workspaceService.loadWorkspaceState();
    const originalTabId = Object.keys(loadedWorkspace.state.tabs)[0];
    const workspaceId = loadedWorkspace.state.activeWorkspaceId!;
    const created = await workspaceService.createWorkspaceTab(workspaceId, {});
    const secondTabId = created.state.workspaces[workspaceId].activeTabId!;
    await workspaceService.selectTabModels(originalTabId, { modelIds: ["local-model"] });
    await workspaceService.selectTabModels(secondTabId, { modelIds: ["local-model"] });

    await modelService.updateModel("local-model", { id: "renamed-model" });

    const updatedWorkspace = await workspaceService.loadWorkspaceState();
    expect(updatedWorkspace.state.tabs[originalTabId].modelSelections).toEqual([{ modelId: "renamed-model" }]);
    expect(updatedWorkspace.state.tabs[secondTabId].modelSelections).toEqual([{ modelId: "renamed-model" }]);
  });

  it("removes provider models and all workspace references as one domain operation", async () => {
    const { configService, workspaceService, providerService, modelService } = await createServices();
    await createLocalModel(providerService, modelService);
    const loadedWorkspace = await workspaceService.loadWorkspaceState();
    const tabId = Object.keys(loadedWorkspace.state.tabs)[0];
    await workspaceService.selectTabModels(tabId, { modelIds: ["local-model"] });

    const result = await providerService.deleteProvider("local");

    const persistedConfig = await configService.loadConfig();
    const persistedWorkspace = await workspaceService.loadWorkspaceState();
    expect(result.removedModelIds).toEqual(["local-model"]);
    expect(persistedConfig.config.providers.local).toBeUndefined();
    expect(persistedConfig.config.models).toEqual([]);
    expect(persistedWorkspace.state.tabs[tabId].modelSelections).toEqual([]);
  });

  it("rejects model id collisions without changing persisted configuration", async () => {
    const { configService, providerService, modelService } = await createServices();
    await createLocalModel(providerService, modelService, "first-model");
    await modelService.createModel({
      id: "second-model",
      provider: "local",
      model: "llama3.1",
      label: "Second Model"
    });

    await expect(modelService.updateModel("first-model", { id: "second-model" })).rejects.toThrow(
      'Model "second-model" already exists.'
    );

    const persisted = await configService.loadConfig();
    expect(persisted.config.models.map((model) => model.id)).toEqual(["first-model", "second-model"]);
  });

  it("creates deterministic copy labels while keeping generated ids unique", async () => {
    const { providerService, modelService } = await createServices();
    await createLocalModel(providerService, modelService);

    const firstProviderCopy = await providerService.duplicateProvider("local");
    const secondProviderCopy = await providerService.duplicateProvider("local");
    const firstModelCopy = await modelService.duplicateModel("local-model");
    const secondModelCopy = await modelService.duplicateModel("local-model");

    expect(firstProviderCopy.provider.name).toBe("Local Copy");
    expect(secondProviderCopy.provider.name).toBe("Local Copy 2");
    expect(firstProviderCopy.providerId).not.toBe(secondProviderCopy.providerId);
    expect(firstModelCopy.model.label).toBe("Local Model Copy");
    expect(secondModelCopy.model.label).toBe("Local Model Copy 2");
    expect(firstModelCopy.modelId).not.toBe(secondModelCopy.modelId);
  });
});
