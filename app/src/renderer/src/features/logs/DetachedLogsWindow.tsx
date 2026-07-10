import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { BenchLocalThemeDefinition } from "@core";
import type { DetachedLogsState } from "@/shared/desktop-api";

export function DetachedLogsWindow() {
  const [state, setState] = useState<DetachedLogsState>({
    workspaceName: "No Workspace",
    tabTitle: "No Active Tab",
    eventCount: 0,
    events: []
  });
  const [autoScroll, setAutoScroll] = useState(true);
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)").matches : false
  );
  const [themeDefinition, setThemeDefinition] = useState<BenchLocalThemeDefinition | null>(null);
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const appliedThemeKeysRef = useRef<string[]>([]);

  useEffect(() => {
    return window.benchlocal.logs.onDetachedState((nextState) => {
      setState(nextState);
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      setSystemPrefersDark(media.matches);
    };

    handleChange();
    media.addEventListener("change", handleChange);

    return () => {
      media.removeEventListener("change", handleChange);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadTheme = async () => {
      const configResult = await window.benchlocal.config.load();
      const requestedThemeId = configResult.config.ui.theme === "system"
        ? systemPrefersDark
          ? "dark"
          : "light"
        : configResult.config.ui.theme;
      const nextTheme = await window.benchlocal.themes.load({ themeId: requestedThemeId });

      if (!cancelled) {
        setThemeDefinition(nextTheme);
      }
    };

    void loadTheme();

    return () => {
      cancelled = true;
    };
  }, [systemPrefersDark]);

  useEffect(() => {
    if (!themeDefinition || typeof document === "undefined") {
      return;
    }

    const root = document.documentElement;

    for (const key of appliedThemeKeysRef.current) {
      root.style.removeProperty(key);
    }

    for (const [key, value] of Object.entries(themeDefinition.variables)) {
      root.style.setProperty(key, value);
    }

    appliedThemeKeysRef.current = Object.keys(themeDefinition.variables);
    root.style.setProperty("color-scheme", themeDefinition.colorScheme);
    root.dataset.theme = themeDefinition.id;
  }, [themeDefinition]);

  useEffect(() => {
    if (!autoScroll || !logContainerRef.current) {
      return;
    }

    logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
  }, [state, autoScroll]);

  useEffect(() => {
    document.title = `Run Logs - ${state.workspaceName} - ${state.tabTitle}`;
  }, [state.workspaceName, state.tabTitle]);

  return (
    <div className="detached-logs-shell">
      <header className="detached-logs-header">
        <div>
          <h2 className="detached-logs-title">{state.workspaceName} · {state.tabTitle}</h2>
        </div>
        <div className="section-actions">
          <label className="drawer-toggle">
            <input type="checkbox" checked={autoScroll} onChange={(event) => setAutoScroll(event.target.checked)} />
            <span>Auto Scroll</span>
          </label>
          <span className="status-chip status-idle">{state.eventCount} events</span>
          <button
            type="button"
            className="toolbar-icon-button"
            aria-label="Close window"
            title="Close window"
            onClick={() => void window.benchlocal.logs.closeDetachedWindow()}
          >
            <X size={14} />
          </button>
        </div>
      </header>

      {state.events.length > 0 ? (
        <div ref={logContainerRef} className="detached-logs-trail">
          {state.events.map((event, index) => (
            <div key={`${event.type}-${index}`} className="event-row">
              <span className="event-type">{event.type}</span>
              <span className="event-payload"> {JSON.stringify(event)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="detached-logs-empty">No run logs are being streamed yet.</div>
      )}
    </div>
  );
}
