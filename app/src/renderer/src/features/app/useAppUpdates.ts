import { useEffect, useState } from "react";
import type { BenchLocalUpdateState } from "@/shared/desktop-api";
import { formatDesktopErrorMessage } from "../../shared/desktop-errors";

// 负责桌面更新状态订阅与操作，避免 App 混入 updater IPC 的实现细节。
export function useAppUpdates(onError: (message: string) => void) {
  const [appUpdateState, setAppUpdateState] = useState<BenchLocalUpdateState | null>(null);
  const [dismissedDownloadedUpdateVersion, setDismissedDownloadedUpdateVersion] = useState<string | null>(null);
  const downloadedUpdateVersion = appUpdateState?.downloadedVersion ?? appUpdateState?.availableVersion ?? null;
  const showDownloadedUpdateBanner =
    appUpdateState?.status === "downloaded" && downloadedUpdateVersion !== dismissedDownloadedUpdateVersion;

  const checkForAppUpdates = async () => {
    try {
      const nextState = await window.benchlocal.updates.check();
      setAppUpdateState(nextState);
    } catch (updateError) {
      onError(formatDesktopErrorMessage(updateError) || "Failed to check for BenchLocal updates.");
    }
  };

  const installDownloadedAppUpdate = async () => {
    try {
      await window.benchlocal.updates.install();
    } catch (updateError) {
      onError(formatDesktopErrorMessage(updateError) || "Failed to install the downloaded BenchLocal update.");
    }
  };

  useEffect(() => {
    let cancelled = false;

    void window.benchlocal.updates
      .state()
      .then((state) => {
        if (!cancelled) {
          setAppUpdateState(state);
        }
      })
      .catch(() => undefined);

    const unsubscribe = window.benchlocal.updates.onState((state) => {
      setAppUpdateState(state);

      if (state.status !== "downloaded") {
        setDismissedDownloadedUpdateVersion(null);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const markDownloadedUpdateNotified = (version: string) => {
    setDismissedDownloadedUpdateVersion(version);
  };

  return {
    appUpdateState,
    downloadedUpdateVersion,
    showDownloadedUpdateBanner,
    checkForAppUpdates,
    installDownloadedAppUpdate,
    markDownloadedUpdateNotified
  };
}

