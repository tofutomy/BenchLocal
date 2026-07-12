import { useState, type Dispatch, type MutableRefObject, type ReactNode, type RefObject, type SetStateAction } from "react";
import type { BenchLocalWorkspaceTab, BenchPackInspection } from "@core";
import type { LiveRunState } from "../runs/run-utils";
import type { TabContextMenuState, WorkspaceContextMenuState } from "../workspaces/WorkspaceContextMenus";
import { AppTabStrip } from "./AppTabStrip";

type EditingTabState = { tabId: string; value: string; width: number } | null;
type ActiveTabMask = { left: number; width: number } | null;

export function AppTabbedWorkspace({
  tabs,
  inspections,
  activeTab,
  activeInspection,
  activeRuns,
  liveRuns,
  editingTab,
  draggedTabId,
  tabStripOverflow,
  activeTabMask,
  tabStripShellRef,
  tabStripRef,
  tabChipRefs,
  webPanes,
  tablePane,
  emptyPane,
  overviewPane,
  onWheel,
  onDropTab,
  onStartEditingTab,
  onCommitEditingTab,
  onCancelEditingTab,
  onActivateTab,
  onRequestCloseTab,
  onOpenNewTab,
  onScrollTabs,
  setDraggedTabId,
  setEditingTab,
  setWorkspaceContextMenu,
  setTabContextMenu
}: {
  tabs: BenchLocalWorkspaceTab[];
  inspections: BenchPackInspection[];
  activeTab: BenchLocalWorkspaceTab | null;
  activeInspection: BenchPackInspection | null;
  activeRuns: Record<string, unknown>;
  liveRuns: Record<string, LiveRunState>;
  editingTab: EditingTabState;
  draggedTabId: string | null;
  tabStripOverflow: boolean;
  activeTabMask: ActiveTabMask;
  tabStripShellRef: RefObject<HTMLDivElement | null>;
  tabStripRef: RefObject<HTMLDivElement | null>;
  tabChipRefs: MutableRefObject<Map<string, HTMLButtonElement>>;
  webPanes: ReactNode;
  tablePane: ReactNode;
  emptyPane: ReactNode;
  overviewPane: ReactNode;
  onWheel: (event: React.WheelEvent<HTMLDivElement>) => void;
  onDropTab: (sourceTabId: string, targetTabId: string) => void;
  onStartEditingTab: (tabId: string, title: string) => void;
  onCommitEditingTab: () => void;
  onCancelEditingTab: () => void;
  onActivateTab: (tabId: string) => void;
  onRequestCloseTab: (tabId: string, tabTitle: string) => void;
  onOpenNewTab: () => void;
  onScrollTabs: (delta: number) => void;
  setDraggedTabId: Dispatch<SetStateAction<string | null>>;
  setEditingTab: Dispatch<SetStateAction<EditingTabState>>;
  setWorkspaceContextMenu: Dispatch<SetStateAction<WorkspaceContextMenuState>>;
  setTabContextMenu: Dispatch<SetStateAction<TabContextMenuState>>;
}) {
  const [overviewOpen, setOverviewOpen] = useState(false);
  const showTablePane = activeInspection && activeTab && (activeInspection.manifest?.type ?? "table") !== "web";

  return (
    <div className="tabbed-workspace">
      <AppTabStrip
        tabs={tabs}
        inspections={inspections}
        activeTabId={overviewOpen ? null : activeTab?.id ?? null}
        overviewOpen={overviewOpen}
        onOpenOverview={() => setOverviewOpen(true)}
        activeRuns={activeRuns}
        liveRuns={liveRuns}
        editingTab={editingTab}
        draggedTabId={draggedTabId}
        tabStripOverflow={tabStripOverflow}
        activeTabMask={overviewOpen ? null : activeTabMask}
        tabStripShellRef={tabStripShellRef}
        tabStripRef={tabStripRef}
        onTabChipRef={(tabId, element) => {
          if (element) {
            tabChipRefs.current.set(tabId, element);
          } else {
            tabChipRefs.current.delete(tabId);
          }
        }}
        onWheel={onWheel}
        onDragStart={(tabId, event) => {
          event.dataTransfer.setData("text/plain", tabId);
          event.dataTransfer.effectAllowed = "move";
          setDraggedTabId(tabId);
        }}
        onDragEnd={() => setDraggedTabId(null)}
        onDropTab={onDropTab}
        onStartEditingTab={onStartEditingTab}
        onEditingTabValueChange={(tabId, value) =>
          setEditingTab((current) => (current && current.tabId === tabId ? { ...current, value } : current))
        }
        onCommitEditingTab={onCommitEditingTab}
        onCancelEditingTab={onCancelEditingTab}
        onActivateTab={(tabId) => {
          setOverviewOpen(false);
          onActivateTab(tabId);
        }}
        onOpenTabContextMenu={({ tabId, tabTitle, x, y }) => {
          setWorkspaceContextMenu(null);
          setTabContextMenu({ tabId, tabTitle, x, y });
        }}
        onRequestCloseTab={onRequestCloseTab}
        onOpenNewTab={onOpenNewTab}
        onScrollTabs={onScrollTabs}
      />

      <div className="tabbed-workspace-content">
        {overviewOpen ? overviewPane : webPanes}
        {!overviewOpen && activeInspection && activeTab ? (
          showTablePane ? tablePane : null
        ) : !overviewOpen ? (
          <div className="tabbed-workspace-pane is-active">{emptyPane}</div>
        ) : null}
      </div>
    </div>
  );
}
