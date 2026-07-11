import type { BenchLocalDesktopApi } from "./desktop-api";

// 所有 Electron channel 只在此处命名，main 与 preload 通过同一字面量类型保持同步。
export const IPC_CHANNELS = {
  app: {
    metadata: "benchlocal:app:metadata",
    openAbout: "benchlocal:app:open-about",
    openSettings: "benchlocal:app:open-settings"
  },
  updates: {
    getState: "benchlocal:updates:get-state",
    check: "benchlocal:updates:check",
    install: "benchlocal:updates:install",
    state: "benchlocal:updates:state"
  },
  config: {
    load: "benchlocal:config:load",
    save: "benchlocal:config:save",
    updated: "benchlocal:config:updated"
  },
  agent: {
    getState: "benchlocal:agent:get-state",
    configure: "benchlocal:agent:configure",
    regenerateToken: "benchlocal:agent:regenerate-token",
    state: "benchlocal:agent:state"
  },
  models: {
    discover: "benchlocal:models:discover",
    availability: "benchlocal:models:availability"
  },
  themes: {
    list: "benchlocal:themes:list",
    load: "benchlocal:themes:load"
  },
  workspaces: {
    load: "benchlocal:workspaces:load",
    save: "benchlocal:workspaces:save",
    export: "benchlocal:workspaces:export",
    import: "benchlocal:workspaces:import",
    updated: "benchlocal:workspaces:updated"
  },
  benchPacks: {
    list: "benchlocal:benchpacks:list",
    registry: "benchlocal:benchpacks:registry",
    install: "benchlocal:benchpacks:install",
    installFromUrl: "benchlocal:benchpacks:install-from-url",
    update: "benchlocal:benchpacks:update",
    uninstall: "benchlocal:benchpacks:uninstall",
    mutationProgress: "benchlocal:benchpacks:mutation-progress",
    activeRuns: "benchlocal:benchpacks:active-runs",
    run: "benchlocal:benchpacks:run",
    retryScenario: "benchlocal:benchpacks:retry-scenario",
    resumeRun: "benchlocal:benchpacks:resume-run",
    stop: "benchlocal:benchpacks:stop",
    history: "benchlocal:benchpacks:history",
    loadHistory: "benchlocal:benchpacks:history-load",
    clearHistory: "benchlocal:benchpacks:history-clear",
    deleteHistory: "benchlocal:benchpacks:history-delete",
    runEvent: "benchlocal:benchpacks:run-event"
  },
  webPacks: {
    chat: "benchlocal:webpacks:chat",
    streamChat: "benchlocal:webpacks:stream-chat",
    streamEvent: "benchlocal:webpacks:stream-event",
    saveHistory: "benchlocal:webpacks:history-save",
    writeArtifact: "benchlocal:webpacks:artifact-write"
  },
  verifiers: {
    list: "benchlocal:verifiers:list",
    start: "benchlocal:verifiers:start",
    stop: "benchlocal:verifiers:stop",
    cancelStart: "benchlocal:verifiers:cancel-start",
    deleteImage: "benchlocal:verifiers:delete-image",
    progress: "benchlocal:verifiers:progress"
  },
  logs: {
    openDetached: "benchlocal:logs:open-detached",
    closeDetached: "benchlocal:logs:close-detached",
    publishState: "benchlocal:logs:publish-state",
    state: "benchlocal:logs:state",
    closed: "benchlocal:logs:closed"
  }
} as const;

type AsyncMethod = (...args: never[]) => Promise<unknown>;
type MethodContract<TMethod extends AsyncMethod> = {
  request: Parameters<TMethod> extends [] ? void : Parameters<TMethod>[0];
  response: Awaited<ReturnType<TMethod>>;
};

type Api = BenchLocalDesktopApi;

