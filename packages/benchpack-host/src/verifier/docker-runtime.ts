// Docker 容器生命周期管理：CLI 探测、镜像构建/拉取、container 启动/停止、端口绑定与 endpoint 决议。
import { execFile } from "node:child_process";
import { constants as fsConstants, promises as fs } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type {
  BenchLocalConfig,
  BenchLocalBenchPackConfig,
  BenchLocalVerifierConfig,
  BenchPackManifest,
  VerifierEndpoint,
  VerifierSpec
} from "@benchlocal/core";
import {
  getManifestVerifiers,
  getVerifierUrl
} from "../verifier-config.js";
import { resolveConfiguredBenchPackRoot } from "../inspect/configured-packs.js";
import { readBenchPackManifest } from "../inspect/manifest.js";
import { pathExists } from "../shared/file-system.js";
import {
  waitForAbortableDelay,
  waitForPromiseWithAbort,
  throwIfAborted
} from "../shared/abort.js";
import type { BenchLocalRuntimeCompatibility } from "../shared/compatibility.js";
import { probeVerifier, waitForVerifierReady } from "./health-check.js";

export type DockerRuntimeAvailability = {
  state: "ready" | "not_installed" | "not_running";
  available: boolean;
  details?: string;
  simulated?: boolean;
};

export type VerifierPreparationProgress = {
  verifierId: string;
  phase: "checking_docker" | "building_image" | "pulling_image" | "starting_container" | "waiting_for_healthcheck";
  message: string;
};

const execFileAsync = promisify(execFile);
let dockerExecutablePathPromise: Promise<string | null> | null = null;
const verifierContainerLocks = new Map<string, Promise<void>>();

// Docker、container lock 和 health check 逻辑集中在 verifier 模块，避免主入口持有基础设施细节。
async function isExecutableFile(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function getNormalizedPathEnv(): string {
  const pathEntries = new Set(
    (process.env.PATH ?? "")
      .split(path.delimiter)
      .map((entry) => entry.trim())
      .filter(Boolean)
  );

  for (const candidate of [
    "/usr/local/bin",
    "/opt/homebrew/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
    "/Applications/Docker.app/Contents/Resources/bin",
    "/Applications/OrbStack.app/Contents/MacOS/xbin",
    "/Applications/OrbStack.app/Contents/MacOS/bin"
  ]) {
    pathEntries.add(candidate);
  }

  return Array.from(pathEntries).join(path.delimiter);
}

async function resolveDockerExecutable(): Promise<string | null> {
  if (!dockerExecutablePathPromise) {
    dockerExecutablePathPromise = (async () => {
      const candidates = [
        ...getNormalizedPathEnv()
          .split(path.delimiter)
          .filter(Boolean)
          .map((directory) => path.join(directory, "docker")),
        "/usr/local/bin/docker",
        "/opt/homebrew/bin/docker",
        "/Applications/Docker.app/Contents/Resources/bin/docker",
        "/Applications/OrbStack.app/Contents/MacOS/xbin/docker",
        "/Applications/OrbStack.app/Contents/MacOS/bin/docker"
      ];

      const seen = new Set<string>();
      for (const candidate of candidates) {
        if (seen.has(candidate)) {
          continue;
        }
        seen.add(candidate);
        if (await isExecutableFile(candidate)) {
          return candidate;
        }
      }

      return null;
    })();
  }

  return dockerExecutablePathPromise;
}

function sanitizeRuntimeName(input: string): string {
  return input.replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

export function getVerifierContainerName(benchPackId: string, verifierId: string): string {
  return `benchlocal-${sanitizeRuntimeName(benchPackId)}-${sanitizeRuntimeName(verifierId)}`;
}

export async function runDockerCommand(args: string[], options?: { abortSignal?: AbortSignal }): Promise<string> {
  const dockerExecutable = await resolveDockerExecutable();
  if (!dockerExecutable) {
    const error = new Error("Docker CLI is not installed.");
    (error as NodeJS.ErrnoException).code = "ENOENT";
    throw error;
  }

  const { stdout } = await execFileAsync(dockerExecutable, args, {
    env: {
      ...process.env,
      PATH: getNormalizedPathEnv()
    },
    maxBuffer: 4 * 1024 * 1024,
    signal: options?.abortSignal
  });

  return stdout.trim();
}

async function runDockerCliVersionCheck(): Promise<boolean> {
  try {
    const dockerExecutable = await resolveDockerExecutable();
    if (!dockerExecutable) {
      return false;
    }

    await execFileAsync(dockerExecutable, ["--version"], {
      env: {
        ...process.env,
        PATH: getNormalizedPathEnv()
      },
      maxBuffer: 1024 * 1024
    });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return false;
    }

    return true;
  }
}

function normalizeDockerErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Docker is unavailable.";
  }

  const candidate = error.message.trim();
  return candidate || "Docker is unavailable.";
}

