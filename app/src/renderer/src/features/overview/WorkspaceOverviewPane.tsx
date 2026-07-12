import { useEffect, useMemo, useState } from "react";
import type { BenchLocalModelConfig, BenchLocalWorkspaceTab, BenchPackRunSummary } from "@core";
import "./workspace-overview.css";

const AVERAGE_ID = "__all_models_average__";
const SERIES_COLORS = [
  "#4e79a7", // 钢蓝
  "#e15759", // 珊瑚红
  "#59a14f", // 翠绿
  "#f28e2b", // 橙色
  "#b07aa1", // 紫藤
  "#76b7b2", // 青绿
  "#edc948", // 金黄
  "#af7aa1", // 玫瑰紫
  "#ff9da7", // 粉红
  "#9c755f", // 棕褐
];

type OverviewSelection = { selectedTabIds: string[]; selectedSeriesIds: string[] };
type Props = { tabs: BenchLocalWorkspaceTab[]; models: BenchLocalModelConfig[]; overview?: OverviewSelection; onChangeOverview: (overview: OverviewSelection) => void };
type ScoresByTab = Record<string, Record<string, number>>;

export function WorkspaceOverviewPane({ tabs, models, overview, onChangeOverview }: Props) {
  const eligibleTabs = useMemo(() => tabs.filter((tab) => Boolean(tab.benchPackId)), [tabs]);
  const eligibleTabKey = eligibleTabs.map((tab) => `${tab.id}:${tab.benchPackId}`).join("\0");
  const [selectedTabIds, setSelectedTabIds] = useState<string[]>([]);
  const [selectedSeriesIds, setSelectedSeriesIds] = useState<string[]>([AVERAGE_ID]);
  const [scoresByTab, setScoresByTab] = useState<ScoresByTab>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const nextTabs = overview?.selectedTabIds ?? [];
    const nextSeries = overview?.selectedSeriesIds ?? [AVERAGE_ID];
    setSelectedTabIds(nextTabs);
    setSelectedSeriesIds(nextSeries);
  }, [overview?.selectedTabIds.join("\0"), overview?.selectedSeriesIds.join("\0")]);

  const updateOverview = (nextTabIds: string[], nextSeriesIds: string[]) => {
    setSelectedTabIds(nextTabIds);
    setSelectedSeriesIds(nextSeriesIds);
    onChangeOverview({ selectedTabIds: nextTabIds, selectedSeriesIds: nextSeriesIds });
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const entries = await Promise.all(eligibleTabs.map(async (tab) => {
          const history = await window.benchlocal.benchPacks.history({ benchPackId: tab.benchPackId as string });
          const summaries = await Promise.all(history.map((item) =>
            window.benchlocal.benchPacks.loadHistory({ benchPackId: tab.benchPackId as string, runId: item.runId })
          ));
          const modelScores: Record<string, number> = {};
          for (const summary of summaries.sort((a, b) => b.startedAt.localeCompare(a.startedAt))) {
            for (const [modelId, score] of Object.entries(summary.scores)) {
              if (modelScores[modelId] === undefined) modelScores[modelId] = score.totalScore;
            }
          }
          return [tab.id, modelScores] as const;
        }));
        if (!cancelled) setScoresByTab(Object.fromEntries(entries));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [eligibleTabKey]);

  const selectedTabs = eligibleTabs.filter((tab) => selectedTabIds.includes(tab.id));
  const modelRows = models.map((model) => {
    const values = selectedTabs.map((tab) => scoresByTab[tab.id]?.[model.id] ?? null);
    const valid = values.filter((value): value is number => value !== null);
    return { id: model.id, label: model.label, values, overall: average(valid), total: sum(valid), completeness: `${valid.length}/${selectedTabs.length}` };
  });
  // “所有模型均分”只统计当前 Workspace 已添加且有结果的模型。
  const averageValues = selectedTabs.map((tab) =>
    average(models.map((model) => scoresByTab[tab.id]?.[model.id]).filter((value): value is number => value !== undefined))
  );
  const averageRow = {
    id: AVERAGE_ID,
    label: "All models average",
    values: averageValues,
    overall: average(averageValues.filter((value): value is number => value !== null)),
    total: sum(averageValues.filter((value): value is number => value !== null)),
    completeness: `${averageValues.filter((value) => value !== null).length}/${selectedTabs.length}`
  };
  const rows = [averageRow, ...modelRows];
  const chartRows = rows.filter((row) => selectedSeriesIds.includes(row.id));
  // 每个 tab 轴独立计算区间：反推 chartMin 使均值精确落在 70% 半径处
  const axisRanges = selectedTabs.map((tab, tabIndex) => {
    const vals = rows.map((row) => row.values[tabIndex]).filter((v): v is number => v !== null);
    const lo = vals.length ? Math.min(...vals) : 0;
    const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 50;
    // 解方程 (avg - min) / (100 - min) = 0.6 → min = (avg - 70) / 0.3
    // 同时 clamp 不超过 lo，防止最低分溢出到圆心
    const min = Math.min(lo, Math.max(0, Math.floor((avg - 70) / 0.3)));
    return { min, range: 100 - min || 1 };
  });

  const toggle = (values: string[], value: string, checked: boolean) =>
    checked ? Array.from(new Set([...values, value])) : values.filter((item) => item !== value);

  return (
    <div className="tabbed-workspace-pane is-active workspace-overview">
      <header className="overview-header">
        <div><p className="eyebrow">Workspace</p><h2>Overview</h2></div>
        <span className="status-chip status-idle">{selectedTabs.length} selected tabs</span>
      </header>

      <section className="overview-section">
        <h3>Evaluation tabs</h3>
        <div className="overview-check-list">
          {eligibleTabs.map((tab) => (
            <label key={tab.id} className="overview-check-item">
              <input type="checkbox" checked={selectedTabIds.includes(tab.id)} onChange={(event) => updateOverview(toggle(selectedTabIds, tab.id, event.target.checked), selectedSeriesIds)} />
              <span>{tab.title}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="overview-section">
        <h3>Model scores</h3>
        {loading ? <div className="overview-empty"><span className="spinner" /> Loading scores...</div> : (
          <div className="table-scroll">
            <table className="overview-score-table">
              <thead><tr><th>Radar</th><th>Model</th>{selectedTabs.map((tab) => <th key={tab.id}>{tab.title}</th>)}<th>总分</th><th>Overall</th><th>Coverage</th></tr></thead>
              <tbody>{rows.map((row) => (
                <tr key={row.id} className={row.id === AVERAGE_ID ? "is-average" : ""}>
                  <td><input type="checkbox" aria-label={`Show ${row.label} on radar`} checked={selectedSeriesIds.includes(row.id)} onChange={(event) => updateOverview(selectedTabIds, toggle(selectedSeriesIds, row.id, event.target.checked))} /></td>
                  <td>{row.label}</td>
                  {row.values.map((value, index) => <td key={selectedTabs[index]?.id ?? index}>{formatScore(value)}</td>)}
                  <td>{formatScore(row.total)}</td><td>{formatScore(row.overall)}</td><td>{row.completeness}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="overview-section overview-chart-section">
        <h3>Multi-dimensional comparison</h3>
        {selectedTabs.length < 3 ? <div className="overview-empty">Select at least 3 tabs to display the radar chart.</div> : chartRows.length === 0 ? <div className="overview-empty">Select at least one model or the all-model average.</div> : (
          <RadarChart tabs={selectedTabs} rows={chartRows} axisRanges={axisRanges} />
        )}
      </section>
    </div>
  );
}

function average(values: number[]): number | null { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function sum(values: number[]): number | null { return values.length ? values.reduce((total, value) => total + value, 0) : null; }
function formatScore(value: number | null): string { return value === null ? "—" : value.toFixed(1); }

function RadarChart({ tabs, rows, axisRanges }: { tabs: BenchLocalWorkspaceTab[]; rows: Array<{ id: string; label: string; values: Array<number | null> }>; axisRanges: Array<{ min: number; range: number }> }) {
  const width = 680, height = 420, cx = 340, cy = 205, radius = 145;

  const point = (index: number, value: number) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / tabs.length;
    const { min, range } = axisRanges[index] ?? { min: 0, range: 100 };
    const normalized = Math.max(0, Math.min(1, (value - min) / range));
    const distance = radius * normalized;
    return [cx + Math.cos(angle) * distance, cy + Math.sin(angle) * distance] as const;
  };

  // 5 条网格环（按归一化百分比）
  const gridLevels = [0.25, 0.5, 0.75, 1];
  const ringPoints = (level: number) =>
    tabs.map((_, index) => {
      const { min, range } = axisRanges[index] ?? { min: 0, range: 100 };
      return point(index, min + range * level);
    }).map((p) => p.join(",")).join(" ");

  return <div className="overview-radar-wrap">
    <svg className="overview-radar" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Radar comparison of selected models across selected evaluation tabs">
      <title>Model score radar comparison</title>
      {gridLevels.map((level) => <polygon key={level} points={ringPoints(level)} className="radar-grid" />)}
      {tabs.map((tab, index) => {
        const { min, range } = axisRanges[index] ?? { min: 0, range: 100 };
        const end = point(index, min + range);
        const label = point(index, min + range * 1.15);
        return <g key={tab.id}>
          <line x1={cx} y1={cy} x2={end[0]} y2={end[1]} className="radar-axis" />
          <text x={label[0]} y={label[1]} textAnchor={label[0] < cx - 10 ? "end" : label[0] > cx + 10 ? "start" : "middle"} className="radar-label">{tab.title}
            <tspan className="radar-scale-label"> [{Math.round(min)}–{Math.round(min + range)}]</tspan>
          </text>
        </g>;
      })}
      {rows.map((row, rowIndex) => {
        const points = row.values.map((value, index) => {
          const { min } = axisRanges[index] ?? { min: 0, range: 100 };
          return point(index, value ?? min);
        });
        const color = SERIES_COLORS[rowIndex % SERIES_COLORS.length];
        return <g key={row.id} style={{ color }}><polygon points={points.map((item) => item.join(",")).join(" ")} className="radar-series"/>{points.map((item, index) => <circle key={tabs[index].id} cx={item[0]} cy={item[1]} r="3.5" className="radar-point"><title>{row.label} · {tabs[index].title}: {formatScore(row.values[index])}</title></circle>)}</g>;
      })}
    </svg>
    <div className="overview-radar-legend">{rows.map((row, index) => <span key={row.id}><i style={{ background: SERIES_COLORS[index % SERIES_COLORS.length] }} />{row.label}</span>)}</div>
  </div>;
}