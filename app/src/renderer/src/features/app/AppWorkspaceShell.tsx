import type { ReactNode, RefObject } from "react";
import type { BenchLocalWorkspaceState, ProgressEvent } from "@core";
import { Banner } from "../../shared/components/Banner";
import { AppLogDrawer } from "../logs/AppLogDrawer";
import { AppSidebar } from "./AppSidebar";

export function AppWorkspaceShell({
  sidebarOpen,
  workspaceState,
  activeWorkspaceId,
  isLoading,
  logsOpen,
  logsDetached,
  logTitle,
  logEvents,
  logsAutoScroll,
  logDrawerHeight,
  logContainerRef,
  onCreateWorkspace,
  onActivateWorkspace,
  onOpenWorkspaceContextMenu,
  onRenameWorkspace,
  onImportWorkspace,
  onLogsAutoScrollChange,
  onCloseLogs,
  onStartLogResize,
  children
}: {
  sidebarOpen: boolean;
  workspaceState: BenchLocalWorkspaceState | null;
  activeWorkspaceId: string | null;
  isLoading: boolean;
  logsOpen: boolean;
  logsDetached: boolean;
  logTitle: string;
  logEvents: ProgressEvent[];
  logsAutoScroll: boolean;
  logDrawerHeight: number;
  logContainerRef: RefObject<HTMLDivElement | null>;
  onCreateWorkspace: () => void;
  onActivateWorkspace: (workspaceId: string) => void;
  onOpenWorkspaceContextMenu: (input: { workspaceId: string; workspaceName: string; x: number; y: number }) => void;
  onRenameWorkspace: (workspaceId: string, workspaceName: string) => void;
  onImportWorkspace: () => void;
  onLogsAutoScrollChange: (checked: boolean) => void;
  onCloseLogs: () => void;
  onStartLogResize: () => void;
  children: ReactNode;
}) {
  return (
    <div className={`desktop-layout${sidebarOpen ? "" : " sidebar-collapsed"}`}>
      <AppSidebar
        sidebarOpen={sidebarOpen}
        workspaceState={workspaceState}
        activeWorkspaceId={activeWorkspaceId}
        onCreateWorkspace={onCreateWorkspace}
        onActivateWorkspace={onActivateWorkspace}
        onOpenWorkspaceContextMenu={onOpenWorkspaceContextMenu}
        onRenameWorkspace={onRenameWorkspace}
        onImportWorkspace={onImportWorkspace}
      />

      <section className="desktop-main">
        {isLoading ? <Banner tone="neutral">Loading BenchLocal config...</Banner> : null}

        <div className="workspace-scroll">{children}</div>

        {logsOpen && !logsDetached ? (
          <AppLogDrawer
            title={logTitle}
            events={logEvents}
            autoScroll={logsAutoScroll}
            height={logDrawerHeight}
            logContainerRef={logContainerRef}
            onAutoScrollChange={onLogsAutoScrollChange}
            onClose={onCloseLogs}
            onStartResize={onStartLogResize}
          />
        ) : null}
      </section>
    </div>
  );
}
