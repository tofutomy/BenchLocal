import { createContext, createElement, useContext, useMemo, type ReactNode } from "react";
import enJson from "./en.json";
import zhJson from "./zh.json";

// JSON 导入断言为 Record<string, string>
const en = enJson as Record<string, string>;
const zh = zhJson as Record<string, string>;

// 支持的语言列表
export type SupportedLocale = "en" | "zh";

export const SUPPORTED_LOCALES: Array<{ id: SupportedLocale; label: string }> = [
  { id: "en", label: "English" },
  { id: "zh", label: "中文" }
];

// 翻译字典，按语言索引
const dictionaries: Record<SupportedLocale, Record<string, string>> = { en, zh };

// 从 locale 字符串解析出支持的语言，不匹配时回退到英文
function resolveLocale(locale: string): SupportedLocale {
  if (locale === "zh" || locale.startsWith("zh-")) {
    return "zh";
  }
  return "en";
}

// 翻译上下文
type I18nContextValue = {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  t: (key: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

// 提供给组件树的 Provider（用 createElement 避免 .ts 中无法写 JSX 的问题）
export function I18nProvider({
  locale,
  setLocale,
  children
}: {
  locale: string;
  setLocale: (locale: SupportedLocale) => void;
  children: ReactNode;
}) {
  const resolved = resolveLocale(locale);
  const dict = dictionaries[resolved];

  const value = useMemo<I18nContextValue>(() => ({
    locale: resolved,
    setLocale,
    t: (key: string) => dict[key] ?? en[key] ?? key
  }), [resolved, setLocale, dict]);

  return createElement(I18nContext.Provider, { value }, children);
}

// 组件内使用的翻译 hook
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);

  if (!ctx) {
    // Provider 外使用时的降级：直接从英文取
    return {
      locale: "en",
      setLocale: () => undefined,
      t: (key: string) => en[key] ?? key
    };
  }

  return ctx;
}
