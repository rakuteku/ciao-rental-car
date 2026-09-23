import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Language = "en" | "ja" | "zh-CN";

const LANGUAGE_STORAGE_KEY = "ciao-public-language";
const SUPPORTED_LANGUAGES: Language[] = ["en", "ja", "zh-CN"];

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function languageFromPath(pathname: string): Language | undefined {
  const pathLanguage = pathname.split("/")[1];
  return SUPPORTED_LANGUAGES.includes(pathLanguage as Language) ? pathLanguage as Language : undefined;
}

function initialLanguage(): Language {
  if (typeof window === "undefined") return "en";
  const pathLanguage = languageFromPath(window.location.pathname);
  if (pathLanguage) return pathLanguage;
  const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (SUPPORTED_LANGUAGES.includes(saved as Language)) return saved as Language;
  if (navigator.language.toLowerCase().startsWith("ja")) return "ja";
  if (navigator.language.toLowerCase().startsWith("zh")) return "zh-CN";
  return "en";
}

export function stripLanguagePrefix(pathname: string): string {
  return pathname.replace(/^\/(?:en|ja|zh-CN)(?=\/|$)/, "") || "/";
}

export function localizedPath(path: string, language: Language): string {
  if (language === "en") return path || "/";
  return `/${language}${path === "/" ? "" : path.startsWith("/") ? path : `/${path}`}`;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);

  const setLanguage = (nextLanguage: Language) => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    const currentPath = `${stripLanguagePrefix(window.location.pathname)}${window.location.search}${window.location.hash}`;
    const nextPath = localizedPath(currentPath, nextLanguage);
    if (nextPath !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.pushState({}, "", nextPath);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
    setLanguageState(nextLanguage);
  };

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    const syncLanguageFromUrl = () => {
      const nextLanguage = languageFromPath(window.location.pathname);
      if (nextLanguage) setLanguageState(nextLanguage);
    };
    window.addEventListener("popstate", syncLanguageFromUrl);
    return () => window.removeEventListener("popstate", syncLanguageFromUrl);
  }, []);

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