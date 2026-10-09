import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Language = "en" | "ja" | "zh-TW";

const LANGUAGE_STORAGE_KEY = "ciao-public-language";
const SUPPORTED_LANGUAGES: Language[] = ["en", "ja", "zh-TW"];

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function languageFromPath(pathname: string): Language | undefined {
  const pathLanguage = pathname.split("/")[1];
  if (pathLanguage === "zh-CN") return "zh-TW";
  return SUPPORTED_LANGUAGES.includes(pathLanguage as Language) ? pathLanguage as Language : undefined;
}

function initialLanguage(): Language {
  if (typeof window === "undefined") return "en";
  const pathLanguage = languageFromPath(window.location.pathname);
  if (pathLanguage) return pathLanguage;
  try {
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (SUPPORTED_LANGUAGES.includes(saved as Language)) return saved as Language;
  } catch { /* Language switching also works when browser storage is unavailable. */ }
  for (const preferred of navigator.languages?.length ? navigator.languages : [navigator.language]) {
    const base = preferred.toLowerCase().split("-")[0];
    if (base === "ja") return "ja";
    if (base === "zh") return "zh-TW";
    if (base === "en") return "en";
  }
  return "en";
}

export function stripLanguagePrefix(pathname: string): string {
  return pathname.replace(/^\/(?:en|ja|zh-TW|zh-CN)(?=\/|$)/, "") || "/";
}

export function localizedPath(path: string, language: Language): string {
  if (language === "en") return path || "/";
  return `/${language}${path === "/" ? "" : path.startsWith("/") ? path : `/${path}`}`;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);

  const setLanguage = (nextLanguage: Language) => {
    try { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage); } catch { /* Keep the in-memory selection. */ }
    const currentPath = `${stripLanguagePrefix(window.location.pathname)}${window.location.search}${window.location.hash}`;
    const nextPath = currentPath.startsWith("/admin") ? currentPath : localizedPath(currentPath, nextLanguage);
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
  const localized = isRecord(translated)
    ? translated[language] ?? (language === "zh-TW" ? translated["zh-CN"] : undefined) ?? translated
    : translated;
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

export function localizedText(value: { en?: string; ja?: string; "zh-TW"?: string; "zh-CN"?: string } | undefined, language: Language) {
  if (!value) return "";
  const translated = language === "zh-TW" ? value["zh-TW"] ?? value["zh-CN"] : value[language];
  return language !== "en" && translated?.trim() ? translated : value.en ?? "";
}
