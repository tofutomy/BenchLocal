import type { BenchLocalBenchPackConfig, BenchPackManifest, VerifierEndpoint } from "@benchlocal/core";
import { getManifestVerifiers, getVerifierUrl } from "./verifier-config.js";
import { probeVerifier } from "./health-check.js";
import { resolveDockerVerifierEndpoint } from "./docker-runtime.js";
export type VerifierEndpointOperations = {
  resolveDocker: typeof resolveDockerVerifierEndpoint;
  probe: typeof probeVerifier;
};

const defaultOperations: VerifierEndpointOperations = {
  resolveDocker: resolveDockerVerifierEndpoint,
  probe: probeVerifier
};


export async function resolveVerifierEndpoints(
  benchPackId: string,
  benchPackConfig: BenchLocalBenchPackConfig | undefined,
  manifest: BenchPackManifest,
  operations: VerifierEndpointOperations = defaultOperations
): Promise<VerifierEndpoint[]> {
  const verifierSpecs = getManifestVerifiers(manifest);

  return Promise.all(
    verifierSpecs.map(async (spec) => {
      const configured = benchPackConfig?.verifiers?.[spec.id] ?? benchPackConfig?.sidecars?.[spec.id];

      if ((configured?.mode ?? spec.defaultMode) === "docker") {
        return operations.resolveDocker(benchPackId, spec, configured);
      }

      const resolved = getVerifierUrl(spec, configured);
      const healthcheckPath =
        spec.customUrl?.healthcheckPath ?? spec.cloud?.healthcheckPath ?? spec.docker?.healthcheckPath;
      const status = resolved.url ? await operations.probe(resolved.url, healthcheckPath) : "failed";

      return {
        id: spec.id,
        transport: spec.transport,
        mode: resolved.mode,
        required: spec.required,
        status,
        url: resolved.url,
        port: resolved.port,
        details: resolved.details ?? (resolved.url ? undefined : "Verifier URL is not configured."),
        dockerImagePresent: false
      } satisfies VerifierEndpoint;
    })
  );
}




