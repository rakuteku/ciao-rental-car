import { useEffect } from "react";
import { useGetPageSeo } from "@workspace/api-client-react";
import { useLanguage, localizedText, type Language } from "@/lib/language";

function setMetaTag(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setLinkTag(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function setAlternateLink(language: Language | "x-default", href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="alternate"][hreflang="${language}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "alternate");
    el.setAttribute("hreflang", language);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export interface SeoMetaFields {
  metaTitle: string;
  metaDescription: string;
  keywords?: string[];
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
}

export function applySeoMeta(seo: SeoMetaFields | undefined) {
  if (!seo) return;
  document.title = seo.metaTitle;
  setMetaTag("name", "description", seo.metaDescription);
  if (seo.keywords) {
    setMetaTag("name", "keywords", seo.keywords.join(", "));
  }
  setMetaTag("property", "og:title", seo.ogTitle);
  setMetaTag("property", "og:description", seo.ogDescription);
  setMetaTag("property", "og:image", seo.ogImage);
}

export function useSeoMeta(page: string) {
  const { data: seo } = useGetPageSeo(page);
  const { language } = useLanguage();

  useEffect(() => {
    if (!seo) return;
    const selected = {
      metaTitle: localizedText(seo.metaTitle, language),
      metaDescription: localizedText(seo.metaDescription, language),
      keywords: seo.keywords[language].length ? seo.keywords[language] : seo.keywords.en,
      ogTitle: localizedText(seo.ogTitle, language),
      ogDescription: localizedText(seo.ogDescription, language),
      ogImage: seo.ogImage,
    };
    applySeoMeta(selected);
    setMetaTag("property", "og:image:alt", localizedText(seo.ogImageAlt, language));
    setMetaTag("property", "og:locale", language === "ja" ? "ja_JP" : language === "zh-CN" ? "zh_CN" : "en_US");
    setMetaTag("name", "robots", seo.allowIndexing ? "index,follow" : "noindex,nofollow");
    const canonical = seo.canonicalUrls[language] || seo.canonicalUrl || seo.slug;
    setLinkTag("canonical", new URL(canonical, window.location.origin).toString());
    for (const alternate of ["en", "ja", "zh-CN"] as const) {
      const route = seo.canonicalUrls[alternate] || seo.slugs[alternate] || seo.slugs.en;
      setAlternateLink(alternate, new URL(route, window.location.origin).toString());
    }
    setAlternateLink("x-default", new URL(seo.canonicalUrls.en || seo.slugs.en, window.location.origin).toString());
  }, [seo, language]);
}

export function useInlineSeoMeta(seo: SeoMetaFields | undefined) {
  useEffect(() => {
    applySeoMeta(seo);
  }, [seo]);
}
