import {
  clearRunHistoryForBenchPack,
  deleteRunHistoryForBenchPack,
  listRunHistoryForBenchPack,
  loadRunSummaryForBenchPack
} from "@benchpack-host";
import type { ConfigService } from "./config-service";

type HistoryHostOperations = {
  listRunHistoryForBenchPack: typeof listRunHistoryForBenchPack;
  loadRunSummaryForBenchPack: typeof loadRunSummaryForBenchPack;
  clearRunHistoryForBenchPack: typeof clearRunHistoryForBenchPack;
  deleteRunHistoryForBenchPack: typeof deleteRunHistoryForBenchPack;
};

const defaultOperations: HistoryHostOperations = {
  listRunHistoryForBenchPack,
  loadRunSummaryForBenchPack,
  clearRunHistoryForBenchPack,
  deleteRunHistoryForBenchPack
};

export class HistoryService {
  private readonly operations: HistoryHostOperations;

  constructor(
    private readonly configService: ConfigService,
    operations: Partial<HistoryHostOperations> = {}
  ) {
    // 历史记录服务只负责编排配置与存储操作，不持有运行时状态。
    this.operations = { ...defaultOperations, ...operations };
  }

  async listRunHistory(benchPackId: string) {
    const { config } = await this.configService.loadConfig();
    return this.operations.listRunHistoryForBenchPack(config, benchPackId);
  }

  async loadRunHistory(benchPackId: string, runId: string) {
    const { config } = await this.configService.loadConfig();
    return this.operations.loadRunSummaryForBenchPack(config, benchPackId, runId);
  }

  async clearRunHistory(benchPackId: string) {
    const { config } = await this.configService.loadConfig();
    return this.operations.clearRunHistoryForBenchPack(config, benchPackId);
  }

  async deleteRunHistory(benchPackId: string, runIds: string[]) {
    const { config } = await this.configService.loadConfig();
    return this.operations.deleteRunHistoryForBenchPack(config, benchPackId, runIds);
  }
}
