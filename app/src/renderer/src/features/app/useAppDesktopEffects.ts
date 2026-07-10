import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { BenchLocalAppMetadata } from "@/shared/desktop-api";
import { SIDEBAR_OPEN_STORAGE_KEY } from "../workspaces/workspace-utils";

type UseAppDesktopEffectsOptions = {
  appMetadata: BenchLocalAppMetadata | null;
  setAppMetadata: Dispatch<SetStateAction<BenchLocalAppMetadata | null>>;
  setAboutDialogOpen: Dispatch<SetStateAction<boolean>>;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  settingsOpen: boolean;
  settingsOpenRef: MutableRefObject<boolean>;
  setSettingsNotice: Dispatch<SetStateAction<string | null>>;
  sidebarOpen: boolean;
};

// 同步主进程桌面命令，并维护应用壳层的本地偏好状态。
export function useAppDesktopEffects({
  appMetadata,
  setAppMetadata,
  setAboutDialogOpen,
  setSettingsOpen,
  settingsOpen,
  settingsOpenRef,
  setSettingsNotice,
  sidebarOpen
}: UseAppDesktopEffectsOptions) {
  useEffect(() => {
    return window.benchlocal.app.onOpenAbout(() => {
      setAboutDialogOpen(true);

      if (!appMetadata) {
        void window.benchlocal.app
          .metadata()
          .then((metadata) => {
            setAppMetadata(metadata);
          })
          .catch(() => undefined);
      }
    });
  }, [appMetadata]);

  useEffect(() => {
    return window.benchlocal.app.onOpenSettings(() => {
      setSettingsOpen(true);
    });
  }, []);

  useEffect(() => {
    settingsOpenRef.current = settingsOpen;

    if (!settingsOpen) {
      setSettingsNotice(null);
    }
  }, [settingsOpen]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(SIDEBAR_OPEN_STORAGE_KEY, String(sidebarOpen));
  }, [sidebarOpen]);
}

