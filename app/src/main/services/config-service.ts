import type { BenchLocalAgentSafeConfig, BenchLocalConfig } from "@core";
import { getConfigPath, loadOrCreateConfig, saveConfigFile } from "@core";
import type { AgentEventBus } from "./agent-event-bus";

// 配置返回给 Agent 前必须统一脱敏，避免各入口分别维护敏感字段规则。
export function redactConfig(config: BenchLocalConfig): BenchLocalAgentSafeConfig {
  return {
    ...config,
    providers: Object.fromEntries(
      Object.entries(config.providers).map(([providerId, provider]) => [
        providerId,
        {
          kind: provider.kind,
          name: provider.name,
          enabled: provider.enabled,
          base_url: provider.base_url,
          api_key_env: provider.api_key_env,
          has_api_key: Boolean(provider.api_key?.trim()),
          has_api_key_env: Boolean(provider.api_key_env?.trim())
        }
      ])
    )
  };
}

export class ConfigService {
  constructor(private readonly eventBus: AgentEventBus) {}

  loadConfig() {
    return loadOrCreateConfig();
  }

  async saveConfig(config: BenchLocalConfig) {
    const configPath = getConfigPath();
    const saved = await saveConfigFile(config, configPath);
    const result = {
      path: configPath,
      created: false,
      config: saved
    };

    this.eventBus.emitAgentEvent("config.updated", {
      config: redactConfig(saved)
    });

    return result;
  }

  async getSafeConfig(): Promise<BenchLocalAgentSafeConfig> {
    const { config } = await this.loadConfig();
    return redactConfig(config);
  }
}
