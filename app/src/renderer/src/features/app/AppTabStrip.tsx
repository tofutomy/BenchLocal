import type { DragEvent, RefObject, WheelEvent } from "react";
import { ChevronLeft, ChevronRight, CircleAlert, Plus, X } from "lucide-react";
import type { BenchLocalWorkspaceTab, BenchPackInspection } from "@core";
import type { LiveRunState } from "../runs/run-utils";

type EditingTabState = { tabId: string; value: string; width: number } | null;

type ActiveTabMask = { left: number; width: number } | null;

export function AppTabStrip({
  tabs,
  inspections,
  activeTabId,
  overviewOpen,
  onOpenOverview,
  activeRuns,
  liveRuns,
  editingTab,
  draggedTabId,
  tabStripOverflow,
  activeTabMask,
  tabStripShellRef,
  tabStripRef,
  onTabChipRef,
  onWheel,
  onDragStart,
  onDragEnd,
  onDropTab,
  onStartEditingTab,
  onEditingTabValueChange,
  onCommitEditingTab,
  onCancelEditingTab,
  onActivateTab,
  onOpenTabContextMenu,
  onRequestCloseTab,
  onOpenNewTab,
  onScrollTabs
}: {
  tabs: BenchLocalWorkspaceTab[];
  inspections: BenchPackInspection[];
  activeTabId: string | null;
  overviewOpen: boolean;
  onOpenOverview: () => void;
  activeRuns: Record<string, unknown>;
  liveRuns: Record<string, LiveRunState>;
  editingTab: EditingTabState;
  draggedTabId: string | null;
  tabStripOverflow: boolean;
  activeTabMask: ActiveTabMask;
  tabStripShellRef: RefObject<HTMLDivElement | null>;
  tabStripRef: RefObject<HTMLDivElement | null>;
  onTabChipRef: (tabId: string, element: HTMLButtonElement | null) => void;
  onWheel: (event: WheelEvent<HTMLDivElement>) => void;
  onDragStart: (tabId: string, event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
  onDropTab: (sourceTabId: string, targetTabId: string) => void;
  onStartEditingTab: (tabId: string, title: string) => void;
  onEditingTabValueChange: (tabId: string, value: string) => void;
  onCommitEditingTab: () => void;
  onCancelEditingTab: () => void;
  onActivateTab: (tabId: string) => void;
  onOpenTabContextMenu: (input: { tabId: string; tabTitle: string; x: number; y: number }) => void;
  onRequestCloseTab: (tabId: string, tabTitle: string) => void;
  onOpenNewTab: () => void;
  onScrollTabs: (delta: number) => void;
}) {
  return (
    <div ref={tabStripShellRef} className="tab-strip-shell" onWheel={onWheel}>
      {activeTabMask ? (
        <span
          className="tab-strip-active-mask"
          style={{
            left: `${activeTabMask.left}px`,
            width: `${activeTabMask.width}px`
          }}
        />
      ) : null}
      <div ref={tabStripRef} className="tab-strip">
        <button type="button" className={`tab-chip overview-tab-chip${overviewOpen ? " is-active" : ""}`} onClick={onOpenOverview}>
          Overview
        </button>
        {tabs.map((tab) => {
          const inspection = inspections.find((candidate) => candidate.id === tab.benchPackId);
          const isTabRunning = Boolean(activeRuns[tab.id]);
          const hasTabRetryActivity = (liveRuns[tab.id]?.activeCellKeys.length ?? 0) > 0;
          const showTabSpinner = isTabRunning || hasTabRetryActivity;
          const showWarning = !isTabRunning && inspection && inspection.status !== "ready";
          const isEditingTab = editingTab?.tabId === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              ref={(element) => onTabChipRef(tab.id, element)}
              draggable={!isEditingTab}
              onDragStart={(event) => onDragStart(tab.id, event)}
              onDragEnd={onDragEnd}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                event.preventDefault();
                const sourceTabId = event.dataTransfer.getData("text/plain");
                onDropTab(sourceTabId, tab.id);
                onDragEnd();
              }}
              onDoubleClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onStartEditingTab(tab.id, tab.title);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (isEditingTab) {
                  return;
                }
                onActivateTab(tab.id);
                onOpenTabContextMenu({
                  tabId: tab.id,
                  tabTitle: tab.title,
                  x: event.clientX,
                  y: event.clientY
                });
              }}
              onClick={() => {
                if (isEditingTab) {
                  return;
                }

                onActivateTab(tab.id);
              }}
              className={`tab-chip${activeTabId === tab.id ? " is-active" : ""}${draggedTabId === tab.id ? " is-dragging" : ""}`}
              style={isEditingTab ? { width: `${editingTab.width}px` } : undefined}
            >
              {isEditingTab ? (
                <input
                  type="text"
                  value={editingTab.value}
                  onChange={(event) => onEditingTabValueChange(tab.id, event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                  onDoubleClick={(event) => event.stopPropagation()}
                  onBlur={onCommitEditingTab}
                  onFocus={(event) => event.currentTarget.select()}
                  onKeyDown={(event) => {
                    event.stopPropagation();

                    if (event.key === "Enter") {
                      event.preventDefault();
                      onCommitEditingTab();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      onCancelEditingTab();
                    }
                  }}
                  autoFocus
                  className="tab-chip-title-input"
                />
              ) : (
                <span className="tab-chip-title">{tab.title}</span>
              )}
              {showTabSpinner ? (
                <span className="tab-chip-spinner" title="Scenario pack running">
                  <span className="spinner" />
                </span>
              ) : null}
              {showWarning ? (
                <span className="tab-chip-warning" title={inspection.status.replaceAll("_", " ")}>
                  <CircleAlert size={14} />
                </span>
              ) : null}
              <span
                role="button"
                tabIndex={0}
                className="tab-chip-close"
                onClick={(event) => {
                  event.stopPropagation();
                  if (isEditingTab) {
                    onCancelEditingTab();
                  }
                  onRequestCloseTab(tab.id, tab.title);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    onRequestCloseTab(tab.id, tab.title);
                  }
                }}
              >
                <X size={12} />
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={onOpenNewTab}
          className={`tab-chip-add-button${tabStripOverflow ? " is-sticky" : ""}`}
          aria-label="New tab"
          title="New tab"
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="tab-strip-controls">
        <button
          type="button"
          onClick={() => onScrollTabs(-240)}
          className="tab-strip-nav-button"
          aria-label="Scroll tabs left"
          title="Scroll tabs left"
        >
          <ChevronLeft size={14} />
        </button>
        <button
          type="button"
          onClick={() => onScrollTabs(240)}
          className="tab-strip-nav-button"
          aria-label="Scroll tabs right"
          title="Scroll tabs right"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}