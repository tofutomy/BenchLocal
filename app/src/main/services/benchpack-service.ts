import type { BenchLocalConfig } from "@core";
import {
  inspectConfiguredBenchPacks,
  installBenchPackFromRegistry,
  installBenchPackFromUrl,
  loadBenchPackRegistry,
  uninstallBenchPack,
  updateBenchPackFromRegistry
} from "@benchpack-host";
import type { ConfigService } from "./config-service";

export type RuntimeCompatibility = {
  benchLocalVersion: string;
};

export type BenchPackMutationProgress = {
  benchPackId: string;
  action: "install" | "update" | "uninstall";
  phase: "resolving" | "downloading" | "extracting" | "hydrating" | "validating" | "activating" | "removing" | "complete";
  message: string;
};

type BenchPackHostOperations = {
  inspectConfiguredBenchPacks: typeof inspectConfiguredBenchPacks;
  loadBenchPackRegistry: typeof loadBenchPackRegistry;
  installBenchPackFromRegistry: typeof installBenchPackFromRegistry;
  installBenchPackFromUrl: typeof installBenchPackFromUrl;
  updateBenchPackFromRegistry: typeof updateBenchPackFromRegistry;
  uninstallBenchPack: typeof uninstallBenchPack;
};

const defaultOperations: BenchPackHostOperations = {
  inspectConfiguredBenchPacks,
  loadBenchPackRegistry,
  installBenchPackFromRegistry,
  installBenchPackFromUrl,
  updateBenchPackFromRegistry,
  uninstallBenchPack
};

export class BenchPackService {
  private readonly operations: BenchPackHostOperations;

  constructor(
    private readonly configService: ConfigService,
    private readonly getRuntimeCompatibility: () => Promise<RuntimeCompatibility>,
    operations: Partial<BenchPackHostOperations> = {}
  ) {
    // Host 操作可在单元测试中按需替换，生产路径仍使用 benchpack-host 的真实实现。
    this.operations = { ...defaultOperations, ...operations };
  }

  async listBenchPacks() {
    const { config } = await this.configService.loadConfig();
    return this.operations.inspectConfiguredBenchPacks(config, await this.getRuntimeCompatibility());
  }

  async loadBenchPackRegistry() {
    const { config } = await this.configService.loadConfig();
    return this.operations.loadBenchPackRegistry(config);
  }

  async installBenchPack(
    benchPackId: string,
    onProgress?: (progress: BenchPackMutationProgress) => void
  ) {
    const { config } = await this.configService.loadConfig();
    const saved = await this.operations.installBenchPackFromRegistry(
      config,
      benchPackId,
      onProgress,
      await this.getRuntimeCompatibility()
    );
    return this.configService.saveConfig(saved);
  }

  async installBenchPackFromUrl(
    url: string,
    onProgress?: (progress: BenchPackMutationProgress) => void
  ) {
    const { config } = await this.configService.loadConfig();
    const saved = await this.operations.installBenchPackFromUrl(
      config,
      url,
      onProgress,
      await this.getRuntimeCompatibility()
    );
    return this.configService.saveConfig(saved);
  }

  async updateBenchPack(
    benchPackId: string,
    onProgress?: (progress: BenchPackMutationProgress) => void
  ) {
    const { config } = await this.configService.loadConfig();
    const saved = await this.operations.updateBenchPackFromRegistry(
      config,
      benchPackId,
      onProgress,
      await this.getRuntimeCompatibility()
    );
    return this.configService.saveConfig(saved);
  }

  async uninstallBenchPack(
    benchPackId: string,
    onProgress?: (progress: BenchPackMutationProgress) => void
  ) {
    const { config } = await this.configService.loadConfig();
    const saved = await this.operations.uninstallBenchPack(config, benchPackId, onProgress);
    return this.configService.saveConfig(saved);
  }
}
