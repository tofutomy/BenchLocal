import { ChevronDown } from "lucide-react";
import type { ScenarioMeta } from "@core";

function DetailCard({ title, content }: { title: string; content: string }) {
  const toneClass =
    title === "What this tests"
      ? "is-blue"
      : title === "Prompt Contract"
        ? "is-amber"
        : "is-slate";

  const lines = content.split("\n");

  return (
    <article className={`detail-card ${toneClass}`}>
      <div className="detail-card-summary">
        <h4>{title}</h4>
      </div>
      <p className="detail-copy">
        {lines.map((line, lineIndex) => (
          <span key={`${title}-${lineIndex}`}>
            {line.split(/(`[^`]+`)/g).map((part, partIndex) => {
              if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
                return (
                  <code key={`${title}-${lineIndex}-${partIndex}`} className="detail-inline-code">
                    {part.slice(1, -1)}
                  </code>
                );
              }

              return <span key={`${title}-${lineIndex}-${partIndex}`}>{part}</span>;
            })}
            {lineIndex < lines.length - 1 ? <br /> : null}
          </span>
        ))}
      </p>
    </article>
  );
}

export function ScenarioDetailPanel({
  scenario,
  hasRunSummary
}: {
  scenario: ScenarioMeta | null;
  hasRunSummary: boolean;
}) {
  const detailCards = scenario?.detailCards?.length
    ? scenario.detailCards
    : [
        {
          title: "What this tests",
          content:
            scenario?.description ??
            "Click a scenario column in the Bench Pack table below to inspect that scenario."
        },
        {
          title: "Prompt Contract",
          content:
            scenario?.description ??
            "The active scenario follows the selected table column. Richer prompt or methodology detail will appear here as Bench Pack metadata expands."
        },
        {
          title: "Run Notes",
          content: hasRunSummary
            ? "Click a scenario column to switch context. Click any result cell to inspect the trace and summary for that model and scenario."
            : "Run this Bench Pack, then use the scenario columns in the table below to switch the preview context."
        }
      ];

  return (
    <details className="scenario-focus" open>
      <summary className="scenario-focus-header">
        <div>
          <p className="eyebrow">Scenario Detail</p>
          <h3>{scenario ? `${scenario.id} · ${scenario.title}` : "No scenario selected"}</h3>
        </div>
        <div className="scenario-focus-summary-actions">
          <ChevronDown size={16} className="scenario-focus-chevron" />
        </div>
      </summary>

      <div className="scenario-detail-grid scenario-detail-grid-main">
        {detailCards.map((card) => (
          <DetailCard key={card.title} title={card.title} content={card.content} />
        ))}
      </div>
    </details>
  );
}
