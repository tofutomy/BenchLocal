import { Copy, Pencil, Save, Trash2, X } from "lucide-react";

export type WorkspaceContextMenuState = {
  workspaceId: string;
  workspaceName: string;
  x: number;
  y: number;
} | null;

export type TabContextMenuState = {
  tabId: string;
  tabTitle: string;
  x: number;
  y: number;
} | null;

export function WorkspaceContextMenus({
  workspaceContextMenu,
  tabContextMenu,
  onCloseWorkspaceMenu,
  onCloseTabMenu,
  onExportWorkspace,
  onRequestDeleteWorkspace,
  onDuplicateTab,
  onRenameTab,
  onRequestCloseTab
}: {
  workspaceContextMenu: WorkspaceContextMenuState;
  tabContextMenu: TabContextMenuState;
  onCloseWorkspaceMenu: () => void;
  onCloseTabMenu: () => void;
  onExportWorkspace: (workspaceId: string) => void;
  onRequestDeleteWorkspace: (workspaceId: string, workspaceName: string) => void;
  onDuplicateTab: (tabId: string) => void;
  onRenameTab: (tabId: string, tabTitle: string) => void;
  onRequestCloseTab: (tabId: string, tabTitle: string) => void;
}) {
  return (
    <>
      {workspaceContextMenu ? (
        <div
          className="workspace-context-menu"
          style={{
            left: Math.min(workspaceContextMenu.x, window.innerWidth - 196),
            top: Math.min(workspaceContextMenu.y, window.innerHeight - 116)
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="workspace-context-menu-item"
            onClick={() => {
              onCloseWorkspaceMenu();
              onExportWorkspace(workspaceContextMenu.workspaceId);
            }}
          >
            <Save size={14} />
            <span>Export Workspace</span>
          </button>
          <button
            type="button"
            className="workspace-context-menu-item is-danger"
            onClick={() => {
              onCloseWorkspaceMenu();
              onRequestDeleteWorkspace(workspaceContextMenu.workspaceId, workspaceContextMenu.workspaceName);
            }}
          >
            <Trash2 size={14} />
            <span>Delete Workspace</span>
          </button>
        </div>
      ) : null}

      {tabContextMenu ? (
        <div
          className="workspace-context-menu"
          style={{
            left: Math.min(tabContextMenu.x, window.innerWidth - 196),
            top: Math.min(tabContextMenu.y, window.innerHeight - 156)
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="workspace-context-menu-item"
            onClick={() => onDuplicateTab(tabContextMenu.tabId)}
          >
            <Copy size={14} />
            <span>Duplicate Tab</span>
          </button>
          <button
            type="button"
            className="workspace-context-menu-item"
            onClick={() => {
              onCloseTabMenu();
              onRenameTab(tabContextMenu.tabId, tabContextMenu.tabTitle);
            }}
          >
            <Pencil size={14} />
            <span>Rename Tab</span>
          </button>
          <button
            type="button"
            className="workspace-context-menu-item is-danger"
            onClick={() => {
              onCloseTabMenu();
              onRequestCloseTab(tabContextMenu.tabId, tabContextMenu.tabTitle);
            }}
          >
            <X size={14} />
            <span>Close Tab</span>
          </button>
        </div>
      ) : null}
    </>
  );
}