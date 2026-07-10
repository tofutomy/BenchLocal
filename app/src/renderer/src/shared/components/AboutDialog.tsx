import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import benchlocalIcon from "../../../../../assets/benchlocal-icon.png";
import type { BenchLocalAppMetadata, BenchLocalUpdateState } from "@/shared/desktop-api";
import { describeAppUpdateState, formatAppUpdateCheckedAt } from "../app-update-format";

export function AboutDialog({
  metadata,
  updateState,
  onCheckForUpdates,
  onInstallUpdate,
  onClose
}: {
  metadata: BenchLocalAppMetadata | null;
  updateState: BenchLocalUpdateState | null;
  onCheckForUpdates: () => void;
  onInstallUpdate: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const productName = metadata?.productName ?? "BenchLocal";
  const version = metadata?.version?.trim();
  const updateMessage = describeAppUpdateState(updateState);
  const checkedAtLabel = formatAppUpdateCheckedAt(updateState?.checkedAt);
  const updateFeedLabel = updateState?.feedLabel?.trim() || "GitHub Releases";
  const updateFeedUrl = updateState?.feedUrl?.trim();
  const progressPercent =
    typeof updateState?.progressPercent === "number" ? Math.max(0, Math.min(100, updateState.progressPercent)) : null;
  const canCheckForUpdates =
    updateState?.status !== "checking" &&
    updateState?.status !== "downloading" &&
    updateState?.status !== "available" &&
    updateState?.status !== "unsupported";
  const updateActionLabel =
    updateState?.status === "downloaded"
      ? "Restart to Update"
      : updateState?.status === "checking"
        ? "Checking..."
        : updateState?.status === "downloading" || updateState?.status === "available"
          ? progressPercent !== null
            ? `Downloading ${Math.round(progressPercent)}%`
            : "Downloading..."
          : "Check for Updates";

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      dialogRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Enter") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="dialog-backdrop">
      <div ref={dialogRef} className="about-dialog-shell" tabIndex={-1}>
        <button type="button" onClick={onClose} className="dialog-close-button about-dialog-close" aria-label="Close dialog">
          <X size={16} />
        </button>
        <div className="about-dialog-body">
          <img src={benchlocalIcon} alt="" className="about-dialog-icon" />
          <h3 className="about-dialog-app-name">{productName}</h3>
          {version ? <p className="about-dialog-version">Version {version}</p> : null}
          {metadata?.copyright ? <p className="about-dialog-copyright">{metadata.copyright}</p> : null}
          <div className="about-dialog-update-card">
            <div className="about-dialog-update-header">
              <span className="eyebrow">Self Update</span>
              {updateState?.availableVersion ? <span className="status-chip status-idle">v{updateState.availableVersion}</span> : null}
            </div>
            <p className="about-dialog-update-message">{updateMessage}</p>
            <p className="about-dialog-update-meta">
              Feed: {updateFeedUrl ? `${updateFeedLabel} (${updateFeedUrl})` : updateFeedLabel}
            </p>
            {progressPercent !== null ? (
              <div className="about-dialog-update-progress">
                <div className="about-dialog-update-progress-track">
                  <span className="about-dialog-update-progress-fill" style={{ width: `${progressPercent}%` }} />
                </div>
                <span className="about-dialog-update-progress-label">{Math.round(progressPercent)}%</span>
              </div>
            ) : null}
            {checkedAtLabel ? <p className="about-dialog-update-meta">Last checked: {checkedAtLabel}</p> : null}
            {updateState?.releaseNotes ? <pre className="about-dialog-update-notes">{updateState.releaseNotes}</pre> : null}
            <div className="about-dialog-update-actions">
              <button
                type="button"
                className="primary-button"
                onClick={updateState?.status === "downloaded" ? onInstallUpdate : onCheckForUpdates}
                disabled={!canCheckForUpdates && updateState?.status !== "downloaded"}
              >
                {updateActionLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
