import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { BenchPackRunSummary } from "@core";

type UseAppLogEffectsOptions = {
  activeLogEvents: BenchPackRunSummary["events"];
  workspaceName: string;
  tabTitle: string;
  logsOpen: boolean;
  logsAutoScroll: boolean;
  logContainerRef: RefObject<HTMLDivElement | null>;
  setLogsDetached: Dispatch<SetStateAction<boolean>>;
  setLogDrawerHeight: Dispatch<SetStateAction<number>>;
};

// 管理日志抽屉的自动滚动、分离窗口同步与拖拽高度交互。
export function useAppLogEffects({
  activeLogEvents,
  workspaceName,
  tabTitle,
  logsOpen,
  logsAutoScroll,
  logContainerRef,
  setLogsDetached,
  setLogDrawerHeight
}: UseAppLogEffectsOptions) {
  useEffect(() => {
    if (!logsOpen || !logsAutoScroll || !logContainerRef.current) {
      return;
    }

    logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
  }, [activeLogEvents, logsOpen, logsAutoScroll]);

  useEffect(() => {
    const dispose = window.benchlocal.logs.onDetachedWindowClosed(() => {
      setLogsDetached(false);
    });

    return dispose;
  }, []);

  useEffect(() => {
    void window.benchlocal.logs.publishDetachedState({
      workspaceName,
      tabTitle,
      eventCount: activeLogEvents.length,
      events: activeLogEvents
    });
  }, [workspaceName, tabTitle, activeLogEvents]);

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      const shell = document.querySelector<HTMLElement>(".desktop-shell");

      if (!shell || !document.body.dataset.logResizeActive) {
        return;
      }

      const shellRect = shell.getBoundingClientRect();
      const nextHeight = Math.min(420, Math.max(160, shellRect.bottom - event.clientY - 30));
      setLogDrawerHeight(nextHeight);
    };

    const handleUp = () => {
      delete document.body.dataset.logResizeActive;
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, []);
}
