import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { TabContextMenuState, WorkspaceContextMenuState } from "../workspaces/WorkspaceContextMenus";

type UseAppMenuEffectsOptions = {
  workspaceContextMenu: WorkspaceContextMenuState;
  tabContextMenu: TabContextMenuState;
  setWorkspaceContextMenu: Dispatch<SetStateAction<WorkspaceContextMenuState>>;
  setTabContextMenu: Dispatch<SetStateAction<TabContextMenuState>>;
  themeMenuOpen: boolean;
  themeMenuRef: RefObject<HTMLDivElement | null>;
  setThemeMenuOpen: Dispatch<SetStateAction<boolean>>;
};

// 管理上下文菜单与主题菜单的全局关闭行为。
export function useAppMenuEffects({
  workspaceContextMenu,
  tabContextMenu,
  setWorkspaceContextMenu,
  setTabContextMenu,
  themeMenuOpen,
  themeMenuRef,
  setThemeMenuOpen
}: UseAppMenuEffectsOptions) {
  useEffect(() => {
    if (!workspaceContextMenu && !tabContextMenu) {
      return;
    }

    const closeMenu = () => {
      setWorkspaceContextMenu(null);
      setTabContextMenu(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    window.addEventListener("mousedown", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousedown", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [workspaceContextMenu, tabContextMenu]);

  useEffect(() => {
    if (!themeMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!themeMenuRef.current?.contains(target)) {
        setThemeMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setThemeMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [themeMenuOpen]);
}
