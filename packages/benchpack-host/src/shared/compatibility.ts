import type { BenchPackManifest } from "@benchlocal/core";

export type BenchLocalRuntimeCompatibility = {
  benchLocalVersion?: string;
  hostFeatures?: string[];
};

type BenchPackManifestRequirements = {
  benchlocal?: {
    minVersion?: string;
    maxVersionExclusive?: string;
  };
  hostFeatures?: string[];
};

type BenchPackManifestWithRequirements = BenchPackManifest & {
  requirements?: BenchPackManifestRequirements;
};

const SUPPORTED_BENCHLOCAL_HOST_FEATURES = ["inferenceEndpoints", "dockerInferenceEndpoints"] as const;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

// 兼容性校验集中在一个纯模块中，避免安装、inspection 和 runtime 各自维护版本规则。
export function isBenchPackCompatibilityRequirements(value: unknown): value is BenchPackManifestRequirements {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const benchlocal = candidate.benchlocal;

  if (benchlocal !== undefined) {
    if (typeof benchlocal !== "object" || benchlocal === null) {
      return false;
    }

    const runtime = benchlocal as Record<string, unknown>;
    if (runtime.minVersion !== undefined && typeof runtime.minVersion !== "string") {
      return false;
    }

    if (runtime.maxVersionExclusive !== undefined && typeof runtime.maxVersionExclusive !== "string") {
      return false;
    }
  }

  if (candidate.hostFeatures !== undefined && !isStringArray(candidate.hostFeatures)) {
    return false;
  }

  return true;
}

type ParsedSemanticVersion = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
};

function parseSemanticVersion(input: string): ParsedSemanticVersion | null {
  const normalized = input.trim();

  if (!normalized) {
    return null;
  }

  const [coreAndPrerelease] = normalized.split("+", 1);
  const [core, prereleaseRaw] = coreAndPrerelease.split("-", 2);
  const parts = core.split(".");

  if (parts.length > 3 || parts.length === 0) {
    return null;
  }

  const [majorRaw, minorRaw = "0", patchRaw = "0"] = parts;
  if (![majorRaw, minorRaw, patchRaw].every((entry) => /^\d+$/.test(entry))) {
    return null;
  }

  return {
    major: Number(majorRaw),
    minor: Number(minorRaw),
    patch: Number(patchRaw),
    prerelease: prereleaseRaw ? prereleaseRaw.split(".").filter(Boolean) : []
  };
}

function comparePrereleaseIdentifiers(left: string[], right: string[]): number {
  const maxLength = Math.max(left.length, right.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];

    if (leftValue === undefined) {
      return -1;
    }

    if (rightValue === undefined) {
      return 1;
    }

    const leftNumeric = /^\d+$/.test(leftValue);
    const rightNumeric = /^\d+$/.test(rightValue);

    if (leftNumeric && rightNumeric) {
      const difference = Number(leftValue) - Number(rightValue);
      if (difference !== 0) {
        return difference < 0 ? -1 : 1;
      }
      continue;
    }

    if (leftNumeric !== rightNumeric) {
      return leftNumeric ? -1 : 1;
    }

    const comparison = leftValue.localeCompare(rightValue);
    if (comparison !== 0) {
      return comparison < 0 ? -1 : 1;
    }
  }

  return 0;
}

function compareSemanticVersions(leftRaw: string, rightRaw: string): number | null {
  const left = parseSemanticVersion(leftRaw);
  const right = parseSemanticVersion(rightRaw);

  if (!left || !right) {
    return null;
  }

  for (const key of ["major", "minor", "patch"] as const) {
    if (left[key] !== right[key]) {
      return left[key] < right[key] ? -1 : 1;
    }
  }

  if (left.prerelease.length === 0 && right.prerelease.length === 0) {
    return 0;
  }

  if (left.prerelease.length === 0) {
    return 1;
  }

  if (right.prerelease.length === 0) {
    return -1;
  }

  return comparePrereleaseIdentifiers(left.prerelease, right.prerelease);
}

function getBenchLocalHostFeatures(runtime?: BenchLocalRuntimeCompatibility): Set<string> {
  return new Set(runtime?.hostFeatures?.length ? runtime.hostFeatures : SUPPORTED_BENCHLOCAL_HOST_FEATURES);
}

export function getBenchPackCompatibilityError(
  manifest: BenchPackManifest,
  runtime?: BenchLocalRuntimeCompatibility
): string | undefined {
  const requirements = (manifest as BenchPackManifestWithRequirements).requirements;

  if (!requirements) {
    return undefined;
  }

  const benchLocalVersion = runtime?.benchLocalVersion?.trim();
  const minVersion = requirements.benchlocal?.minVersion?.trim();
  const maxVersionExclusive = requirements.benchlocal?.maxVersionExclusive?.trim();

  if (minVersion) {
    if (!benchLocalVersion) {
      return "This Bench Pack requires BenchLocal >= " + minVersion + ".";
    }

    const comparison = compareSemanticVersions(benchLocalVersion, minVersion);
    if (comparison === null) {
      return "This Bench Pack declares an invalid minimum BenchLocal version requirement: " + minVersion + ".";
    }

    if (comparison < 0) {
      return "This Bench Pack requires BenchLocal >= " + minVersion + ". Current client: " + benchLocalVersion + ".";
    }
  }

  if (maxVersionExclusive) {
    if (!benchLocalVersion) {
      return "This Bench Pack requires BenchLocal < " + maxVersionExclusive + ".";
    }

    const comparison = compareSemanticVersions(benchLocalVersion, maxVersionExclusive);
    if (comparison === null) {
      return "This Bench Pack declares an invalid maximum BenchLocal version requirement: " + maxVersionExclusive + ".";
    }

    if (comparison >= 0) {
      return "This Bench Pack requires BenchLocal < " + maxVersionExclusive + ". Current client: " + benchLocalVersion + ".";
    }
  }

  const requiredHostFeatures = requirements.hostFeatures?.map((feature) => feature.trim()).filter(Boolean) ?? [];
  if (requiredHostFeatures.length > 0) {
    const availableFeatures = getBenchLocalHostFeatures(runtime);
    const missingFeatures = requiredHostFeatures.filter((feature) => !availableFeatures.has(feature));

    if (missingFeatures.length > 0) {
      return "This Bench Pack requires unsupported BenchLocal host features: " + missingFeatures.join(", ") + ".";
    }
  }

  return undefined;
}
