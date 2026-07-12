import { copyPersistedDocument, isPersistedDocument, type PersistedDocument } from "./types.js";

function migrateBenchPackV1(value: unknown): unknown {
  if (!isPersistedDocument(value)) return value;

  const migrated = { ...value };
  if (migrated.verifiers === undefined && isPersistedDocument(migrated.sidecars)) {
    migrated.verifiers = { ...migrated.sidecars };
  }
  delete migrated.sidecars;
  return migrated;
}

function migrateBenchPacksV1(value: unknown): unknown {
  if (!isPersistedDocument(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([id, benchPack]) => [id, migrateBenchPackV1(benchPack)]));
}

/** 将历史配置别名迁移为当前 v1 字段；默认值与业务校验由后续解析阶段负责。 */
export function migrateConfigV1(raw: unknown): PersistedDocument {
  const migrated = copyPersistedDocument(raw);

  migrated.default_benchpack ??=
    typeof migrated.default_bench_pack === "string"
      ? migrated.default_bench_pack
      : typeof migrated.default_plugin === "string"
        ? migrated.default_plugin
        : undefined;
  migrated.benchpack_storage_dir ??=
    typeof migrated.bench_pack_storage_dir === "string"
      ? migrated.bench_pack_storage_dir
      : typeof migrated.plugin_storage_dir === "string"
        ? migrated.plugin_storage_dir
        : undefined;
  migrated.benchpacks ??=
    isPersistedDocument(migrated.bench_packs)
      ? migrated.bench_packs
      : isPersistedDocument(migrated.plugins)
        ? migrated.plugins
        : undefined;

  if (migrated.benchpacks !== undefined) migrated.benchpacks = migrateBenchPacksV1(migrated.benchpacks);
  delete migrated.default_bench_pack;
  delete migrated.default_plugin;
  delete migrated.bench_pack_storage_dir;
  delete migrated.plugin_storage_dir;
  delete migrated.bench_packs;
  delete migrated.plugins;
  return migrated;
}
