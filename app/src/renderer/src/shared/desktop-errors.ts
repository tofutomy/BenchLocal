export function formatDesktopErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "";
  }

  return error.message.replace(/^Error invoking remote method '[^']+':\s*/u, "").trim();
}

export function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && /abort|cancel/i.test(error.name + " " + error.message);
}