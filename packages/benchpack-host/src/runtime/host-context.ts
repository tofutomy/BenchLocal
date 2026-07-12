import path from "node:path";
import { expandHomePath, type BenchLocalConfig, type BenchPackManifest, type HostContext } from "@benchlocal/core";
import { createRuntimeModels, createRuntimeProviders, createRuntimeSecrets } from "../providers/model-availability.js";
import { startInferenceRelay } from "../providers/inference-endpoints.js";
import { resolveVerifierEndpoints } from "../verifier/verifier-service.js";
import { appendTextLine, type RunArtifacts } from "../runs/run-artifacts.js";

export type HostContextResources = {
  context: HostContext;
  dispose(): Promise<void>;
};

function createHostLogger(benchPackId: string, hostLogPath: string): HostContext["logger"] {
  return {
    debug(message, meta) {
      console.debug(`[benchpack:${benchPackId}] ${message}`, meta ?? "");
      void appendTextLine(hostLogPath, `[debug] ${message}${meta ? ` ${JSON.stringify(meta)}` : ""}`);
    },
    info(message, meta) {
      console.info(`[benchpack:${benchPackId}] ${message}`, meta ?? "");
      void appendTextLine(hostLogPath, `[info] ${message}${meta ? ` ${JSON.stringify(meta)}` : ""}`);
    },
    warn(message, meta) {
      console.warn(`[benchpack:${benchPackId}] ${message}`, meta ?? "");
      void appendTextLine(hostLogPath, `[warn] ${message}${meta ? ` ${JSON.stringify(meta)}` : ""}`);
    },
    error(message, meta) {
      console.error(`[benchpack:${benchPackId}] ${message}`, meta ?? "");
      void appendTextLine(hostLogPath, `[error] ${message}${meta ? ` ${JSON.stringify(meta)}` : ""}`);
    }
  };
}

export async function createHostContext(
  config: BenchLocalConfig,
  benchPackId: string,
  rootDir: string,
  manifest: BenchPackManifest,
  artifacts: RunArtifacts
): Promise<HostContextResources> {
  const benchPackConfig = config.benchpacks[benchPackId];
  const logger = createHostLogger(benchPackId, artifacts.hostLogPath);
  const providers = createRuntimeProviders(config);
  const models = createRuntimeModels(config);
  const secrets = await createRuntimeSecrets(config);

  const verifiers = await resolveVerifierEndpoints(benchPackId, benchPackConfig, manifest);
  const inferenceRelay = await startInferenceRelay(providers, models, secrets, logger);

  return {
    context: {
      protocolVersion: 1,
      benchPack: {
        id: benchPackId,
        version: manifest.version,
        installDir: rootDir,
        dataDir: path.join(expandHomePath(config.cache_dir), "benchpack-data", benchPackId),
        cacheDir: path.join(expandHomePath(config.cache_dir), "benchpacks", benchPackId),
        runsDir: artifacts.runDir
      },
      providers,
      models,
      secrets,
      verifiers,
      sidecars: verifiers,
      inferenceEndpoints: inferenceRelay.endpoints,
      logger
    },
    dispose: inferenceRelay.dispose
  };
}

