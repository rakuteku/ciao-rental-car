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

export function useSeoMeta(page: string) {
  const { data: seo } = useGetPageSeo(page);

  useEffect(() => {
    if (!seo) return;

    document.title = seo.metaTitle;
    setMetaTag("name", "description", seo.metaDescription);
    setMetaTag("name", "keywords", seo.keywords.join(", "));
    setMetaTag("property", "og:title", seo.ogTitle);
    setMetaTag("property", "og:description", seo.ogDescription);
    setMetaTag("property", "og:image", seo.ogImage);
  }, [seo]);
}
