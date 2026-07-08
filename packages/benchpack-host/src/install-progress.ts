export const BENCH_PACK_INSTALL_PHASES = [
  "resolving",
  "downloading",
  "extracting",
  "hydrating",
  "validating",
  "activating",
  "removing",
  "complete"
] as const;

export type BenchPackInstallAction = "install" | "update" | "uninstall";
export type BenchPackInstallPhase = (typeof BENCH_PACK_INSTALL_PHASES)[number];

export type BenchPackInstallProgress = {
  benchPackId: string;
  action: BenchPackInstallAction;
  phase: BenchPackInstallPhase;
  message: string;
};

export type InstallProgressReporter = (progress: BenchPackInstallProgress) => void | Promise<void>;

export function createInstallProgress(
  benchPackId: string,
  action: BenchPackInstallAction,
  phase: BenchPackInstallPhase,
  message: string
): BenchPackInstallProgress {
  return {
    benchPackId,
    action,
    phase,
    message
  };
}

export async function reportInstallProgress(
  reporter: InstallProgressReporter | undefined,
  progress: BenchPackInstallProgress
): Promise<void> {
  await reporter?.(progress);
}
