import type { BenchLocalConfig, BenchPackManifest } from "@core";
import type { BenchPackVerifierStatus } from "@/shared/desktop-api";
import type { BenchPackRunBlocker } from "./run-utils";

export function getRequiredVerifierRunBlocker(
  manifest: BenchPackManifest | undefined,
  benchPackConfig: BenchLocalConfig["benchpacks"][string] | undefined,
  verifierStatus: BenchPackVerifierStatus | undefined
): BenchPackRunBlocker | null {
  const requiredVerifierSpecs = (manifest?.verifiers ?? manifest?.sidecars ?? []).filter((spec) => spec.required);

  if (requiredVerifierSpecs.length === 0) {
    return null;
  }

  if (verifierStatus?.docker.state === "not_installed") {
    return {
      title: "Docker Required",
      message: "This Bench Pack needs a local verifier runtime. Install Docker Desktop before starting the test run.",
      actionLabel: "Open Verification"
    };
  }

  if (verifierStatus?.docker.state === "not_running") {
    return {
      title: "Docker Not Running",
      message: "This Bench Pack needs a local verifier runtime. Start Docker Desktop, then try the run again.",
      actionLabel: "Open Verification"
    };
  }

  for (const spec of requiredVerifierSpecs) {
    const runtimeConfig = benchPackConfig?.verifiers?.[spec.id] ?? benchPackConfig?.sidecars?.[spec.id];
    const runtimeStatus = verifierStatus?.verifiers.find((entry) => entry.id === spec.id);

    if ((runtimeConfig?.mode ?? spec.defaultMode) === "docker" && runtimeConfig?.auto_start === false && runtimeStatus?.status !== "running") {
      return {
        title: "Verifier Not Started",
        message: "Auto Start is disabled for this required verifier. Start it from Verification settings before running the Bench Pack.",
        actionLabel: "Open Verification"
      };
    }

    if (runtimeStatus?.status === "missing_dependency") {
      return {
        title: "Docker Required",
        message: runtimeStatus.details ?? "This Bench Pack needs Local Docker before it can run.",
        actionLabel: "Open Verification"
      };
    }

    if (runtimeStatus?.status === "dependency_not_running") {
      return {
        title: "Docker Not Running",
        message: runtimeStatus.details ?? "This Bench Pack needs Local Docker to be running before it can run.",
        actionLabel: "Open Verification"
      };
    }
  }

  return null;
}

export function formatVerifierRuntimeStatus(status: BenchPackVerifierStatus["verifiers"][number]["status"] | undefined): string {
  switch (status) {
    case "missing_dependency":
      return "docker required";
    case "dependency_not_running":
      return "docker not running";
    default:
      return (status ?? "stopped").replaceAll("_", " ");
  }
}