export type IpcInvokeContract = {
  // invoke 的输入输出直接从 Renderer 公共 API 推导，避免维护第二套手写协议类型。
  [IPC_CHANNELS.app.metadata]: MethodContract<Api["app"]["metadata"]>;
  [IPC_CHANNELS.updates.getState]: MethodContract<Api["updates"]["state"]>;
  [IPC_CHANNELS.updates.check]: MethodContract<Api["updates"]["check"]>;
  [IPC_CHANNELS.updates.install]: MethodContract<Api["updates"]["install"]>;
  [IPC_CHANNELS.config.load]: MethodContract<Api["config"]["load"]>;
  [IPC_CHANNELS.config.save]: MethodContract<Api["config"]["save"]>;
  [IPC_CHANNELS.agent.getState]: MethodContract<Api["agent"]["state"]>;
  [IPC_CHANNELS.agent.configure]: MethodContract<Api["agent"]["configure"]>;
  [IPC_CHANNELS.agent.regenerateToken]: MethodContract<Api["agent"]["regenerateToken"]>;
  [IPC_CHANNELS.models.discover]: MethodContract<Api["models"]["discover"]>;
  [IPC_CHANNELS.models.availability]: MethodContract<Api["models"]["availability"]>;
  [IPC_CHANNELS.themes.list]: MethodContract<Api["themes"]["list"]>;
  [IPC_CHANNELS.themes.load]: MethodContract<Api["themes"]["load"]>;
  [IPC_CHANNELS.workspaces.load]: MethodContract<Api["workspaces"]["load"]>;
  [IPC_CHANNELS.workspaces.save]: MethodContract<Api["workspaces"]["save"]>;
  [IPC_CHANNELS.workspaces.export]: MethodContract<Api["workspaces"]["export"]>;
  [IPC_CHANNELS.workspaces.import]: MethodContract<Api["workspaces"]["import"]>;
  [IPC_CHANNELS.benchPacks.list]: MethodContract<Api["benchPacks"]["list"]>;
  [IPC_CHANNELS.benchPacks.registry]: MethodContract<Api["benchPacks"]["registry"]>;
  [IPC_CHANNELS.benchPacks.install]: MethodContract<Api["benchPacks"]["install"]>;
  [IPC_CHANNELS.benchPacks.installFromUrl]: MethodContract<Api["benchPacks"]["installFromUrl"]>;
  [IPC_CHANNELS.benchPacks.update]: MethodContract<Api["benchPacks"]["update"]>;
  [IPC_CHANNELS.benchPacks.uninstall]: MethodContract<Api["benchPacks"]["uninstall"]>;
  [IPC_CHANNELS.benchPacks.activeRuns]: MethodContract<Api["benchPacks"]["activeRuns"]>;
  [IPC_CHANNELS.benchPacks.run]: MethodContract<Api["benchPacks"]["run"]>;
  [IPC_CHANNELS.benchPacks.retryScenario]: MethodContract<Api["benchPacks"]["retryScenario"]>;
  [IPC_CHANNELS.benchPacks.resumeRun]: MethodContract<Api["benchPacks"]["resumeRun"]>;
  [IPC_CHANNELS.benchPacks.stop]: MethodContract<Api["benchPacks"]["stop"]>;
  [IPC_CHANNELS.benchPacks.history]: MethodContract<Api["benchPacks"]["history"]>;
  [IPC_CHANNELS.benchPacks.loadHistory]: MethodContract<Api["benchPacks"]["loadHistory"]>;
  [IPC_CHANNELS.benchPacks.clearHistory]: MethodContract<Api["benchPacks"]["clearHistory"]>;
  [IPC_CHANNELS.benchPacks.deleteHistory]: MethodContract<Api["benchPacks"]["deleteHistory"]>;
  [IPC_CHANNELS.webPacks.chat]: MethodContract<Api["webPacks"]["chat"]>;
  [IPC_CHANNELS.webPacks.saveHistory]: MethodContract<Api["webPacks"]["saveHistory"]>;
  [IPC_CHANNELS.webPacks.writeArtifact]: MethodContract<Api["webPacks"]["writeArtifact"]>;
  [IPC_CHANNELS.verifiers.list]: MethodContract<Api["verifiers"]["list"]>;
  [IPC_CHANNELS.verifiers.start]: MethodContract<Api["verifiers"]["start"]>;
  [IPC_CHANNELS.verifiers.stop]: MethodContract<Api["verifiers"]["stop"]>;
  [IPC_CHANNELS.verifiers.cancelStart]: MethodContract<Api["verifiers"]["cancelStart"]>;
  [IPC_CHANNELS.verifiers.deleteImage]: MethodContract<Api["verifiers"]["deleteImage"]>;
  [IPC_CHANNELS.logs.openDetached]: MethodContract<Api["logs"]["openDetachedWindow"]>;
  [IPC_CHANNELS.logs.closeDetached]: MethodContract<Api["logs"]["closeDetachedWindow"]>;
  [IPC_CHANNELS.logs.publishState]: MethodContract<Api["logs"]["publishDetachedState"]>;
};

type ListenerPayload<TMethod> = TMethod extends (listener: (payload: infer TPayload) => void) => () => void
  ? TPayload
  : TMethod extends (listener: () => void) => () => void
    ? void
    : never;

export type IpcEventContract = {
  [IPC_CHANNELS.app.openAbout]: ListenerPayload<Api["app"]["onOpenAbout"]>;
  [IPC_CHANNELS.app.openSettings]: ListenerPayload<Api["app"]["onOpenSettings"]>;
  [IPC_CHANNELS.updates.state]: ListenerPayload<Api["updates"]["onState"]>;
  [IPC_CHANNELS.config.updated]: ListenerPayload<Api["config"]["onUpdated"]>;
  [IPC_CHANNELS.agent.state]: ListenerPayload<Api["agent"]["onState"]>;
  [IPC_CHANNELS.workspaces.updated]: ListenerPayload<Api["workspaces"]["onUpdated"]>;
  [IPC_CHANNELS.benchPacks.mutationProgress]: ListenerPayload<Api["benchPacks"]["onMutationProgress"]>;
  [IPC_CHANNELS.benchPacks.runEvent]: ListenerPayload<Api["benchPacks"]["onRunEvent"]>;
  [IPC_CHANNELS.webPacks.streamEvent]: Parameters<Parameters<Api["webPacks"]["streamChat"]>[1]>[0];
  [IPC_CHANNELS.verifiers.progress]: ListenerPayload<Api["verifiers"]["onProgress"]>;
  [IPC_CHANNELS.logs.state]: ListenerPayload<Api["logs"]["onDetachedState"]>;
  [IPC_CHANNELS.logs.closed]: ListenerPayload<Api["logs"]["onDetachedWindowClosed"]>;
};

export type IpcMessageContract = {
  [IPC_CHANNELS.webPacks.streamChat]: Parameters<Api["webPacks"]["streamChat"]>[0];
};

export type IpcInvokeChannel = keyof IpcInvokeContract;
export type IpcEventChannel = keyof IpcEventContract;
export type IpcMessageChannel = keyof IpcMessageContract;
export type IpcInvokeRequest<TChannel extends IpcInvokeChannel> = IpcInvokeContract[TChannel]["request"];
export type IpcInvokeResponse<TChannel extends IpcInvokeChannel> = IpcInvokeContract[TChannel]["response"];
export type IpcEventPayload<TChannel extends IpcEventChannel> = IpcEventContract[TChannel];
export type IpcMessagePayload<TChannel extends IpcMessageChannel> = IpcMessageContract[TChannel];
