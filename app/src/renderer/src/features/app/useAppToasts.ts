import { useCallback, useEffect, useRef, useState } from "react";
import type { ToastMessage, ToastTone } from "../../shared/components/ToastViewport";

// 统一管理通知的去重、自动关闭和卸载清理，避免 App 持有实现细节。
export function useAppToasts() {
  const [toastMessages, setToastMessages] = useState<ToastMessage[]>([]);
  const toastIdRef = useRef(0);
  const toastTimersRef = useRef(new Map<string, number>());
  const activeToastKeysRef = useRef(new Set<string>());
  const toastKeysByIdRef = useRef(new Map<string, string>());

  const dismissToast = useCallback((id: string) => {
    const timer = toastTimersRef.current.get(id);
    const dedupeKey = toastKeysByIdRef.current.get(id);

    if (timer !== undefined) {
      window.clearTimeout(timer);
      toastTimersRef.current.delete(id);
    }

    if (dedupeKey) {
      activeToastKeysRef.current.delete(dedupeKey);
      toastKeysByIdRef.current.delete(id);
    }

    setToastMessages((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    (message: string, tone: ToastTone = "success") => {
      const normalizedMessage = message.trim();

      if (!normalizedMessage) {
        return;
      }

      const dedupeKey = `${tone}:${normalizedMessage}`;

      if (activeToastKeysRef.current.has(dedupeKey)) {
        return;
      }

      const id = `toast-${Date.now()}-${toastIdRef.current}`;
      toastIdRef.current += 1;
      activeToastKeysRef.current.add(dedupeKey);
      toastKeysByIdRef.current.set(id, dedupeKey);
      setToastMessages((current) => [...current, { id, tone, message: normalizedMessage, dedupeKey }]);

      const timeoutMs = tone === "danger" ? 8000 : 4500;
      const timer = window.setTimeout(() => dismissToast(id), timeoutMs);
      toastTimersRef.current.set(id, timer);
    },
    [dismissToast]
  );

  useEffect(() => {
    return () => {
      for (const timer of toastTimersRef.current.values()) {
        window.clearTimeout(timer);
      }

      toastTimersRef.current.clear();
      activeToastKeysRef.current.clear();
      toastKeysByIdRef.current.clear();
    };
  }, []);

  return {
    toastMessages,
    dismissToast,
    pushToast
  };
}
