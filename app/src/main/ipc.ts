import { promises as fs } from "node:fs";
import { BrowserWindow, dialog } from "electron";
import type {
  BenchLocalAgentEvent,
  BenchLocalChatRequest,
  BenchLocalChatStreamEvent,
  BenchLocalConfig,
  BenchLocalProviderConfig,
  BenchLocalWorkspaceState,
  GenerationRequest,
  ProgressEvent,
  WebBenchPackHistoryPayload
} from "@core";
import type { DetachedLogsState } from "@/shared/desktop-api";
import {
  IPC_CHANNELS,
  type IpcEventChannel,
  type IpcEventPayload
} from "@/shared/ipc-contract";
import { registerIpcHandler, registerIpcMessageHandler, sendIpcEvent } from "./ipc-helpers";
import { closeDetachedLogsWindow, openDetachedLogsWindow, publishDetachedLogsState } from "./log-window";
import { loadAppMetadata } from "./app-metadata";
import { listAvailableThemes, loadAvailableTheme } from "./themes";
import { checkForAppUpdates, getAppUpdateState, installDownloadedAppUpdate } from "./updater";
import { benchLocalController } from "./controller";
import { agentServer } from "./agent-server";

export function stopActiveBenchPackRunsForShutdown(options?: { timeoutMs?: number; intervalMs?: number }): Promise<void> {
  return benchLocalController.stopActiveBenchPackRunsForShutdown(options);
}

function sendToAllWindows<TChannel extends IpcEventChannel>(
  channel: TChannel,
  payload: IpcEventPayload<TChannel>
): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, payload);
  }
}

function forwardControllerEvent(event: BenchLocalAgentEvent): void {
  if (event.type === "benchpack.run.event") {
    const payload = event.payload as { tabId: string; benchPackId: string; event: ProgressEvent };
    sendToAllWindows(IPC_CHANNELS.benchPacks.runEvent, payload);
    return;
  }

  if (event.type === "verifier.event") {
    sendToAllWindows(IPC_CHANNELS.verifiers.progress, event.payload as IpcEventPayload<typeof IPC_CHANNELS.verifiers.progress>);
    return;
  }

  if (event.type === "config.updated") {
    sendToAllWindows(IPC_CHANNELS.config.updated, event.payload as IpcEventPayload<typeof IPC_CHANNELS.config.updated>);
    return;
  }

  if (event.type === "workspace.updated") {
    sendToAllWindows(IPC_CHANNELS.workspaces.updated, event.payload as IpcEventPayload<typeof IPC_CHANNELS.workspaces.updated>);
    return;
  }

  if (event.type === "agent.state.updated") {
    sendToAllWindows(IPC_CHANNELS.agent.state, event.payload as IpcEventPayload<typeof IPC_CHANNELS.agent.state>);
  }
}

