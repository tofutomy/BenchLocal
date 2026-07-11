import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { IPC_CHANNELS } from "../src/shared/ipc-contract.js";

const appRoot = path.resolve(__dirname, "..");

async function readProjectFile(relativePath: string): Promise<string> {
  return fs.readFile(path.join(appRoot, relativePath), "utf8");
}

function readContractReferences(source: string, callName: string): Set<string> {
  const pattern = new RegExp(String.raw`${callName}\(\s*(IPC_CHANNELS\.[A-Za-z0-9_.]+)`, "g");
  return new Set([...source.matchAll(pattern)].map((match) => match[1]));
}

function readEventSendReferences(source: string): Set<string> {
  const pattern = /sendIpcEvent\(\s*[^,\n]+,\s*(IPC_CHANNELS\.[A-Za-z0-9_.]+)/g;
  return new Set([...source.matchAll(pattern)].map((match) => match[1]));
}

function flattenChannelValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(flattenChannelValues);
}

async function readMainEventProducers(): Promise<Set<string>> {
  const sources = await Promise.all([
    readProjectFile("src/main/ipc.ts"),
    readProjectFile("src/main/index.ts"),
    readProjectFile("src/main/updater.ts"),
    readProjectFile("src/main/log-window.ts")
  ]);
  const combined = sources.join("\n");
  return new Set([
    ...readEventSendReferences(combined),
    ...readContractReferences(combined, "sendToAllWindows")
  ]);
}

describe("typed IPC contract", () => {
  it("keeps every channel value unique", () => {
    const channels = flattenChannelValues(IPC_CHANNELS);
    expect(new Set(channels).size).toBe(channels.length);
  });

  it("registers every preload invoke and one-way message in main", async () => {
    const [preloadSource, mainSource] = await Promise.all([
      readProjectFile("src/preload/index.ts"),
      readProjectFile("src/main/ipc.ts")
    ]);

    expect(readContractReferences(mainSource, "registerIpcHandler")).toEqual(
      readContractReferences(preloadSource, "invokeIpc")
    );
    expect(readContractReferences(mainSource, "registerIpcMessageHandler")).toEqual(
      readContractReferences(preloadSource, "sendIpcMessage")
    );
  });

  it("provides a main-process producer for every preload event subscription", async () => {
    const preloadSource = await readProjectFile("src/preload/index.ts");
    const subscriptions = readContractReferences(preloadSource, "onIpcEvent");
    const producers = await readMainEventProducers();
    const missing = [...subscriptions].filter((channel) => !producers.has(channel));

    expect(missing).toEqual([]);
  });

  it("keeps raw channel strings inside the shared contract only", async () => {
    const files = [
      "src/main/ipc.ts",
      "src/main/index.ts",
      "src/main/updater.ts",
      "src/main/log-window.ts",
      "src/preload/index.ts",
      "src/main/ipc-helpers.ts",
      "src/preload/ipc-helpers.ts"
    ];
    const sources = await Promise.all(files.map(readProjectFile));

    for (const source of sources) {
      expect(source).not.toMatch(/["']benchlocal:(?!\/\/)/);
    }
  });
});
