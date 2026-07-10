import type { ProgressEvent } from "@core";
import {
  deleteConfiguredBenchPackVerifierImage,
  getConfiguredBenchPackVerifierStatus,
  startConfiguredBenchPackVerifiers,
  stopConfiguredBenchPackVerifiers
} from "@benchpack-host";
import type { AgentEventBus } from "./agent-event-bus";
import type { BenchPackService } from "./benchpack-service";
import type { ConfigService } from "./config-service";

export type VerifierPreparationProgress = Extract<ProgressEvent, { type: "verifier_preparing" }>;

type VerifierHostOperations = {
  getConfiguredBenchPackVerifierStatus: typeof getConfiguredBenchPackVerifierStatus;
  startConfiguredBenchPackVerifiers: typeof startConfiguredBenchPackVerifiers;
  stopConfiguredBenchPackVerifiers: typeof stopConfiguredBenchPackVerifiers;
  deleteConfiguredBenchPackVerifierImage: typeof deleteConfiguredBenchPackVerifierImage;
};

const defaultOperations: VerifierHostOperations = {
  getConfiguredBenchPackVerifierStatus,
  startConfiguredBenchPackVerifiers,
  stopConfiguredBenchPackVerifiers,
  deleteConfiguredBenchPackVerifierImage
};

const VERIFIER_RELEASE_TIMEOUT_MS = 15000;

export class VerifierService {
  private readonly activeStarts = new Map<string, { controller: AbortController }>();
  private readonly operations: VerifierHostOperations;

  constructor(
    private readonly eventBus: AgentEventBus,
    private readonly configService: ConfigService,
    private readonly benchPackService: BenchPackService,
    operations: Partial<VerifierHostOperations> = {}
  ) {
    this.operations = { ...defaultOperations, ...operations };
  }

  async listVerifiers() {
    const { config } = await this.configService.loadConfig();
    const inspections = await this.benchPackService.listBenchPacks();
    const relevant = inspections.filter(
      (inspection) => inspection.manifest?.capabilities.verification || inspection.manifest?.capabilities.sidecars
    );
    return Promise.all(
      relevant.map((inspection) => this.operations.getConfiguredBenchPackVerifierStatus(config, inspection.id))
    );
  }

  async startVerifier(
    benchPackId: string,
    onProgress?: (progress: VerifierPreparationProgress) => void
  ) {
    const existingActiveStart = this.activeStarts.get(benchPackId);

    if (existingActiveStart) {
      if (existingActiveStart.controller.signal.aborted) {
        await this.waitForStartRelease(benchPackId);
      } else {
        throw new Error(`Verifier startup is already active for Bench Pack "${benchPackId}".`);
      }
    }

    const { config } = await this.configService.loadConfig();
    const currentStatus = await this.operations.getConfiguredBenchPackVerifierStatus(config, benchPackId);
    const controller = new AbortController();
    this.activeStarts.set(benchPackId, { controller });

    try {
      return await this.operations.startConfiguredBenchPackVerifiers(config, benchPackId, {
        abortSignal: controller.signal,
        onProgress: (progress) => {
          const event: VerifierPreparationProgress = {
            type: "verifier_preparing",
            benchPackId,
            benchPackName: currentStatus.benchPackName,
            verifierId: progress.verifierId,
            phase: progress.phase,
            message: progress.message
          };
          this.eventBus.emitAgentEvent("verifier.event", { benchPackId, event });
          onProgress?.(event);
        }
      });
    } finally {
      this.activeStarts.delete(benchPackId);
    }
  }

  async stopVerifier(benchPackId: string) {
    const { config } = await this.configService.loadConfig();
    return this.operations.stopConfiguredBenchPackVerifiers(config, benchPackId);
  }

  cancelVerifierStart(benchPackId: string) {
    const activeStart = this.activeStarts.get(benchPackId);
    if (!activeStart) return { cancelled: false };

    activeStart.controller.abort(new Error("Verifier start cancelled by user."));
    return { cancelled: true };
  }

  async deleteVerifierImage(benchPackId: string, verifierId: string) {
    const { config } = await this.configService.loadConfig();
    return this.operations.deleteConfiguredBenchPackVerifierImage(config, benchPackId, verifierId);
  }

  hasActiveStarts(): boolean {
    return this.activeStarts.size > 0;
  }

  // 应用退出时只发出取消信号，统一等待仍由 Controller 与 active runs 共用同一截止时间。
  cancelActiveStartsForShutdown(): void {
    for (const activeStart of this.activeStarts.values()) {
      activeStart.controller.abort(new Error("Verifier start cancelled because BenchLocal is shutting down."));
    }
  }

  private async waitForStartRelease(benchPackId: string) {
    const deadline = Date.now() + VERIFIER_RELEASE_TIMEOUT_MS;

    while (this.activeStarts.has(benchPackId)) {
      if (Date.now() >= deadline) {
        throw new Error(`Timed out while waiting for verifier startup "${benchPackId}" to stop.`);
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}