function getSimulatedDockerAvailability(): DockerRuntimeAvailability | null {
  const raw = process.env.BENCHLOCAL_SIMULATE_DOCKER?.trim().toLowerCase();

  if (!raw) {
    return null;
  }

  if (raw === "not_installed" || raw === "missing") {
    return {
      state: "not_installed",
      available: false,
      details: "Simulated: Docker is not installed on this machine.",
      simulated: true
    };
  }

  if (raw === "not_running" || raw === "stopped") {
    return {
      state: "not_running",
      available: false,
      details: "Simulated: Docker is installed but not running.",
      simulated: true
    };
  }

  return null;
}

export async function maybeDelayVerifierPreparation(abortSignal?: AbortSignal): Promise<void> {
  const raw = process.env.BENCHLOCAL_SIMULATE_VERIFIER_PREP_MS?.trim();

  if (!raw) {
    return;
  }

  const durationMs = Number(raw);

  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return;
  }

  await waitForAbortableDelay(durationMs, abortSignal);
}

export async function detectDockerAvailability(): Promise<DockerRuntimeAvailability> {
  const simulated = getSimulatedDockerAvailability();

  if (simulated) {
    return simulated;
  }

  try {
    const version = await runDockerCommand(["version", "--format", "{{.Server.Version}}"]);
    return {
      state: "ready",
      available: true,
      details: version || "Docker available"
    };
  } catch (error) {
    const dockerCliInstalled = await runDockerCliVersionCheck();
    const details = normalizeDockerErrorMessage(error);

    if (!dockerCliInstalled) {
      return {
        state: "not_installed",
        available: false,
        details: "Docker is not installed."
      };
    }

    return {
      state: "not_running",
      available: false,
      details:
        /cannot connect to the docker daemon|is the docker daemon running|error during connect|connection refused/i.test(details)
          ? "Docker is installed but not running."
          : details
    };
  }
}

async function inspectDockerContainer(containerName: string): Promise<{
  exists: boolean;
  running: boolean;
}> {
  try {
    const stdout = await runDockerCommand([
      "inspect",
      containerName,
      "--format",
      "{{.State.Running}}"
    ]);

    return {
      exists: true,
      running: stdout === "true"
    };
  } catch {
    return {
      exists: false,
      running: false
    };
  }
}

async function inspectDockerPortBinding(
  containerName: string,
  listenPort: number
): Promise<{
  exists: boolean;
  running: boolean;
  hostPort?: number;
}> {
  try {
    const stdout = await runDockerCommand(["inspect", containerName]);
    const parsed = JSON.parse(stdout) as Array<{
      State?: { Running?: boolean };
      NetworkSettings?: {
        Ports?: Record<string, Array<{ HostPort?: string }> | null>;
      };
    }>;
    const details = parsed[0];
    const running = Boolean(details?.State?.Running);
    const portRecord = details?.NetworkSettings?.Ports?.[`${listenPort}/tcp`];
    const hostPortRaw = Array.isArray(portRecord) ? portRecord[0]?.HostPort : undefined;
    const hostPort = hostPortRaw ? Number(hostPortRaw) : undefined;

    return {
      exists: true,
      running,
      hostPort
    };
  } catch {
    return {
      exists: false,
      running: false
    };
  }
}

export async function allocateLocalPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", reject);

    server.once("listening", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to allocate local port.")));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });

    server.listen(0);
  });
}

export async function inspectDockerImage(image: string): Promise<boolean> {
  try {
    await runDockerCommand(["image", "inspect", image]);
    return true;
  } catch {
    return false;
  }
}

export async function stopDockerVerifierContainer(containerName: string): Promise<void> {
  try {
    await runDockerCommand(["rm", "-f", containerName]);
  } catch {
    // Treat missing containers as already stopped.
  }
}

