import type { BenchLocalThemeDescriptor } from "@core";

export function resolveThemeLabel(themeId: string, themes: BenchLocalThemeDescriptor[], prefersDark: boolean): string {
  if (themeId === "system") {
    return `System (${prefersDark ? "Dark" : "Light"})`;
  }

  return themes.find((theme) => theme.id === themeId)?.name ?? themeId;
}