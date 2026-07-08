import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createDefaultConfig,
  loadConfigFile,
  loadOrCreateConfig,
  saveConfigFile,
  type BenchLocalConfig
} from "../src/config.js";

const tempRoots: string[] = [];

async function createTempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "benchlocal-config-test-"));
  tempRoots.push(root);
  vi.spyOn(os, "homedir").mockReturnValue(root);
  return root;
}

function tomlPath(input: string): string {
  return input.replace(/\\/g, "/");
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("config persistence", () => {
  it("normalizes legacy config keys and inferred provider defaults", async () => {
    const root = await createTempRoot();
    const configPath = path.join(root, "config.toml");

    await fs.writeFile(
      configPath,
      `schema_version = 1
      default_bench_pack = "legacy-pack"
      run_storage_dir = "${tomlPath(path.join(root, "runs"))}"
      bench_pack_storage_dir = "${tomlPath(path.join(root, "benchpacks"))}"
      log_storage_dir = "${tomlPath(path.join(root, "logs"))}"
      cache_dir = "${tomlPath(path.join(root, "cache"))}"

      [registry]
      official_url = "https://registry.example.test/registry.json"

      [providers.openrouter]
      base_url = "https://openrouter.ai/api/v1"

      [[models]]
      id = "model-a"
      provider = "openrouter"
      model = "openai/gpt-4o-mini"
      label = "GPT 4o Mini"

      [bench_packs.legacy]
      source = "github"
      repo = "owner/repo"

      [bench_packs.legacy.sidecars.api]
      mode = "custom_url"
      custom_url = "http://127.0.0.1:8080"
      `,
      "utf8"
    );

    const config = await loadConfigFile(configPath);

    expect(config.default_benchpack).toBe("legacy-pack");
    expect(config.benchpack_storage_dir).toBe(tomlPath(path.join(root, "benchpacks")));
    expect(config.providers.openrouter).toMatchObject({
      kind: "openrouter",
      name: "OpenRouter",
      enabled: true,
      base_url: "https://openrouter.ai/api/v1"
    });
    expect(config.models[0]).toMatchObject({ group: "primary", enabled: true });
    expect(config.benchpacks.legacy).toMatchObject({ source: "github", repo: "owner/repo" });
    expect(config.benchpacks.legacy.verifiers?.api).toMatchObject({
      mode: "custom_url",
      custom_url: "http://127.0.0.1:8080"
    });
    await expect(fs.stat(path.join(root, "runs"))).resolves.toBeDefined();
  });

  it("rejects duplicate model ids before writing config", async () => {
    const root = await createTempRoot();
    const base = createDefaultConfig();
    const config: BenchLocalConfig = {
      ...base,
      run_storage_dir: path.join(root, "runs"),
      benchpack_storage_dir: path.join(root, "benchpacks"),
      log_storage_dir: path.join(root, "logs"),
      cache_dir: path.join(root, "cache"),
      providers: {
        local: {
          kind: "openai_compatible",
          name: "Local",
          enabled: true,
          base_url: "http://127.0.0.1:11434"
        }
      },
      models: [
        { id: "duplicate", provider: "local", model: "model-a", label: "Model A", group: "primary", enabled: true },
        { id: "duplicate", provider: "local", model: "model-b", label: "Model B", group: "primary", enabled: true }
      ]
    };

    await expect(saveConfigFile(config, path.join(root, "config.toml"))).rejects.toThrow(/Duplicate model/);
    await expect(fs.stat(path.join(root, "config.toml"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not recreate defaults when an existing config file is invalid", async () => {
    const root = await createTempRoot();
    const configPath = path.join(root, "config.toml");
    const invalidBody = "schema_version = 1\nrun_storage_dir = [";
    await fs.writeFile(configPath, invalidBody, "utf8");

    await expect(loadOrCreateConfig(configPath)).rejects.toThrow();
    await expect(fs.readFile(configPath, "utf8")).resolves.toBe(invalidBody);
  });

  it("rejects models that reference unknown providers", async () => {
    const root = await createTempRoot();
    const configPath = path.join(root, "config.toml");

    await fs.writeFile(
      configPath,
      `schema_version = 1
      run_storage_dir = "${tomlPath(path.join(root, "runs"))}"
      benchpack_storage_dir = "${tomlPath(path.join(root, "benchpacks"))}"
      log_storage_dir = "${tomlPath(path.join(root, "logs"))}"
      cache_dir = "${tomlPath(path.join(root, "cache"))}"

      [[models]]
      id = "orphan"
      provider = "missing-provider"
      model = "missing/model"
      label = "Orphan Model"
      `,
      "utf8"
    );

    await expect(loadConfigFile(configPath)).rejects.toThrow(/references unknown provider/);
  });
});
