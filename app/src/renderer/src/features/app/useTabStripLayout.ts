import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { BenchLocalWorkspaceTab } from "@core";

type ActiveTabMask = { left: number; width: number } | null;

type UseTabStripLayoutOptions = {
  workspaceTabs: BenchLocalWorkspaceTab[];
  activeWorkspaceId: string | null;
  activeTabId: string | null;
  sidebarOpen: boolean;
  tabStripOverflow: boolean;
  tabStripShellRef: MutableRefObject<HTMLDivElement | null>;
  tabStripRef: MutableRefObject<HTMLDivElement | null>;
  tabChipRefs: MutableRefObject<Map<string, HTMLButtonElement>>;
  setTabStripOverflow: Dispatch<SetStateAction<boolean>>;
  setActiveTabMask: Dispatch<SetStateAction<ActiveTabMask>>;
};

// 计算标签条溢出与活动标签遮罩的位置，集中 DOM 测量逻辑。
export function useTabStripLayout({
  workspaceTabs,
  activeWorkspaceId,
  activeTabId,
  sidebarOpen,
  tabStripOverflow,
  tabStripShellRef,
  tabStripRef,
  tabChipRefs,
  setTabStripOverflow,
  setActiveTabMask
}: UseTabStripLayoutOptions) {
  useEffect(() => {
    const updateOverflow = () => {
      const element = tabStripRef.current;

      if (!element) {
        setTabStripOverflow(false);
        return;
      }

      setTabStripOverflow(element.scrollWidth > element.clientWidth + 4);
    };

    updateOverflow();
    window.addEventListener("resize", updateOverflow);

    return () => {
      window.removeEventListener("resize", updateOverflow);
    };
  }, [workspaceTabs.length, activeWorkspaceId, sidebarOpen]);

  useEffect(() => {
    const shell = tabStripShellRef.current;
    const strip = tabStripRef.current;

    if (!shell || !strip || !activeTabId) {
      setActiveTabMask(null);
      return;
    }

    const updateMask = () => {
      const activeElement = tabChipRefs.current.get(activeTabId);

      if (!activeElement) {
        setActiveTabMask(null);
        return;
      }

      const shellRect = shell.getBoundingClientRect();
      const tabRect = activeElement.getBoundingClientRect();

      setActiveTabMask({
        left: Math.round(tabRect.left - shellRect.left),
        width: Math.round(tabRect.width)
      });
    };

    const frameId = window.requestAnimationFrame(updateMask);
    window.addEventListener("resize", updateMask);
    strip.addEventListener("scroll", updateMask, { passive: true });

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", updateMask);
      strip.removeEventListener("scroll", updateMask);
    };
  }, [activeTabId, workspaceTabs, sidebarOpen, tabStripOverflow]);
}
