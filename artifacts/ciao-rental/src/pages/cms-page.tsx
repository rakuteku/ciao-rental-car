import { useEffect } from "react";
import { useRoute } from "wouter";
import { useGetLocalizedPage } from "@workspace/api-client-react";
import { AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage, localizedText, type Language } from "@/lib/language";
import { applySeoMeta } from "@/hooks/use-seo-meta";

function renderValue(value: unknown, label?: string): React.ReactNode {
  if (typeof value === "string") {
    if (!value.trim()) return null;
    return <p className="whitespace-pre-wrap leading-7">{value}</p>;
  }
  if (Array.isArray(value)) {
    return <ul className="list-disc space-y-2 pl-6">{value.map((entry, index) => <li key={index}>{renderValue(entry)}</li>)}</ul>;
  }
  if (typeof value === "object" && value !== null) {
    return (
      <section className="space-y-4">
        {Object.entries(value).map(([key, entry]) => (
          <div key={key} className="space-y-2">
            <h2 className="text-xl font-serif font-semibold">{key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase())}</h2>
            {renderValue(entry, key)}
          </div>
        ))}
      </section>
    );
  }
  return label ? <p>{String(value ?? "")}</p> : null;
}

export function CmsPage() {
  const [, params] = useRoute("/:language/:slug");
  const { language } = useLanguage();
  const routeLanguage = (params?.language === "ja" || params?.language === "zh-CN" || params?.language === "en" ? params.language : language) as Language;
  const slug = params?.slug ?? "";
  const { data, isLoading, isError } = useGetLocalizedPage(routeLanguage, slug);

  useEffect(() => {
    if (!data) return;
    applySeoMeta({
      metaTitle: localizedText(data.seo.metaTitle, routeLanguage) || data.title,
      metaDescription: localizedText(data.seo.metaDescription, routeLanguage),
      keywords: data.seo.keywords[routeLanguage].length ? data.seo.keywords[routeLanguage] : data.seo.keywords.en,
      ogTitle: localizedText(data.seo.ogTitle, routeLanguage) || data.title,
      ogDescription: localizedText(data.seo.ogDescription, routeLanguage),
      ogImage: data.seo.ogImage,
    });
  }, [data, routeLanguage]);

  if (isLoading) return <div className="container px-4 py-20 text-sm text-muted-foreground">Loading page…</div>;
  if (isError || !data) {
    return <div className="container flex min-h-[50vh] items-center justify-center px-4 py-20"><Card className="max-w-md"><CardContent className="flex gap-3 pt-6"><AlertCircle className="h-5 w-5 text-destructive" /><p>This page is unavailable.</p></CardContent></Card></div>;
  }

  return (
    <article className="container max-w-4xl px-4 py-12 sm:py-20">
      <header className="mb-10 space-y-3 border-b pb-8">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{data.page}</p>
        <h1 className="text-4xl font-serif font-bold tracking-tight sm:text-5xl">{data.title}</h1>
      </header>
      <div className="space-y-8">{renderValue(data.content)}</div>
    </article>
  );
}