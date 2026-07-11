import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from "electron";
import type {
  IpcEventChannel,
  IpcEventPayload,
  IpcInvokeChannel,
  IpcInvokeRequest,
  IpcInvokeResponse,
  IpcMessageChannel,
  IpcMessagePayload
} from "@/shared/ipc-contract";

type MaybePromise<T> = T | Promise<T>;
// 将 Electron 的 unknown 参数边界收口到一处，业务 handler 获得具体 request/response 类型。

export function registerIpcHandler<TChannel extends IpcInvokeChannel>(
  channel: TChannel,
  handler: (
    event: IpcMainInvokeEvent,
    input: IpcInvokeRequest<TChannel>
  ) => MaybePromise<IpcInvokeResponse<TChannel>>
): void {
  ipcMain.handle(channel, (event, input) => handler(event, input));
}

export function registerIpcMessageHandler<TChannel extends IpcMessageChannel>(
  channel: TChannel,
  handler: (event: IpcMainEvent, input: IpcMessagePayload<TChannel>) => void
): void {
  ipcMain.on(channel, (event, input) => handler(event, input));
}

export function sendIpcEvent<TChannel extends IpcEventChannel>(
  target: Pick<WebContents, "send">,
  channel: TChannel,
  ...args: IpcEventPayload<TChannel> extends void ? [] : [payload: IpcEventPayload<TChannel>]
): void {
  target.send(channel, ...args);
}
