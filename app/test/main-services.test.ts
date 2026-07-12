import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { AgentEventBus } from "../src/main/services/agent-event-bus.js";
import { ConfigService } from "../src/main/services/config-service.js";
import { WorkspaceService } from "../src/main/services/workspace-service.js";

const tempRoots: string[] = [];

async function createServices() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "benchlocal-main-services-test-"));
  tempRoots.push(root);
  vi.spyOn(os, "homedir").mockReturnValue(root);

  const eventBus = new AgentEventBus();
  const configService = new ConfigService(eventBus);
  const workspaceService = new WorkspaceService(eventBus, configService);
  await configService.loadConfig();

  return { eventBus, configService, workspaceService };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("main process domain services", () => {
  it("publishes typed agent events and supports unsubscribe", () => {
    const eventBus = new AgentEventBus();
    const listener = vi.fn();
    const unsubscribe = eventBus.onAgentEvent(listener);

    const event = eventBus.emitAgentEvent("agent.state.updated", { running: true });
    expect(event).toMatchObject({
      type: "agent.state.updated",
      payload: { running: true }
    });
    expect(event.eventId).toMatch(/^evt-/);
    expect(listener).toHaveBeenCalledOnce();

    unsubscribe();
    eventBus.emitAgentEvent("agent.state.updated", { running: false });
    expect(listener).toHaveBeenCalledOnce();
  });

  it("redacts provider secrets before publishing config updates", async () => {
    const { eventBus, configService } = await createServices();
    const listener = vi.fn();
    eventBus.onAgentEvent(listener);
    const { config } = await configService.loadConfig();

    config.providers.local = {
      kind: "openai_compatible",
      name: "Local",
      enabled: true,
      base_url: "http://127.0.0.1:11434",
      api_key: "secret-token",
      api_key_env: "LOCAL_API_KEY"
    };
    await configService.saveConfig(config);

    const update = listener.mock.calls[0][0];
    expect(update.type).toBe("config.updated");
    expect(update.payload.config.providers.local).toEqual({
      kind: "openai_compatible",
      name: "Local",
      enabled: true,
      base_url: "http://127.0.0.1:11434",
      api_key_env: "LOCAL_API_KEY",
      has_api_key: true,
      has_api_key_env: true
    });
    expect(update.payload.config.providers.local).not.toHaveProperty("api_key");
  });

  it("normalizes tab model selections and publishes the persisted workspace", async () => {
    const { eventBus, configService, workspaceService } = await createServices();
    const loadedConfig = await configService.loadConfig();
    loadedConfig.config.providers.local = {
      kind: "openai_compatible",
      name: "Local",
      enabled: true,
      base_url: "http://127.0.0.1:11434"
    };
    loadedConfig.config.models = [
      { id: "enabled-model", provider: "local", model: "enabled", label: "Enabled", group: "Local", enabled: true },
      { id: "disabled-model", provider: "local", model: "disabled", label: "Disabled", group: "Local", enabled: false }
    ];
    await configService.saveConfig(loadedConfig.config);

    const loadedWorkspace = await workspaceService.loadWorkspaceState();
    const workspaceId = loadedWorkspace.state.activeWorkspaceId!;
    const listener = vi.fn();
    eventBus.onAgentEvent(listener);

    const result = await workspaceService.createWorkspaceTab(workspaceId, {
      benchPackId: "my-bench_pack",
      modelSelections: [
        { modelId: " enabled-model ", alias: " Primary " },
        { modelId: "enabled-model" },
        { modelId: "disabled-model" },
        { modelId: "missing-model" }
      ]
    });
    const createdTab = result.state.tabs[result.state.workspaces[workspaceId].activeTabId!];

    expect(createdTab.title).toBe("My Bench Pack");
    expect(createdTab.modelSelections).toEqual([{ modelId: "enabled-model", alias: "Primary" }]);
    expect(result.state.workspaces[workspaceId].modelSelections).toEqual([
      { modelId: "enabled-model", alias: "Primary" }
    ]);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0]).toMatchObject({
      type: "workspace.updated",
      payload: { state: result.state }
    });
  });

  it("does not publish workspace updates when a mutation fails", async () => {
    const { eventBus, workspaceService } = await createServices();
    const listener = vi.fn();
    eventBus.onAgentEvent(listener);

    await expect(workspaceService.createWorkspaceTab("missing-workspace", {})).rejects.toThrow(
      'Workspace "missing-workspace" was not found.'
    );
    expect(listener).not.toHaveBeenCalled();
  });
});
