import { Share2 } from "lucide-react";
import type {
  BenchLocalExecutionMode,
  BenchLocalModelConfig,
  BenchLocalProviderConfig,
  BenchPackRunSummary
} from "@core";
import type { ResultShareCardData } from "./ResultShareCardModal";

type ScoreboardModel = BenchLocalModelConfig & {
  displayLabel: string;
  alias?: string;
};

type ExecutionModeOption = {
  value: BenchLocalExecutionMode;
  label: string;
};

export function BenchmarkScoreboard({
  runSummary,
  selectedModels,
  providers,
  executionMode,
  executionModeOptions,
  currentExecutionModeLabel,
  getProviderDisplayName,
  buildShareCardData,
  onShare
}: {
  runSummary: BenchPackRunSummary;
  selectedModels: ScoreboardModel[];
  providers: Record<string, BenchLocalProviderConfig>;
  executionMode: BenchLocalExecutionMode;
  executionModeOptions: ExecutionModeOption[];
  currentExecutionModeLabel: string;
  getProviderDisplayName: (providers: Record<string, BenchLocalProviderConfig>, providerId: string) => string;
  buildShareCardData: (input: {
    runSummary: BenchPackRunSummary;
    model: ScoreboardModel | undefined;
    providers: Record<string, BenchLocalProviderConfig>;
    score: BenchPackRunSummary["scores"][string];
    runModeLabel: string;
  }) => ResultShareCardData;
  onShare: (data: ResultShareCardData) => void;
}) {
  return (
    <section className="scoreboard">
      {Object.entries(runSummary.scores).map(([modelId, score]) => {
        const model = selectedModels.find((candidate) => candidate.id === modelId);
        const hasScoreData = (runSummary.resultsByModel[modelId]?.length ?? 0) > 0;
        const shareRunModeLabel =
          executionModeOptions.find((option) => option.value === (runSummary.executionMode ?? executionMode))?.label ??
          currentExecutionModeLabel;
        const shareData = buildShareCardData({
          runSummary,
          model,
          providers,
          score,
          runModeLabel: shareRunModeLabel
        });
        const providerName = model ? getProviderDisplayName(providers, model.provider) : "";
        const modelName = model?.model?.trim();
        const modelSubtitle =
          providerName && modelName
            ? `${providerName} · ${modelName}`
            : providerName || modelName || modelId;

        return (
          <div key={modelId} className="score-card score-card-compact">
            <div className="score-card-head">
              <div>
                <h3 style={{ margin: 0, fontSize: "1rem" }}>{model?.displayLabel ?? modelId}</h3>
                <p className="muted-copy" style={{ marginTop: "6px", fontSize: "0.76rem" }}>{modelSubtitle}</p>
              </div>
              <button
                type="button"
                className="ghost-button ghost-button-compact score-share-button"
                disabled={!hasScoreData}
                title={hasScoreData ? "Preview share card" : "No results to share yet"}
                onClick={() => onShare(shareData)}
              >
                <Share2 size={14} />
                Share
              </button>
            </div>
            <div className="score-card-foot">
              <span className={`score-value${hasScoreData ? "" : " score-value-empty"}`}>
                {hasScoreData ? score.totalScore : "—"}
              </span>
              <div className="category-chip-row">
                {score.categories.map((category) => (
                  <span key={category.id} className="status-chip category-chip">
                    {category.id}: {hasScoreData ? category.score : "—"}
                  </span>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}
