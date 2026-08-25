import { useEffect } from "react";
import { useGetPageSeo } from "@workspace/api-client-react";
import { useLanguage, localizedText } from "@/lib/language";

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
      keywords: language === "ja" && seo.keywords.ja.length ? seo.keywords.ja : seo.keywords.en,
      ogTitle: localizedText(seo.ogTitle, language),
      ogDescription: localizedText(seo.ogDescription, language),
      ogImage: seo.ogImage,
    };
    applySeoMeta(selected);
    setMetaTag("property", "og:image:alt", localizedText(seo.ogImageAlt, language));
    setMetaTag("property", "og:locale", language === "ja" ? "ja_JP" : "en_US");
    setMetaTag("name", "robots", seo.allowIndexing ? "index,follow" : "noindex,nofollow");
    const canonical = seo.canonicalUrl || seo.slug;
    setLinkTag("canonical", new URL(canonical, window.location.origin).toString());
  }, [seo, language]);
}

export function useInlineSeoMeta(seo: SeoMetaFields | undefined) {
  useEffect(() => {
    applySeoMeta(seo);
  }, [seo]);
}
