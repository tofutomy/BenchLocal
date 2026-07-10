import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function Modal({
  title,
  subtitle,
  onClose,
  onSubmit,
  submitLabel,
  submitTone = "primary",
  size = "default",
  leadingActions,
  children
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  submitTone?: "primary" | "danger";
  size?: "default" | "wide";
  leadingActions?: ReactNode;
  children?: ReactNode;
}) {
  const hasBody = Boolean(children);
  const hasSubtitle = Boolean(subtitle?.trim());
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const submitButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      const activeElement = document.activeElement;
      const dialog = dialogRef.current;

      if (!dialog) {
        return;
      }

      if (activeElement instanceof HTMLElement && dialog.contains(activeElement)) {
        return;
      }

      submitButtonRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Enter" || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.isComposing) {
        return;
      }

      const target = event.target;

      if (target instanceof HTMLElement && (target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }

      event.preventDefault();
      onSubmit();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, onSubmit]);

  return (
    <div className="dialog-backdrop">
      <div ref={dialogRef} className={`dialog-shell${size === "wide" ? " dialog-shell-wide" : ""}`} tabIndex={-1}>
        <div className={`dialog-header${hasBody ? "" : " dialog-header-compact"}`}>
          <div>
            <h3 className="dialog-title">{title}</h3>
            {hasSubtitle ? <p className="section-copy" style={{ marginTop: "12px" }}>{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="dialog-close-button" aria-label="Close dialog">
            <X size={16} />
          </button>
        </div>

        {hasBody ? <div className="dialog-body">{children}</div> : null}

        <div className={`modal-actions${hasBody ? "" : " modal-actions-compact"}`}>
          <div className="modal-actions-leading">{leadingActions}</div>
          <button
            ref={submitButtonRef}
            type="button"
            onClick={onSubmit}
            className={submitTone === "danger" ? "button-danger" : "primary-button"}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
