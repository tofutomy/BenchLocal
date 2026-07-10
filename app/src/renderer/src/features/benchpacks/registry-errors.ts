import { formatDesktopErrorMessage } from "../../shared/desktop-errors";

const REGISTRY_UNAVAILABLE_MESSAGE =
  "Official Bench Pack registry is unavailable right now. Installed Bench Packs remain usable.";

function isRegistryConnectivityError(error: unknown): boolean {
  const message = formatDesktopErrorMessage(error);
  return /fetch failed/i.test(message);
}

export function formatRegistryWarning(error: unknown): string {
  const message = formatDesktopErrorMessage(error);

  if (!message) {
    return REGISTRY_UNAVAILABLE_MESSAGE;
  }

  if (!message || /fetch failed/i.test(message)) {
    return REGISTRY_UNAVAILABLE_MESSAGE;
  }

  return `${REGISTRY_UNAVAILABLE_MESSAGE} ${message}`;
}

export function formatRegistryMutationError(
  action: "install" | "update",
  benchPackId: string,
  error: unknown
): string {
  if (isRegistryConnectivityError(error)) {
    return `Failed to ${action} ${benchPackId}. Official Bench Pack registry is unavailable right now.`;
  }

  return formatDesktopErrorMessage(error) || `Failed to ${action} ${benchPackId}.`;
}