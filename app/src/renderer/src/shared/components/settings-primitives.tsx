import { useEffect, useRef, useState, type ReactNode } from "react";

export function getTableScrollbarThumbWidth(metrics: {
  clientWidth: number;
  scrollWidth: number;
  scrollLeft: number;
}): number {
  if (metrics.scrollWidth <= 0 || metrics.clientWidth <= 0) {
    return 0;
  }

  const ratio = metrics.clientWidth / metrics.scrollWidth;
  return Math.max(56, Math.round(metrics.clientWidth * ratio));
}

export function SettingsTableShell({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const scrollbarTrackRef = useRef<HTMLDivElement | null>(null);
  const scrollbarDragRef = useRef<{
    startX: number;
    startScrollLeft: number;
  } | null>(null);
  const [scrollMetrics, setScrollMetrics] = useState({
    clientWidth: 0,
    scrollWidth: 0,
    scrollLeft: 0
  });

  const hasHorizontalOverflow = scrollMetrics.scrollWidth > scrollMetrics.clientWidth + 1;
  const scrollbarThumbWidth = hasHorizontalOverflow ? getTableScrollbarThumbWidth(scrollMetrics) : 0;
  const scrollbarThumbOffset =
    hasHorizontalOverflow && scrollbarTrackRef.current
      ? ((scrollMetrics.scrollLeft / Math.max(1, scrollMetrics.scrollWidth - scrollMetrics.clientWidth)) *
          Math.max(0, scrollbarTrackRef.current.clientWidth - scrollbarThumbWidth))
      : 0;
  const wrapClassName = [
    "settings-list-table-wrap",
    className,
    hasHorizontalOverflow ? "has-sticky-last-column-shadow" : ""
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    const updateMetrics = () => {
      setScrollMetrics({
        clientWidth: viewport.clientWidth,
        scrollWidth: viewport.scrollWidth,
        scrollLeft: viewport.scrollLeft
      });
    };

    const syncFromViewport = () => {
      updateMetrics();
    };

    updateMetrics();
    viewport.addEventListener("scroll", syncFromViewport);
    window.addEventListener("resize", updateMetrics);

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            updateMetrics();
          })
        : null;

    resizeObserver?.observe(viewport);

    if (viewport.firstElementChild instanceof HTMLElement) {
      resizeObserver?.observe(viewport.firstElementChild);
    }

    return () => {
      viewport.removeEventListener("scroll", syncFromViewport);
      window.removeEventListener("resize", updateMetrics);
      resizeObserver?.disconnect();
    };
  }, [children]);

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      const viewport = viewportRef.current;
      const track = scrollbarTrackRef.current;
      const drag = scrollbarDragRef.current;

      if (!viewport || !track || !drag) {
        return;
      }

      const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      const maxThumbOffset = Math.max(1, track.clientWidth - getTableScrollbarThumbWidth(scrollMetrics));
      const deltaX = event.clientX - drag.startX;
      const nextScrollLeft = Math.min(
        maxScrollLeft,
        Math.max(0, drag.startScrollLeft + (deltaX / maxThumbOffset) * maxScrollLeft)
      );
      viewport.scrollLeft = nextScrollLeft;
    };

    const handleUp = () => {
      scrollbarDragRef.current = null;
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [scrollMetrics]);

  return (
    <div className={wrapClassName}>
      <div ref={viewportRef} className="settings-table-scroll">
        {children}
      </div>
      {hasHorizontalOverflow ? (
        <div
          ref={scrollbarTrackRef}
          className="table-scrollbar"
          aria-hidden="true"
          onMouseDown={(event) => {
            const viewport = viewportRef.current;
            const track = scrollbarTrackRef.current;

            if (!viewport || !track) {
              return;
            }

            const rect = track.getBoundingClientRect();
            const clickX = event.clientX - rect.left;

            if (clickX >= scrollbarThumbOffset && clickX <= scrollbarThumbOffset + scrollbarThumbWidth) {
              return;
            }

            const nextOffset = Math.max(
              0,
              Math.min(track.clientWidth - scrollbarThumbWidth, clickX - scrollbarThumbWidth / 2)
            );
            const nextScrollLeft =
              (nextOffset / Math.max(1, track.clientWidth - scrollbarThumbWidth)) *
              Math.max(0, viewport.scrollWidth - viewport.clientWidth);
            viewport.scrollLeft = nextScrollLeft;
          }}
        >
          <div
            className="table-scrollbar-thumb"
            style={{
              width: `${scrollbarThumbWidth}px`,
              transform: `translateX(${scrollbarThumbOffset}px)`
            }}
            onMouseDown={(event) => {
              event.preventDefault();
              const viewport = viewportRef.current;

              if (!viewport) {
                return;
              }

              scrollbarDragRef.current = {
                startX: event.clientX,
                startScrollLeft: viewport.scrollLeft
              };
              document.body.style.userSelect = "none";
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

export function Panel({
  title,
  subtitle,
  tone,
  icon,
  actions,
  children
}: {
  title: string;
  subtitle: string;
  tone: "sky" | "orange" | "slate";
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`panel-shell settings-panel settings-panel-${tone}`}>
      <div className="panel-header">
        <div className="panel-header-main">
          <div className={`panel-icon panel-icon-${tone}`}>{icon}</div>
          <div>
            <h3 className="settings-panel-title">{title}</h3>
            <p className="section-copy settings-panel-subtitle">{subtitle}</p>
          </div>
        </div>
        {actions ? <div className="panel-header-actions">{actions}</div> : null}
      </div>
      <div className="settings-panel-body">{children}</div>
    </section>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  readOnly = false,
  className = ""
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  readOnly?: boolean;
  className?: string;
}) {
  return (
    <label className={`field-block${label ? "" : " field-block-no-label"}${className ? ` ${className}` : ""}`}>
      {label ? <span className="field-label">{label}</span> : null}
      <input
        type={type}
        value={value}
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="config-input"
      />
    </label>
  );
}

export function FieldToggle({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="field-block">
      <span className="field-label">{label}</span>
      <span className="field-toggle">
        <span className="toggle-label">{checked ? "Enabled" : "Disabled"}</span>
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
      </span>
    </label>
  );
}

export function InlineSelectField({
  label,
  value,
  options,
  getOptionLabel,
  onChange
}: {
  label: string;
  value: string;
  options: Array<string | { value: string; label?: string; disabled?: boolean }>;
  getOptionLabel?: (value: string) => string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={`field-block${label ? "" : " field-block-no-label"}`}>
      {label ? <span className="field-label">{label}</span> : null}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="config-input"
      >
        {options.map((option) => {
          const value = typeof option === "string" ? option : option.value;
          const label = typeof option === "string" ? (getOptionLabel ? getOptionLabel(option) : option) : option.label ?? option.value;
          const disabled = typeof option === "string" ? false : Boolean(option.disabled);

          return (
            <option key={value} value={value} disabled={disabled}>
              {label}
            </option>
          );
        })}
      </select>
    </label>
  );
}
