import { resolveVerifierEndpoints } from "./endpoint-resolution.js";
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

import {
  allocateLocalPort,
  buildDockerVerifierImage,
  detectDockerAvailability,
  formatDockerVerifierUnavailableMessage,
  getVerifierContainerName,
  inspectDockerImage,
  maybeDelayVerifierPreparation,
  resolveDockerVerifierEndpoint,
  resolveVerifierDockerImageRef,
  runDockerCommand,
  startDockerVerifierContainer,
  stopDockerVerifierContainer,
  withVerifierContainerLock,
  type DockerRuntimeAvailability,
  type VerifierPreparationProgress
} from "./docker-runtime.js";

export type ConfiguredBenchPackVerifierStatus = {
  benchPackId: string;
  benchPackName: string;
  verifiers: VerifierEndpoint[];
  docker: DockerRuntimeAvailability;
};

async function loadConfiguredBenchPackRuntime(
  config: BenchLocalConfig,
  benchPackId: string
): Promise<{
  rootDir: string;
  benchPackConfig: BenchLocalBenchPackConfig;
  manifest: BenchPackManifest;
}> {
  const benchPackConfig = config.benchpacks[benchPackId];

  if (!benchPackConfig) {
    throw new Error(`Unknown Bench Pack "${benchPackId}" in BenchLocal config.`);
  }

  const rootDir = await resolveConfiguredBenchPackRoot(config, benchPackId, benchPackConfig);

  if (!rootDir || !(await pathExists(rootDir))) {
    throw new Error(`Bench Pack "${benchPackId}" is not installed at a resolvable path.`);
  }

  const manifest = await readBenchPackManifest(rootDir);
  return {
    rootDir,
    benchPackConfig,
    manifest
  };
}

export async function getConfiguredBenchPackVerifierStatus(
  config: BenchLocalConfig,
  benchPackId: string
): Promise<ConfiguredBenchPackVerifierStatus> {
  const { benchPackConfig, manifest } = await loadConfiguredBenchPackRuntime(config, benchPackId);
  const docker = await detectDockerAvailability();
  const verifiers = await resolveVerifierEndpoints(benchPackId, benchPackConfig, manifest);

  return {
    benchPackId,
    benchPackName: manifest.name,
    verifiers,
    docker
  };
}

export async function startConfiguredBenchPackVerifiers(
  config: BenchLocalConfig,
  benchPackId: string,
  options?: {
    abortSignal?: AbortSignal;
    onProgress?: (progress: VerifierPreparationProgress) => Promise<void> | void;
  }
): Promise<ConfiguredBenchPackVerifierStatus> {
  const { rootDir, benchPackConfig, manifest } = await loadConfiguredBenchPackRuntime(config, benchPackId);
  const verifierSpecs = getManifestVerifiers(manifest);
  const docker = await detectDockerAvailability();

  for (const spec of verifierSpecs) {
    const runtime = benchPackConfig.verifiers?.[spec.id] ?? benchPackConfig.sidecars?.[spec.id];
    const mode = runtime?.mode ?? spec.defaultMode;

    if (mode !== "docker" || !runtime?.auto_start) {
      continue;
    }

    throwIfAborted(options?.abortSignal);
    await options?.onProgress?.({
      verifierId: spec.id,
      phase: "checking_docker",
      message: docker.available
        ? "Checking Local Docker availability."
        : docker.details ?? "Checking Local Docker availability."
    });

    if (!docker.available) {
      if (spec.required) {
        throw new Error(formatDockerVerifierUnavailableMessage(benchPackId, docker));
      }
      continue;
    }

    const { image, pullImage } = resolveVerifierDockerImageRef(benchPackId, spec, runtime);
    const listenPort = spec.docker?.listenPort;

    if (!pullImage && image && spec.docker?.buildContext) {
      if (!(await inspectDockerImage(image))) {
        await options?.onProgress?.({
          verifierId: spec.id,
          phase: "building_image",
          message: "Building the local verifier image."
        });
        await maybeDelayVerifierPreparation(options?.abortSignal);
        throwIfAborted(options?.abortSignal);
        await buildDockerVerifierImage(image, path.resolve(rootDir, spec.docker.buildContext), {
          abortSignal: options?.abortSignal
        });
      }
    }

    if (!image || !listenPort) {
      if (spec.required) {
        throw new Error(`Bench Pack "${benchPackId}" is missing Docker verifier metadata for "${spec.id}".`);
      }
      continue;
    }

    const containerName = getVerifierContainerName(benchPackId, spec.id);
    await withVerifierContainerLock(containerName, async () => {
      const existingEndpoint = await resolveDockerVerifierEndpoint(benchPackId, spec, runtime);

      if (existingEndpoint.status === "running" && existingEndpoint.url) {
        await options?.onProgress?.({
          verifierId: spec.id,
          phase: "waiting_for_healthcheck",
          message: "Reusing the running verifier."
        });
        return;
      }

      const hostPort = await allocateLocalPort();

      if (pullImage) {
        await options?.onProgress?.({
          verifierId: spec.id,
          phase: "pulling_image",
          message: `Pulling verifier image ${image}.`
        });
        await maybeDelayVerifierPreparation(options?.abortSignal);
        throwIfAborted(options?.abortSignal);
      }

      await options?.onProgress?.({
        verifierId: spec.id,
        phase: "starting_container",
        message: `Starting verifier ${spec.id}.`
      });
      await maybeDelayVerifierPreparation(options?.abortSignal);
      throwIfAborted(options?.abortSignal);
      await startDockerVerifierContainer(
        containerName,
        image,
        hostPort,
        listenPort,
        {
          pullImage,
          abortSignal: options?.abortSignal
        }
      );

      await options?.onProgress?.({
        verifierId: spec.id,
        phase: "waiting_for_healthcheck",
        message: "Waiting for the verifier health check to pass."
      });
      await maybeDelayVerifierPreparation(options?.abortSignal);
      throwIfAborted(options?.abortSignal);
      await waitForVerifierReady(
        `http://127.0.0.1:${hostPort}`,
        spec.docker?.healthcheckPath ?? spec.cloud?.healthcheckPath ?? spec.customUrl?.healthcheckPath,
        { abortSignal: options?.abortSignal }
      );
    }, { abortSignal: options?.abortSignal });
  }

  return getConfiguredBenchPackVerifierStatus(config, benchPackId);
}

