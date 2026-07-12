import { describe, expect, it } from "vitest";
import { migrateConfigV1 } from "../src/migrations/config-v1.js";
import { migrateWorkspaceV1 } from "../src/migrations/workspace-v1.js";

describe("v1 persisted document migrations", () => {
  it("migrates every supported config alias without mutating the input", () => {
    const raw = {
      default_plugin: "legacy-pack",
      plugin_storage_dir: "/legacy/packs",
      plugins: {
        legacy: {
          source: "registry",
          sidecars: { api: { mode: "docker" } }
        }
      }
    };
    const snapshot = structuredClone(raw);

    expect(migrateConfigV1(raw)).toMatchObject({
      default_benchpack: "legacy-pack",
      benchpack_storage_dir: "/legacy/packs",
      benchpacks: {
        legacy: {
          source: "registry",
          verifiers: { api: { mode: "docker" } }
        }
      }
    });
    expect(raw).toEqual(snapshot);
  });

  it("keeps canonical config fields when aliases are also present", () => {
    const migrated = migrateConfigV1({
      default_benchpack: "current",
      default_bench_pack: "old",
      benchpack_storage_dir: "/current",
      bench_pack_storage_dir: "/old",
      benchpacks: { current: { verifiers: { current: {} }, sidecars: { old: {} } } },
      bench_packs: { old: {} }
    });

    expect(migrated.default_benchpack).toBe("current");
    expect(migrated.benchpack_storage_dir).toBe("/current");
    expect(migrated.benchpacks).toEqual({ current: { verifiers: { current: {} } } });
    expect(migrated).not.toHaveProperty("default_bench_pack");
    expect(migrated).not.toHaveProperty("bench_packs");
  });

  it.each([
    ["parallel_models", "parallel_by_model"],
    ["parallel_scenarios", "parallel_by_test_case"]
  ])("migrates workspace execution mode %s", (legacyMode, expectedMode) => {
    const raw = { tabs: { tab: { pluginId: "legacy", executionMode: legacyMode } } };
    const snapshot = structuredClone(raw);
    const migrated = migrateWorkspaceV1(raw);

    expect(migrated.tabs).toEqual({ tab: { benchPackId: "legacy", executionMode: expectedMode } });
    expect(raw).toEqual(snapshot);
  });

  it("keeps a canonical Bench Pack id over pluginId", () => {
    expect(migrateWorkspaceV1({ tabs: { tab: { benchPackId: "current", pluginId: "old" } } }).tabs)
      .toEqual({ tab: { benchPackId: "current" } });
  });
});
