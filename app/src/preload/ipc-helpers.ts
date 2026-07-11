import { ipcRenderer } from "electron";
import type {
  IpcEventChannel,
  IpcEventPayload,
  IpcInvokeChannel,
  IpcInvokeRequest,
  IpcInvokeResponse,
  IpcMessageChannel,
  IpcMessagePayload
} from "@/shared/ipc-contract";

// Renderer bridge 只通过 typed helper 调用 Electron，禁止 feature 直接拼接 channel 字符串。
export function invokeIpc<TChannel extends IpcInvokeChannel>(
  channel: TChannel,
  ...args: IpcInvokeRequest<TChannel> extends void ? [] : [input: IpcInvokeRequest<TChannel>]
): Promise<IpcInvokeResponse<TChannel>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<IpcInvokeResponse<TChannel>>;
}

export function sendIpcMessage<TChannel extends IpcMessageChannel>(
  channel: TChannel,
  input: IpcMessagePayload<TChannel>
): void {
  ipcRenderer.send(channel, input);
}

export function onIpcEvent<TChannel extends IpcEventChannel>(
  channel: TChannel,
  listener: (payload: IpcEventPayload<TChannel>) => void
): () => void {
  const wrapped = (_event: Electron.IpcRendererEvent, payload: IpcEventPayload<TChannel>) => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}