export function registerIpcHandlers(): void {
  const preloadPath = new URL("../preload/index.js", import.meta.url).pathname;
  benchLocalController.onAgentEvent(forwardControllerEvent);

  registerIpcHandler(IPC_CHANNELS.config.load, async () => {
    return benchLocalController.loadConfig();
  });

  registerIpcHandler(IPC_CHANNELS.config.save, async (_event, config: BenchLocalConfig) => {
    return benchLocalController.saveConfig(config);
  });

  registerIpcHandler(IPC_CHANNELS.app.metadata, async () => {
    return loadAppMetadata();
  });

  registerIpcHandler(IPC_CHANNELS.updates.getState, async () => {
    return getAppUpdateState();
  });

  registerIpcHandler(IPC_CHANNELS.updates.check, async () => {
    return checkForAppUpdates();
  });

  registerIpcHandler(IPC_CHANNELS.updates.install, async () => {
    return installDownloadedAppUpdate();
  });

  registerIpcHandler(IPC_CHANNELS.models.discover, async (_event, input: { provider: BenchLocalProviderConfig }) => {
    return benchLocalController.discoverProviderModels(input.provider);
  });

  registerIpcHandler(IPC_CHANNELS.models.availability, async (_event, input: { config: BenchLocalConfig; modelIds?: string[] }) => {
    return benchLocalController.checkModelAvailability(input);
  });

  registerIpcHandler(IPC_CHANNELS.themes.list, async () => {
    return listAvailableThemes();
  });

  registerIpcHandler(IPC_CHANNELS.themes.load, async (_event, input: { themeId: string }) => {
    return loadAvailableTheme(input.themeId);
  });

  registerIpcHandler(IPC_CHANNELS.workspaces.load, async () => {
    return benchLocalController.loadWorkspaceState();
  });

  registerIpcHandler(IPC_CHANNELS.workspaces.save, async (_event, state: BenchLocalWorkspaceState) => {
    return benchLocalController.saveWorkspaceState(state);
  });

  registerIpcHandler(
    IPC_CHANNELS.workspaces.export,
    async (_event, input: { workspaceId: string; state: BenchLocalWorkspaceState }) => {
      const workspace = input.state.workspaces[input.workspaceId];

      if (!workspace) {
        throw new Error(`Workspace "${input.workspaceId}" was not found.`);
      }

      const tabs = Object.fromEntries(
        workspace.tabIds
          .map((tabId) => input.state.tabs[tabId])
          .filter((tab): tab is BenchLocalWorkspaceState["tabs"][string] => Boolean(tab))
          .map((tab) => [tab.id, tab])
      );

      const result = await dialog.showSaveDialog({
        title: "Export Workspace",
        defaultPath: `${workspace.name.replace(/[^\w.-]+/g, "-").toLowerCase() || "workspace"}.benchlocal-workspace.json`,
        filters: [{ name: "BenchLocal Workspace", extensions: ["json"] }]
      });

      if (result.canceled || !result.filePath) {
        return { exported: false };
      }

      await fs.writeFile(
        result.filePath,
        JSON.stringify(
          {
            schemaVersion: 1,
            exportedAt: new Date().toISOString(),
            workspace,
            tabs
          },
          null,
          2
        ),
        "utf8"
      );

      return { exported: true, filePath: result.filePath };
    }
  );

  registerIpcHandler(IPC_CHANNELS.workspaces.import, async () => {
    const result = await dialog.showOpenDialog({
      title: "Import Workspace",
      properties: ["openFile"],
      filters: [{ name: "BenchLocal Workspace", extensions: ["json"] }]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { imported: false };
    }

    const raw = await fs.readFile(result.filePaths[0], "utf8");
    const parsed = JSON.parse(raw) as {
      workspace?: BenchLocalWorkspaceState["workspaces"][string];
      tabs?: BenchLocalWorkspaceState["tabs"];
    };

    if (!parsed.workspace || !parsed.tabs) {
      throw new Error("Imported workspace file is missing workspace or tab data.");
    }

    return {
      imported: true,
      workspace: parsed.workspace,
      tabs: parsed.tabs
    };
  });

  registerIpcHandler(IPC_CHANNELS.benchPacks.list, async () => {
    return benchLocalController.listBenchPacks();
  });

  registerIpcHandler(IPC_CHANNELS.benchPacks.registry, async () => {
    return benchLocalController.loadBenchPackRegistry();
  });

  registerIpcHandler(IPC_CHANNELS.benchPacks.install, async (_event, input: { benchPackId: string }) => {
    return benchLocalController.installBenchPack(input.benchPackId, (progress) => {
      sendIpcEvent(_event.sender, IPC_CHANNELS.benchPacks.mutationProgress, progress);
    });
  });

  registerIpcHandler(IPC_CHANNELS.benchPacks.installFromUrl, async (_event, input: { url: string }) => {
    return benchLocalController.installBenchPackFromUrl(input.url, (progress) => {
      sendIpcEvent(_event.sender, IPC_CHANNELS.benchPacks.mutationProgress, progress);
    });
  });

  registerIpcHandler(IPC_CHANNELS.benchPacks.update, async (_event, input: { benchPackId: string }) => {
    return benchLocalController.updateBenchPack(input.benchPackId, (progress) => {
      sendIpcEvent(_event.sender, IPC_CHANNELS.benchPacks.mutationProgress, progress);
    });
  });

  registerIpcHandler(IPC_CHANNELS.benchPacks.uninstall, async (_event, input: { benchPackId: string }) => {
    return benchLocalController.uninstallBenchPack(input.benchPackId, (progress) => {
      sendIpcEvent(_event.sender, IPC_CHANNELS.benchPacks.mutationProgress, progress);
    });
  });

  registerIpcHandler(IPC_CHANNELS.benchPacks.activeRuns, async () => {
    return benchLocalController.listActiveRuns();
  });

  registerIpcHandler(IPC_CHANNELS.benchPacks.history, async (_event, input: { benchPackId: string }) => {
    return benchLocalController.listRunHistory(input.benchPackId);
  });

  registerIpcHandler(IPC_CHANNELS.benchPacks.loadHistory, async (_event, input: { benchPackId: string; runId: string }) => {
    return benchLocalController.loadRunHistory(input.benchPackId, input.runId);
  });

  registerIpcHandler(IPC_CHANNELS.benchPacks.clearHistory, async (_event, input: { benchPackId: string }) => {
    return benchLocalController.clearRunHistory(input.benchPackId);
  });

  registerIpcHandler(IPC_CHANNELS.benchPacks.deleteHistory, async (_event, input: { benchPackId: string; runIds: string[] }) => {
    return benchLocalController.deleteRunHistory(input.benchPackId, input.runIds);
  });

  registerIpcHandler(IPC_CHANNELS.webPacks.chat, async (_event, input: BenchLocalChatRequest) => {
    return benchLocalController.runWebPackChat(input);
  });

  registerIpcMessageHandler(
    IPC_CHANNELS.webPacks.streamChat,
    (
      event,
      input: {
        streamId: string;
        request: BenchLocalChatRequest;
      }
    ) => {
      const sendStreamEvent = (streamEvent: BenchLocalChatStreamEvent, done = false) => {
        sendIpcEvent(event.sender, IPC_CHANNELS.webPacks.streamEvent, {
          streamId: input.streamId,
          event: streamEvent,
          done
        });
      };

      void benchLocalController.streamWebPackChat(input.request, (streamEvent) => {
        sendStreamEvent(streamEvent, streamEvent.type === "done" || streamEvent.type === "error");
      }).catch((error) => {
        sendStreamEvent(
          {
            type: "error",
            modelId: input.request.modelId,
            message: error instanceof Error ? error.message : String(error)
          },
          true
        );
      });
    }
  );

  registerIpcHandler(
    IPC_CHANNELS.webPacks.saveHistory,
    async (
      _event,
      input: {
        benchPackId: string;
        runId?: string | null;
        modelIds?: string[];
        payload: WebBenchPackHistoryPayload;
      }
    ) => {
      return benchLocalController.saveWebPackHistory(input);
    }
  );

  registerIpcHandler(
    IPC_CHANNELS.webPacks.writeArtifact,
    async (
      _event,
      input: {
        benchPackId: string;
        runId?: string | null;
        modelIds?: string[];
        artifact: {
          kind: string;
          label: string;
          path?: string;
          contentType?: string;
          content: unknown;
        };
      }
    ) => {
      return benchLocalController.writeWebPackArtifact(input);
    }
  );

  registerIpcHandler(IPC_CHANNELS.verifiers.list, async () => {
    return benchLocalController.listVerifiers();
  });

  registerIpcHandler(IPC_CHANNELS.verifiers.start, async (_event, input: { benchPackId: string }) => {
    return benchLocalController.startVerifier(input.benchPackId);
  });

  registerIpcHandler(IPC_CHANNELS.verifiers.stop, async (_event, input: { benchPackId: string }) => {
    return benchLocalController.stopVerifier(input.benchPackId);
  });

  registerIpcHandler(IPC_CHANNELS.verifiers.cancelStart, async (_event, input: { benchPackId: string }) => {
    return benchLocalController.cancelVerifierStart(input.benchPackId);
  });

  registerIpcHandler(IPC_CHANNELS.verifiers.deleteImage, async (_event, input: { benchPackId: string; verifierId: string }) => {
    return benchLocalController.deleteVerifierImage(input.benchPackId, input.verifierId);
  });

  registerIpcHandler(IPC_CHANNELS.logs.openDetached, async () => {
    await openDetachedLogsWindow(preloadPath);
    return { opened: true };
  });

  registerIpcHandler(IPC_CHANNELS.logs.closeDetached, async () => {
    return { closed: closeDetachedLogsWindow() };
  });

  registerIpcHandler(IPC_CHANNELS.logs.publishState, async (_event, state: DetachedLogsState) => {
    publishDetachedLogsState(state);
  });

  registerIpcHandler(
    IPC_CHANNELS.benchPacks.run,
    async (
      _event,
      input: {
        tabId: string;
        benchPackId: string;
        modelIds?: string[];
        executionMode?: "serial" | "serial_by_model" | "parallel_by_model" | "parallel_by_test_case" | "full_parallel";
        runsPerTest?: number;
        generation?: GenerationRequest;
      }
    ) => {
      return benchLocalController.runBenchPack(input);
    }
  );

  registerIpcHandler(
    IPC_CHANNELS.benchPacks.retryScenario,
    async (
      _event,
      input: {
        tabId: string;
        benchPackId: string;
        runId: string;
        scenarioId: string;
        modelId: string;
        runsPerTest?: number;
        generation?: GenerationRequest;
      }
    ) => {
      return benchLocalController.retryScenario(input);
    }
  );

  registerIpcHandler(
    IPC_CHANNELS.benchPacks.resumeRun,
    async (
      _event,
      input: {
        tabId: string;
        benchPackId: string;
        runId: string;
        executionMode?: "serial" | "serial_by_model" | "parallel_by_model" | "parallel_by_test_case" | "full_parallel";
        runsPerTest?: number;
        generation?: GenerationRequest;
      }
    ) => {
      return benchLocalController.resumeRun(input);
    }
  );

  registerIpcHandler(IPC_CHANNELS.benchPacks.stop, async (_event, input: { tabId: string }) => {
    return benchLocalController.stopRun(input.tabId);
  });

  registerIpcHandler(IPC_CHANNELS.agent.getState, async () => {
    return agentServer.getState();
  });

  registerIpcHandler(IPC_CHANNELS.agent.configure, async (_event, input: { enabled: boolean; port?: number }) => {
    return agentServer.configure(input);
  });

  registerIpcHandler(IPC_CHANNELS.agent.regenerateToken, async () => {
    return agentServer.regenerateToken();
  });
}
