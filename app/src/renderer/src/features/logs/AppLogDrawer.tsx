import type { RefObject } from "react";
import { X } from "lucide-react";
import type { ProgressEvent } from "@core";

export function AppLogDrawer({
  title,
  events,
  autoScroll,
  height,
  logContainerRef,
  onAutoScrollChange,
  onClose,
  onStartResize
}: {
  title: string;
  events: ProgressEvent[];
  autoScroll: boolean;
  height: number;
  logContainerRef: RefObject<HTMLDivElement | null>;
  onAutoScrollChange: (checked: boolean) => void;
  onClose: () => void;
  onStartResize: () => void;
}) {
  return (
    <section className="bottom-drawer" style={{ flexBasis: `${height}px` }}>
      <div
        className="bottom-drawer-resizer"
        onMouseDown={onStartResize}
      />
      <div className="bottom-drawer-header">
        <div>
          <p className="eyebrow">Run Logs</p>
          <div className="bottom-drawer-title">{title}</div>
        </div>
        <div className="section-actions">
          <label className="drawer-toggle">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(event) => onAutoScrollChange(event.target.checked)}
            />
            <span>Auto Scroll</span>
          </label>
          <span className="status-chip status-idle">{events.length} events</span>
          <button
            type="button"
            onClick={onClose}
            className="toolbar-icon-button"
            aria-label="Hide logs"
            title="Hide logs"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      {events.length > 0 ? (
        <div ref={logContainerRef} className="event-trail bottom-drawer-log">
          {events.map((event, index) => (
            <div key={`${event.type}-${index}`} className="event-row">
              <span className="event-type">{event.type}</span>
              <span className="event-payload"> {JSON.stringify(event)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="bottom-drawer-empty">No run logs yet for the active tab.</div>
      )}
    </section>
  );
}
