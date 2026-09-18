import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Language = "en" | "ja" | "zh-CN";

const LANGUAGE_STORAGE_KEY = "ciao-public-language";

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function initialLanguage(): Language {
  if (typeof window === "undefined") return "en";
  const pathLanguage = window.location.pathname.split("/")[1];
  if (pathLanguage === "en" || pathLanguage === "ja" || pathLanguage === "zh-CN") return pathLanguage;
  const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (saved === "en" || saved === "ja" || saved === "zh-CN") return saved;
  if (navigator.language.toLowerCase().startsWith("ja")) return "ja";
  if (navigator.language.toLowerCase().startsWith("zh")) return "zh-CN";
  return "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);

  const setLanguage = (nextLanguage: Language) => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    setLanguageState(nextLanguage);
  };

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo(() => ({ language, setLanguage }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used inside LanguageProvider");
  return context;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Combines a Japanese content tree with its English source. Empty Japanese
 * strings and missing array/object entries fall back at the matching field.
 */
export function localizeContent<T>(english: T, translated: unknown, language: Language = "ja"): T {
  const localized = isRecord(translated) && (language in translated) ? translated[language] : translated;
  if (typeof english === "string") {
    return (typeof localized === "string" && localized.trim() ? localized : english) as T;
  }
  if (Array.isArray(english)) {
    if (!Array.isArray(localized) || localized.length === 0) return english;
    return english.map((value, index) => localizeContent(value, localized[index])) as T;
  }
  if (isRecord(english)) {
    const translatedRecord = isRecord(localized) ? localized : {};
    return Object.fromEntries(
      Object.entries(english).map(([key, value]) => [key, localizeContent(value, translatedRecord[key])]),
    ) as T;
  }
  return english;
}

export function localizedText(value: { en?: string; ja?: string; "zh-CN"?: string } | undefined, language: Language) {
  if (!value) return "";
  return language !== "en" && value[language]?.trim() ? value[language] : value.en ?? "";
}