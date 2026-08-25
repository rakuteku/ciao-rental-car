import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Language = "en" | "ja";

const LANGUAGE_STORAGE_KEY = "ciao-public-language";

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function initialLanguage(): Language {
  if (typeof window === "undefined") return "en";
  const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (saved === "en" || saved === "ja") return saved;
  return navigator.language.toLowerCase().startsWith("ja") ? "ja" : "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);

  const setLanguage = (nextLanguage: Language) => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    setLanguageState(nextLanguage);
  };

  useEffect(() => {
    document.documentElement.lang = language === "ja" ? "ja" : "en";
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
export function localizeContent<T>(english: T, japanese: unknown): T {
  if (typeof english === "string") {
    return (typeof japanese === "string" && japanese.trim() ? japanese : english) as T;
  }
  if (Array.isArray(english)) {
    if (!Array.isArray(japanese) || japanese.length === 0) return english;
    return english.map((value, index) => localizeContent(value, japanese[index])) as T;
  }
  if (isRecord(english)) {
    const translated = isRecord(japanese) ? japanese : {};
    return Object.fromEntries(
      Object.entries(english).map(([key, value]) => [key, localizeContent(value, translated[key])]),
    ) as T;
  }
  return english;
}

export function localizedText(value: { en?: string; ja?: string } | undefined, language: Language) {
  if (!value) return "";
  return language === "ja" && value.ja?.trim() ? value.ja : value.en ?? "";
}