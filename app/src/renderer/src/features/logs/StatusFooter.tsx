import { Logs, Sidebar } from "lucide-react";

export function StatusFooter({
  workspaceName,
  tabTitle,
  logsOpen,
  logsDetached,
  eventCount,
  onToggleLogs,
  onToggleDetachedLogs
}: {
  workspaceName: string;
  tabTitle: string;
  logsOpen: boolean;
  logsDetached: boolean;
  eventCount: number;
  onToggleLogs: () => void;
  onToggleDetachedLogs: () => void | Promise<void>;
}) {
  return (
    <footer className="status-footer">
      <div className="status-footer-group">
        <span className="status-footer-item">{workspaceName}</span>
        <span className="status-footer-divider" />
        <span className="status-footer-item">{tabTitle}</span>
      </div>
      <div className="status-footer-group">
        <button
          type="button"
          onClick={onToggleLogs}
          className={`status-footer-button${logsOpen ? " is-active" : ""}`}
        >
          <Logs size={13} />
          {logsOpen ? "Hide Logs" : "Show Logs"}
        </button>
        <button
          type="button"
          onClick={() => void onToggleDetachedLogs()}
          className={`status-footer-button${logsDetached ? " is-active" : ""}`}
        >
          <Sidebar size={13} />
          {logsDetached ? "Close Log Window" : "Detach Logs"}
        </button>
        <span className="status-footer-item">{eventCount} events</span>
      </div>
    </footer>
  );
}