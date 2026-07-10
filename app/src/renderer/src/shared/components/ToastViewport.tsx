import { Check, CircleAlert, X } from "lucide-react";

export type ToastTone = "success" | "danger" | "neutral" | "warning";

export type ToastMessage = {
  id: string;
  tone: ToastTone;
  message: string;
  dedupeKey: string;
};

export function ToastViewport({
  messages,
  onDismiss
}: {
  messages: ToastMessage[];
  onDismiss: (id: string) => void;
}) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="false">
      {messages.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.tone}`} role={toast.tone === "danger" ? "alert" : "status"}>
          <span className="toast-icon" aria-hidden="true">
            {toast.tone === "danger" || toast.tone === "warning" ? <CircleAlert size={15} /> : <Check size={15} />}
          </span>
          <span className="toast-message">{toast.message}</span>
          <button
            type="button"
            className="toast-dismiss"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss notification"
            title="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
