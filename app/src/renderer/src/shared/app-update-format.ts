import type { BenchLocalUpdateState } from "@/shared/desktop-api";

export function describeAppUpdateState(state: BenchLocalUpdateState | null): string {
  if (!state) {
    return "Updater is initializing.";
  }

  if (state.message?.trim()) {
    return state.message.trim();
  }

  switch (state.status) {
    case "unsupported":
      return "Self-update is unavailable in this BenchLocal build.";
    case "checking":
      return "Checking for BenchLocal updates.";
    case "available":
      return state.availableVersion
        ? `BenchLocal ${state.availableVersion} is available. Downloading update.`
        : "A BenchLocal update is available. Downloading update.";
    case "downloading":
      return state.availableVersion
        ? `Downloading BenchLocal ${state.availableVersion}.`
        : "Downloading BenchLocal update.";
    case "downloaded":
      return state.downloadedVersion
        ? `BenchLocal ${state.downloadedVersion} is ready to install.`
        : "A BenchLocal update is ready to install.";
    case "not_available":
      return "BenchLocal is up to date.";
    case "error":
      return "BenchLocal could not complete the update request.";
    default:
      return "BenchLocal can check for updates.";
  }
}

export function formatAppUpdateCheckedAt(checkedAt?: string): string | null {
  if (!checkedAt) {
    return null;
  }

  const date = new Date(checkedAt);
  if (Number.isNaN(date.valueOf())) {
    return null;
  }

  return date.toLocaleString();
}