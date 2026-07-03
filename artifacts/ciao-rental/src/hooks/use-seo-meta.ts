import { useEffect } from "react";
import { useGetPageSeo } from "@workspace/api-client-react";

function setMetaTag(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
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

  useEffect(() => {
    applySeoMeta(seo);
  }, [seo]);
}

export function useInlineSeoMeta(seo: SeoMetaFields | undefined) {
  useEffect(() => {
    applySeoMeta(seo);
  }, [seo]);
}
