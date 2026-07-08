import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..");

type ChannelDeclarations = Map<string, string>;

async function readProjectFile(relativePath: string): Promise<string> {
  return fs.readFile(path.join(repoRoot, relativePath), "utf8");
}

function readChannelDeclarations(source: string): ChannelDeclarations {
  const declarations: ChannelDeclarations = new Map();
  const pattern = /const\s+([A-Z0-9_]+_CHANNEL)\s*=\s*"([^"]+)"/g;

  for (const match of source.matchAll(pattern)) {
    declarations.set(match[1], match[2]);
  }

  return declarations;
}

function resolveChannel(expression: string, declarations: ChannelDeclarations): string | null {
  const trimmed = expression.trim();
  const literal = trimmed.match(/^"([^"]+)"$/);

  if (literal) {
    return literal[1];
  }

  return declarations.get(trimmed) ?? null;
}

function readRendererRequestChannels(source: string, declarations: ChannelDeclarations): Set<string> {
  const channels = new Set<string>();
  const pattern = /ipcRenderer\.(?:invoke|send)\(\s*([^,\n)]+)/g;

  for (const match of source.matchAll(pattern)) {
    const channel = resolveChannel(match[1], declarations);
    if (channel) {
      channels.add(channel);
    }
  }

  return channels;
}

function readMainHandlerChannels(source: string, declarations: ChannelDeclarations): Set<string> {
  const channels = new Set<string>();
  const pattern = /ipcMain\.(?:handle|on)\(\s*([^,\n)]+)/g;

  for (const match of source.matchAll(pattern)) {
    const channel = resolveChannel(match[1], declarations);
    if (channel) {
      channels.add(channel);
    }
  }

  return channels;
}

describe("IPC contract", () => {
  it("registers every preload request channel in the main process", async () => {
    const [preloadSource, mainSource] = await Promise.all([
      readProjectFile("src/preload/index.ts"),
      readProjectFile("src/main/ipc.ts")
    ]);
    const declarations = new Map([
      ...readChannelDeclarations(preloadSource),
      ...readChannelDeclarations(mainSource)
    ]);

    const preloadRequests = readRendererRequestChannels(preloadSource, declarations);
    const mainHandlers = readMainHandlerChannels(mainSource, declarations);
    const missing = [...preloadRequests].filter((channel) => !mainHandlers.has(channel));

    expect(missing).toEqual([]);
  });
});


