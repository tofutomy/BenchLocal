import type {
  BenchLocalVerifierConfig,
  BenchPackManifest,
  VerifierMode,
  VerifierSpec
} from "@benchlocal/core";

export function getManifestVerifiers(manifest: BenchPackManifest): VerifierSpec[] {
  return manifest.verifiers ?? manifest.sidecars ?? [];
}

export function bootstrapVerifierConfig(
  spec: VerifierSpec,
  existing?: BenchLocalVerifierConfig
): BenchLocalVerifierConfig {
  return {
    mode: existing?.mode ?? spec.defaultMode,
    auto_start: existing?.auto_start ?? true,
    custom_url: existing?.custom_url ?? spec.customUrl?.defaultUrl,
    cloud_url: existing?.cloud_url ?? spec.cloud?.baseUrl,
    docker_image: existing?.docker_image ?? spec.docker?.image
  };
}

export function getVerifierUrl(
  spec: VerifierSpec,
  config?: BenchLocalVerifierConfig
): { mode: VerifierMode; url?: string; port?: number; details?: string } {
  const mode = config?.mode ?? spec.defaultMode;

  if (mode === "docker") {
    return {
      mode,
      details: "BenchLocal assigns a free local port automatically."
    };
  }

  if (mode === "cloud") {
    return {
      mode,
      url: config?.cloud_url ?? spec.cloud?.baseUrl,
      details: spec.cloud?.baseUrl ?? config?.cloud_url
    };
  }

  return {
    mode,
    url: config?.custom_url ?? spec.customUrl?.defaultUrl,
    details: config?.custom_url ?? spec.customUrl?.defaultUrl
  };
}
