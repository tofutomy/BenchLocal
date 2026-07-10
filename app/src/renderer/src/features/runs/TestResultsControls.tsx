import { type RefObject } from "react";
import { Bot, ChevronDown, LayoutList, RotateCcw, SlidersHorizontal } from "lucide-react";
import type { BenchLocalExecutionMode } from "@core";

type ExecutionModeOption = {
  value: BenchLocalExecutionMode;
  label: string;
};

export function TestResultsControls({
  runModeRef,
  runsPerTestRef,
  runModeOpen,
  runsPerTestOpen,
  executionMode,
  executionModeOptions,
  currentExecutionModeLabel,
  runsPerTestOptions,
  currentRunsPerTest,
  hasLiveActivity,
  onToggleRunMode,
  onToggleRunsPerTest,
  onChangeExecutionMode,
  onChangeRunsPerTest,
  onEditSampling,
  onEditModels
}: {
  runModeRef: RefObject<HTMLDivElement | null>;
  runsPerTestRef: RefObject<HTMLDivElement | null>;
  runModeOpen: boolean;
  runsPerTestOpen: boolean;
  executionMode: BenchLocalExecutionMode;
  executionModeOptions: ExecutionModeOption[];
  currentExecutionModeLabel: string;
  runsPerTestOptions: readonly number[];
  currentRunsPerTest: number;
  hasLiveActivity: boolean;
  onToggleRunMode: () => void;
  onToggleRunsPerTest: () => void;
  onChangeExecutionMode: (executionMode: BenchLocalExecutionMode) => void;
  onChangeRunsPerTest: (runsPerTest: number) => void;
  onEditSampling: () => void;
  onEditModels: () => void;
}) {
  return (
    <div className="table-controls">
      <div className="table-controls-heading">
        <LayoutList size={16} />
        <div className="workspace-toolbar-title">Test Results</div>
      </div>
      <div className="table-controls-actions">
        <div ref={runModeRef} className="run-mode-dropdown">
          <button
            type="button"
            className="ghost-button run-mode-button"
            onClick={onToggleRunMode}
            disabled={hasLiveActivity}
            aria-haspopup="menu"
            aria-expanded={runModeOpen}
            title="Run mode"
          >
            <SlidersHorizontal size={14} />
            <span className="run-mode-button-label">Run Mode:</span>
            <span className="run-mode-button-value">{currentExecutionModeLabel}</span>
            <ChevronDown size={15} />
          </button>
          {runModeOpen ? (
            <div className="run-mode-menu" role="menu">
              {executionModeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={executionMode === option.value}
                  className={`run-mode-menu-item${executionMode === option.value ? " is-active" : ""}`}
                  onClick={() => onChangeExecutionMode(option.value)}
                >
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div ref={runsPerTestRef} className="run-mode-dropdown">
          <button
            type="button"
            className="ghost-button run-mode-button"
            onClick={onToggleRunsPerTest}
            disabled={hasLiveActivity}
            aria-haspopup="menu"
            aria-expanded={runsPerTestOpen}
            title="Runs per test"
          >
            <RotateCcw size={14} />
            <span className="run-mode-button-label">Runs:</span>
            <span className="run-mode-button-value">{currentRunsPerTest}x</span>
            <ChevronDown size={15} />
          </button>
          {runsPerTestOpen ? (
            <div className="run-mode-menu" role="menu">
              {runsPerTestOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="menuitemradio"
                  aria-checked={currentRunsPerTest === option}
                  className={`run-mode-menu-item${currentRunsPerTest === option ? " is-active" : ""}`}
                  onClick={() => onChangeRunsPerTest(option)}
                >
                  <span>{option} run{option === 1 ? "" : "s"} per test</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <button type="button" onClick={onEditSampling} className="ghost-button" disabled={hasLiveActivity}>
          <SlidersHorizontal size={14} />
          Samplings
        </button>
        <button type="button" onClick={onEditModels} className="ghost-button" disabled={hasLiveActivity}>
          <Bot size={14} />
          Edit Models
        </button>
      </div>
    </div>
  );
}
