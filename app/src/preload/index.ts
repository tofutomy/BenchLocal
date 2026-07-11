import { contextBridge } from "electron";
import type { BenchLocalDesktopApi } from "@/shared/desktop-api";
import { IPC_CHANNELS } from "@/shared/ipc-contract";
import { invokeIpc, onIpcEvent, sendIpcMessage } from "./ipc-helpers";

const api: BenchLocalDesktopApi = {
  app: {
    metadata: () => invokeIpc(IPC_CHANNELS.app.metadata),
    onOpenAbout: (listener) => onIpcEvent(IPC_CHANNELS.app.openAbout, listener),
    onOpenSettings: (listener) => onIpcEvent(IPC_CHANNELS.app.openSettings, listener)
  },
  updates: {
    state: () => invokeIpc(IPC_CHANNELS.updates.getState),
    check: () => invokeIpc(IPC_CHANNELS.updates.check),
    install: () => invokeIpc(IPC_CHANNELS.updates.install),
    onState: (listener) => onIpcEvent(IPC_CHANNELS.updates.state, listener)
  },
  config: {
    load: () => invokeIpc(IPC_CHANNELS.config.load),
    save: (config) => invokeIpc(IPC_CHANNELS.config.save, config),
    onUpdated: (listener) => onIpcEvent(IPC_CHANNELS.config.updated, listener)
  },
  agent: {
    state: () => invokeIpc(IPC_CHANNELS.agent.getState),
    configure: (input) => invokeIpc(IPC_CHANNELS.agent.configure, input),
    regenerateToken: () => invokeIpc(IPC_CHANNELS.agent.regenerateToken),
    onState: (listener) => onIpcEvent(IPC_CHANNELS.agent.state, listener)
  },
  models: {
    discover: (input) => invokeIpc(IPC_CHANNELS.models.discover, input),
    availability: (input) => invokeIpc(IPC_CHANNELS.models.availability, input)
  },
  themes: {
    list: () => invokeIpc(IPC_CHANNELS.themes.list),
    load: (input) => invokeIpc(IPC_CHANNELS.themes.load, input)
  },
  workspaces: {
    load: () => invokeIpc(IPC_CHANNELS.workspaces.load),
    save: (state) => invokeIpc(IPC_CHANNELS.workspaces.save, state),
    export: (input) => invokeIpc(IPC_CHANNELS.workspaces.export, input),
    import: () => invokeIpc(IPC_CHANNELS.workspaces.import),
    onUpdated: (listener) => onIpcEvent(IPC_CHANNELS.workspaces.updated, listener)
  },
  benchPacks: {
    list: () => invokeIpc(IPC_CHANNELS.benchPacks.list),
    registry: () => invokeIpc(IPC_CHANNELS.benchPacks.registry),
    install: (input) => invokeIpc(IPC_CHANNELS.benchPacks.install, input),
    installFromUrl: (input) => invokeIpc(IPC_CHANNELS.benchPacks.installFromUrl, input),
    update: (input) => invokeIpc(IPC_CHANNELS.benchPacks.update, input),
    uninstall: (input) => invokeIpc(IPC_CHANNELS.benchPacks.uninstall, input),
    onMutationProgress: (listener) => onIpcEvent(IPC_CHANNELS.benchPacks.mutationProgress, listener),
    activeRuns: () => invokeIpc(IPC_CHANNELS.benchPacks.activeRuns),
    run: (input) => invokeIpc(IPC_CHANNELS.benchPacks.run, input),
    retryScenario: (input) => invokeIpc(IPC_CHANNELS.benchPacks.retryScenario, input),
    resumeRun: (input) => invokeIpc(IPC_CHANNELS.benchPacks.resumeRun, input),
    stop: (input) => invokeIpc(IPC_CHANNELS.benchPacks.stop, input),
    history: (input) => invokeIpc(IPC_CHANNELS.benchPacks.history, input),
    loadHistory: (input) => invokeIpc(IPC_CHANNELS.benchPacks.loadHistory, input),
    clearHistory: (input) => invokeIpc(IPC_CHANNELS.benchPacks.clearHistory, input),
    deleteHistory: (input) => invokeIpc(IPC_CHANNELS.benchPacks.deleteHistory, input),
    onRunEvent: (listener) => onIpcEvent(IPC_CHANNELS.benchPacks.runEvent, listener)
  },
  webPacks: {
    chat: (input) => invokeIpc(IPC_CHANNELS.webPacks.chat, input),
    streamChat: (input, listener) => {
      const unsubscribe = onIpcEvent(IPC_CHANNELS.webPacks.streamEvent, (payload) => {
        if (payload.streamId === input.streamId) listener(payload);
      });
      sendIpcMessage(IPC_CHANNELS.webPacks.streamChat, input);
      return unsubscribe;
    },
    saveHistory: (input) => invokeIpc(IPC_CHANNELS.webPacks.saveHistory, input),
    writeArtifact: (input) => invokeIpc(IPC_CHANNELS.webPacks.writeArtifact, input)
  },
  verifiers: {
    list: () => invokeIpc(IPC_CHANNELS.verifiers.list),
    start: (input) => invokeIpc(IPC_CHANNELS.verifiers.start, input),
    stop: (input) => invokeIpc(IPC_CHANNELS.verifiers.stop, input),
    cancelStart: (input) => invokeIpc(IPC_CHANNELS.verifiers.cancelStart, input),
    deleteImage: (input) => invokeIpc(IPC_CHANNELS.verifiers.deleteImage, input),
    onProgress: (listener) => onIpcEvent(IPC_CHANNELS.verifiers.progress, listener)
  },
  logs: {
    openDetachedWindow: () => invokeIpc(IPC_CHANNELS.logs.openDetached),
    closeDetachedWindow: () => invokeIpc(IPC_CHANNELS.logs.closeDetached),
    publishDetachedState: (state) => invokeIpc(IPC_CHANNELS.logs.publishState, state),
    onDetachedState: (listener) => onIpcEvent(IPC_CHANNELS.logs.state, listener),
    onDetachedWindowClosed: (listener) => onIpcEvent(IPC_CHANNELS.logs.closed, listener)
  }
};

contextBridge.exposeInMainWorld("benchlocal", api);