export async function stopConfiguredBenchPackVerifiers(
  config: BenchLocalConfig,
  benchPackId: string
): Promise<ConfiguredBenchPackVerifierStatus> {
  const { manifest } = await loadConfiguredBenchPackRuntime(config, benchPackId);
  const verifierSpecs = getManifestVerifiers(manifest);

  await Promise.all(
    verifierSpecs.map((spec) => stopDockerVerifierContainer(getVerifierContainerName(benchPackId, spec.id)))
  );

  return getConfiguredBenchPackVerifierStatus(config, benchPackId);
}

export async function deleteConfiguredBenchPackVerifierImage(
  config: BenchLocalConfig,
  benchPackId: string,
  verifierId: string
): Promise<{
  status: ConfiguredBenchPackVerifierStatus;
  image: string;
  removed: boolean;
}> {
  const { benchPackConfig, manifest } = await loadConfiguredBenchPackRuntime(config, benchPackId);
  const spec = getManifestVerifiers(manifest).find((candidate) => candidate.id === verifierId);

  if (!spec) {
    throw new Error(`Verifier "${verifierId}" was not found for Bench Pack "${benchPackId}".`);
  }

  const runtime = benchPackConfig.verifiers?.[spec.id] ?? benchPackConfig.sidecars?.[spec.id];
  const mode = runtime?.mode ?? spec.defaultMode;

  if (mode !== "docker") {
    throw new Error(`Verifier "${verifierId}" for Bench Pack "${benchPackId}" is not configured for Local Docker.`);
  }

  const docker = await detectDockerAvailability();

  if (!docker.available) {
    throw new Error(
      docker.state === "not_installed"
        ? `Cannot delete the Docker image for verifier "${verifierId}" because Docker is not installed.`
        : `Cannot delete the Docker image for verifier "${verifierId}" because Docker is not running.`
    );
  }

  const { image } = resolveVerifierDockerImageRef(benchPackId, spec, runtime);

  if (!image) {
    throw new Error(`Verifier "${verifierId}" for Bench Pack "${benchPackId}" does not define a Docker image.`);
  }

  const containerName = getVerifierContainerName(benchPackId, spec.id);
  let removed = false;

  await withVerifierContainerLock(containerName, async () => {
    const existingEndpoint = await resolveDockerVerifierEndpoint(benchPackId, spec, runtime);

    if (existingEndpoint.status === "running") {
      throw new Error(`Stop verifier "${verifierId}" before deleting its Docker image.`);
    }

    // Drop any leftover container reference so the image can be removed cleanly.
    await stopDockerVerifierContainer(containerName);

    if (!(await inspectDockerImage(image))) {
      removed = false;
      return;
    }

    await runDockerCommand(["image", "rm", image]);
    removed = true;
  });

  return {
    status: await getConfiguredBenchPackVerifierStatus(config, benchPackId),
    image,
    removed
  };
}




