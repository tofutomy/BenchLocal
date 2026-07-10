import type { BenchLocalConfig } from "@core";

export function cloneConfig(config: BenchLocalConfig): BenchLocalConfig {
  return structuredClone(config);
}

const FILESYSTEM_CONFIG_KEYS = [
  "run_storage_dir",
  "benchpack_storage_dir",
  "log_storage_dir",
  "cache_dir"
] as const satisfies Array<keyof BenchLocalConfig>;

export function reapplyPendingFilesystemDraft(
  baseConfig: BenchLocalConfig,
  currentDraft: BenchLocalConfig,
  persistedConfig: BenchLocalConfig
): BenchLocalConfig {
  const nextConfig = cloneConfig(baseConfig);

  for (const key of FILESYSTEM_CONFIG_KEYS) {
    if (currentDraft[key] !== persistedConfig[key]) {
      nextConfig[key] = currentDraft[key];
    }
  }

  return nextConfig;
}