export async function withVerifierContainerLock<T>(
  containerName: string,
  operation: () => Promise<T>,
  options?: {
    abortSignal?: AbortSignal;
  }
): Promise<T> {
  const previous = verifierContainerLocks.get(containerName) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => gate);
  verifierContainerLocks.set(containerName, tail);

  try {
    await waitForPromiseWithAbort(previous.catch(() => undefined), options?.abortSignal);
    return await operation();
  } finally {
    release();
    if (verifierContainerLocks.get(containerName) === tail) {
      verifierContainerLocks.delete(containerName);
    }
  }
}

export async function startDockerVerifierContainer(
  containerName: string,
  image: string,
  hostPort: number,
  listenPort: number,
  options?: {
    pullImage?: boolean;
    abortSignal?: AbortSignal;
  }
): Promise<void> {
  await stopDockerVerifierContainer(containerName);
  if (options?.pullImage !== false) {
    await runDockerCommand(["pull", image], { abortSignal: options?.abortSignal });
  }
  const dockerArgs = [
    "run",
    "-d",
    "--name",
    containerName,
    ...(process.platform === "linux" ? ["--add-host", "host.docker.internal:host-gateway"] : []),
    "-p",
    `${hostPort}:${listenPort}`,
    image
  ];
  await runDockerCommand(dockerArgs, { abortSignal: options?.abortSignal });
}

export async function buildDockerVerifierImage(tag: string, contextPath: string, options?: { abortSignal?: AbortSignal }): Promise<void> {
  await runDockerCommand(["build", "-t", tag, contextPath], { abortSignal: options?.abortSignal });
}


export function formatDockerVerifierUnavailableMessage(benchPackId: string, availability: DockerRuntimeAvailability): string {
  if (availability.state === "not_installed") {
    return `Bench Pack "${benchPackId}" requires Local Docker, but Docker is not installed.`;
  }

  return `Bench Pack "${benchPackId}" requires Local Docker, but Docker is not running.`;
}

export function resolveVerifierDockerImageRef(
  benchPackId: string,
  spec: VerifierSpec,
  runtime?: BenchLocalVerifierConfig
): {
  image?: string;
  pullImage: boolean;
} {
  const configuredImage = runtime?.docker_image ?? spec.docker?.image;

  if (configuredImage) {
    return {
      image: configuredImage,
      pullImage: true
    };
  }

  if (spec.docker?.buildContext) {
    return {
      image: `benchlocal/${sanitizeRuntimeName(benchPackId)}-${sanitizeRuntimeName(spec.id)}:local`,
      pullImage: false
    };
  }

  return {
    image: undefined,
    pullImage: true
  };
}

export async function resolveDockerVerifierEndpoint(
  benchPackId: string,
  spec: VerifierSpec,
  config?: BenchLocalVerifierConfig
): Promise<VerifierEndpoint> {
  const docker = await detectDockerAvailability();
  const { image } = resolveVerifierDockerImageRef(benchPackId, spec, config);

  if (!docker.available) {
    return {
      id: spec.id,
      transport: spec.transport,
      mode: "docker",
      required: spec.required,
      status: docker.state === "not_running" ? "dependency_not_running" : "missing_dependency",
      details: docker.details,
      dockerImagePresent: false
    };
  }

  const containerName = getVerifierContainerName(benchPackId, spec.id);
  const listenPort = spec.docker?.listenPort;
  const container: {
    exists: boolean;
    running: boolean;
    hostPort?: number;
  } = listenPort
    ? await inspectDockerPortBinding(containerName, listenPort)
    : await inspectDockerContainer(containerName);
  const port = container.hostPort;
  const url = port ? `http://127.0.0.1:${port}` : undefined;
  const healthcheckPath = spec.docker?.healthcheckPath ?? spec.cloud?.healthcheckPath ?? spec.customUrl?.healthcheckPath;
  const status =
    container.running && url
      ? await probeVerifier(url, healthcheckPath)
      : container.exists
        ? "stopped"
        : "stopped";
  const dockerImagePresent = image ? await inspectDockerImage(image) : false;

  return {
    id: spec.id,
    transport: spec.transport,
    mode: "docker",
    required: spec.required,
    status,
    url,
    port,
    dockerImagePresent,
    details: container.running
      ? spec.docker?.image
      : "BenchLocal assigns a free local port automatically when this verifier starts."
  };
}

