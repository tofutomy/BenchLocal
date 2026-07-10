import { FolderOpen, Pencil, Plus } from "lucide-react";
import type { BenchLocalWorkspaceState } from "@core";

export function AppSidebar({
  sidebarOpen,
  workspaceState,
  activeWorkspaceId,
  onCreateWorkspace,
  onActivateWorkspace,
  onOpenWorkspaceContextMenu,
  onRenameWorkspace,
  onImportWorkspace
}: {
  sidebarOpen: boolean;
  workspaceState: BenchLocalWorkspaceState | null;
  activeWorkspaceId: string | null;
  onCreateWorkspace: () => void;
  onActivateWorkspace: (workspaceId: string) => void;
  onOpenWorkspaceContextMenu: (input: { workspaceId: string; workspaceName: string; x: number; y: number }) => void;
  onRenameWorkspace: (workspaceId: string, workspaceName: string) => void;
  onImportWorkspace: () => void;
}) {
  return (
    <aside className={`desktop-sidebar${sidebarOpen ? "" : " is-hidden"}`}>
      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <p className="sidebar-label">Workspaces</p>
          <button
            type="button"
            onClick={onCreateWorkspace}
            className="sidebar-section-action"
            aria-label="Create workspace"
            title="Create workspace"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      <div className="sidebar-section">
        {workspaceState?.workspaceOrder.length ? (
          workspaceState.workspaceOrder.map((workspaceId) => {
            const workspace = workspaceState.workspaces[workspaceId];

            if (!workspace) {
              return null;
            }

            return (
              <div
                key={workspace.id}
                role="button"
                tabIndex={0}
                onClick={() => onActivateWorkspace(workspace.id)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  onActivateWorkspace(workspace.id);
                  onOpenWorkspaceContextMenu({
                    workspaceId: workspace.id,
                    workspaceName: workspace.name,
                    x: event.clientX,
                    y: event.clientY
                  });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onActivateWorkspace(workspace.id);
                  }
                }}
                className={`sidebar-item${activeWorkspaceId === workspace.id ? " is-active" : ""}`}
              >
                <div className="sidebar-item-main">
                  <div className="sidebar-item-title">{workspace.name}</div>
                  <div className="sidebar-item-footer">
                    <div className="sidebar-item-meta">
                      {workspace.tabIds.length} tab{workspace.tabIds.length === 1 ? "" : "s"}
                    </div>
                    <div className="sidebar-item-actions">
                      <button
                        type="button"
                        className="sidebar-item-action"
                        title="Rename workspace"
                        onClick={(event) => {
                          event.stopPropagation();
                          onRenameWorkspace(workspace.id, workspace.name);
                        }}
                      >
                        <Pencil size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="sidebar-empty">No workspaces yet.</div>
        )}
      </div>

      <div className="sidebar-footer">
        <button type="button" onClick={onImportWorkspace} className="ghost-button sidebar-footer-button">
          <FolderOpen size={14} />
          Import Workspace
        </button>
      </div>
    </aside>
  );
}