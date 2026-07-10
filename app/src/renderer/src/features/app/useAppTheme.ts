import { useEffect, useMemo, useRef, useState } from "react";
import type { BenchLocalThemeDefinition, BenchLocalThemeDescriptor } from "@core";
import { resolveThemeLabel } from "../../shared/theme-format";

// 管理主题资源、系统外观监听及 CSS 变量应用，App 只负责持久化所选主题。
export function useAppTheme(themeId: string | undefined) {
  const [availableThemes, setAvailableThemes] = useState<BenchLocalThemeDescriptor[]>([]);
  const [activeThemeDefinition, setActiveThemeDefinition] = useState<BenchLocalThemeDefinition | null>(null);
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)").matches : false
  );
  const appliedThemeKeysRef = useRef<string[]>([]);
  const themeOptions = useMemo(() => ["system", ...availableThemes.map((theme) => theme.id)], [availableThemes]);
  const currentThemeLabel = useMemo(
    () => resolveThemeLabel(themeId ?? "system", availableThemes, systemPrefersDark),
    [themeId, availableThemes, systemPrefersDark]
  );
  const effectiveThemeId = useMemo(() => {
    const requested = themeId ?? "system";

    if (requested === "system") {
      return systemPrefersDark ? "dark" : "light";
    }

    return requested;
  }, [themeId, systemPrefersDark]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      setSystemPrefersDark(media.matches);
    };

    handleChange();
    media.addEventListener("change", handleChange);

    return () => {
      media.removeEventListener("change", handleChange);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadTheme = async () => {
      const theme = await window.benchlocal.themes.load({ themeId: effectiveThemeId });

      if (!cancelled) {
        setActiveThemeDefinition(theme);
      }
    };

    void loadTheme();

    return () => {
      cancelled = true;
    };
  }, [effectiveThemeId]);

  useEffect(() => {
    if (!activeThemeDefinition || typeof document === "undefined") {
      return;
    }

    const root = document.documentElement;

    for (const key of appliedThemeKeysRef.current) {
      root.style.removeProperty(key);
    }

    for (const [key, value] of Object.entries(activeThemeDefinition.variables)) {
      root.style.setProperty(key, value);
    }

    appliedThemeKeysRef.current = Object.keys(activeThemeDefinition.variables);
    root.style.setProperty("color-scheme", activeThemeDefinition.colorScheme);
    root.dataset.theme = activeThemeDefinition.id;
  }, [activeThemeDefinition]);

  return {
    availableThemes,
    setAvailableThemes,
    systemPrefersDark,
    themeOptions,
    currentThemeLabel
  };
}
