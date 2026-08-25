import { useEffect, useMemo, useState } from "react";
import {
  getGetPageContentQueryKey,
  getGetPageSeoQueryKey,
  useGetPageContent,
  useGetPageSeo,
  useUpdateAdminContent,
  useUpdateAdminSeo,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type Language = "en" | "ja";
type ContentTree = Record<string, unknown>;

type SeoDraft = {
  slug: string;
  metaTitle: Record<Language, string>;
  metaDescription: Record<Language, string>;
  keywords: Record<Language, string[]>;
  ogTitle: Record<Language, string>;
  ogDescription: Record<Language, string>;
  ogImage: string;
  ogImageAlt: Record<Language, string>;
  canonicalUrl: string;
  allowIndexing: boolean;
};

const pages = [
  { key: "home", label: "Home", route: "/" },
  { key: "lodging", label: "Lodging", route: "/lodging" },
  { key: "rentalcar", label: "Rental Car", route: "/rentalcar" },
] as const;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const equal = (one: unknown, two: unknown) => JSON.stringify(one) === JSON.stringify(two);
const isRecord = (value: unknown): value is ContentTree => typeof value === "object" && value !== null && !Array.isArray(value);
const humanize = (value: string) => value.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());

function ContentFields({
  base,
  value,
  onChange,
  title,
  isJapanese = false,
}: {
  base: unknown;
  value: unknown;
  onChange: (value: unknown) => void;
  title?: string;
  isJapanese?: boolean;
}) {
  if (typeof base === "string") {
    const current = typeof value === "string" ? value : "";
    const multiline = base.length > 72 || /description|subtitle|notes|rules/i.test(title ?? "");
    return (
      <div className="space-y-1.5">
        {title && <Label>{humanize(title)}</Label>}
        {multiline ? (
          <Textarea value={current} placeholder={current ? undefined : base} rows={3} onChange={(event) => onChange(event.target.value)} />
        ) : (
          <Input value={current} placeholder={current ? undefined : base} onChange={(event) => onChange(event.target.value)} />
        )}
      </div>
    );
  }

  if (Array.isArray(base)) {
    const current = Array.isArray(value) ? value : [];
    return (
      <section className="space-y-3 rounded-md border p-4">
        {title && <h4 className="text-sm font-semibold">{humanize(title)}</h4>}
        {base.map((entry, index) => (
          <div key={index} className="border-l pl-4 space-y-2">
            <ContentFields
              base={entry}
              value={current[index]}
              title={Array.isArray(entry) || isRecord(entry) ? `${title ?? "Item"} ${index + 1}` : `${title ?? "Item"} ${index + 1}`}
              onChange={(next) => {
                const copy = [...current];
                copy[index] = next;
                onChange(copy);
              }}
              isJapanese={isJapanese}
            />
            {!isJapanese && (
              <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => onChange(current.filter((_, itemIndex) => itemIndex !== index))}>
                <Trash2 className="mr-1 h-3.5 w-3.5" />Remove item
              </Button>
            )}
          </div>
        ))}
        {!isJapanese && base.length > 0 && (
          <Button type="button" size="sm" variant="outline" onClick={() => onChange([...current, clone(base[base.length - 1])])}>
            <Plus className="mr-1 h-3.5 w-3.5" />Add item
          </Button>
        )}
      </section>
    );
  }

  if (isRecord(base)) {
    const current = isRecord(value) ? value : {};
    return (
      <section className={title ? "space-y-4 rounded-md border p-4" : "space-y-5"}>
        {title && <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{humanize(title)}</h3>}
        {Object.entries(base).map(([key, entry]) => (
          <ContentFields
            key={key}
            base={entry}
            value={current[key]}
            title={key}
            onChange={(next) => onChange({ ...current, [key]: next })}
            isJapanese={isJapanese}
          />
        ))}
      </section>
    );
  }

  return null;
}

function isEnglishContentComplete(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.every(isEnglishContentComplete);
  if (isRecord(value)) return Object.values(value).every(isEnglishContentComplete);
  return true;
}

function PageEditor({ page, label, route }: { page: string; label: string; route: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [language, setLanguage] = useState<Language>("en");
  const [draft, setDraft] = useState<{ en: ContentTree; ja: ContentTree } | null>(null);
  const [savedContent, setSavedContent] = useState<{ en: ContentTree; ja: ContentTree } | null>(null);
  const [seoDraft, setSeoDraft] = useState<SeoDraft | null>(null);
  const [savedSeo, setSavedSeo] = useState<SeoDraft | null>(null);

  const contentQuery = useGetPageContent(page);
  const seoQuery = useGetPageSeo(page);
  const updateContent = useUpdateAdminContent();
  const updateSeo = useUpdateAdminSeo();

  useEffect(() => {
    if (!contentQuery.data || draft) return;
    const initial = clone(contentQuery.data.content) as { en: ContentTree; ja: ContentTree };
    setDraft(initial);
    setSavedContent(clone(initial));
  }, [contentQuery.data, draft]);

  useEffect(() => {
    if (!seoQuery.data || seoDraft) return;
    const legacy = seoQuery.data as unknown as Record<string, unknown>;
    const localized = (value: unknown): Record<Language, string> =>
      typeof value === "string" ? { en: value, ja: "" } : value as Record<Language, string>;
    const localizedKeywords = (value: unknown): Record<Language, string[]> =>
      Array.isArray(value) ? { en: value as string[], ja: [] } : value as Record<Language, string[]>;
    const initial: SeoDraft = {
      slug: seoQuery.data.slug,
      metaTitle: localized(legacy.metaTitle),
      metaDescription: localized(legacy.metaDescription),
      keywords: localizedKeywords(legacy.keywords),
      ogTitle: localized(legacy.ogTitle),
      ogDescription: localized(legacy.ogDescription),
      ogImage: seoQuery.data.ogImage,
      ogImageAlt: localized(legacy.ogImageAlt ?? ""),
      canonicalUrl: (legacy.canonicalUrl as string | undefined) ?? seoQuery.data.slug,
      allowIndexing: (legacy.allowIndexing as boolean | undefined) ?? true,
    };
    setSeoDraft(clone(initial));
    setSavedSeo(clone(initial));
  }, [seoDraft, seoQuery.data]);

  const hasUnsavedChanges = useMemo(
    () => Boolean(draft && savedContent && seoDraft && savedSeo && (!equal(draft, savedContent) || !equal(seoDraft, savedSeo))),
    [draft, savedContent, seoDraft, savedSeo],
  );

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedChanges]);

  if (contentQuery.isLoading || seoQuery.isLoading || !draft || !seoDraft) {
    return <p className="py-10 text-sm text-muted-foreground">Loading page content and SEO settings…</p>;
  }
  if (contentQuery.isError || seoQuery.isError) {
    return <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Unable to load this page’s content. Refresh and try again.</div>;
  }

  const resetLanguage = () => {
    if (!savedContent || !savedSeo) return;
    setDraft((current) => current && { ...current, [language]: clone(savedContent[language]) });
    setSeoDraft((current) => current && {
      ...current,
      metaTitle: { ...current.metaTitle, [language]: savedSeo.metaTitle[language] },
      metaDescription: { ...current.metaDescription, [language]: savedSeo.metaDescription[language] },
      keywords: { ...current.keywords, [language]: savedSeo.keywords[language] },
      ogTitle: { ...current.ogTitle, [language]: savedSeo.ogTitle[language] },
      ogDescription: { ...current.ogDescription, [language]: savedSeo.ogDescription[language] },
      ogImageAlt: { ...current.ogImageAlt, [language]: savedSeo.ogImageAlt[language] },
    });
  };

  const cancelChanges = () => {
    if (!savedContent || !savedSeo) return;
    setDraft(clone(savedContent));
    setSeoDraft(clone(savedSeo));
    toast({ title: "Changes discarded", description: "The editor has been restored to the last saved values." });
  };

  const save = async () => {
    if (!isEnglishContentComplete(draft.en)) {
      toast({ title: "English content needs attention", description: "Required English content cannot be blank.", variant: "destructive" });
      setLanguage("en");
      return;
    }
    if (!seoDraft.metaTitle.en.trim() || !seoDraft.metaDescription.en.trim()) {
      toast({ title: "SEO needs attention", description: "English meta title and description are required.", variant: "destructive" });
      setLanguage("en");
      return;
    }

    try {
      const [content, seo] = await Promise.all([
        updateContent.mutateAsync({ page, data: { content: draft } }),
        updateSeo.mutateAsync({ page, data: seoDraft }),
      ]);
      const savedLocalized = clone(content.content) as { en: ContentTree; ja: ContentTree };
      const savedMetadata: SeoDraft = {
        slug: seo.slug, metaTitle: seo.metaTitle, metaDescription: seo.metaDescription, keywords: seo.keywords,
        ogTitle: seo.ogTitle, ogDescription: seo.ogDescription, ogImage: seo.ogImage, ogImageAlt: seo.ogImageAlt,
        canonicalUrl: seo.canonicalUrl, allowIndexing: seo.allowIndexing,
      };
      setDraft(savedLocalized);
      setSavedContent(clone(savedLocalized));
      setSeoDraft(savedMetadata);
      setSavedSeo(clone(savedMetadata));
      queryClient.invalidateQueries({ queryKey: getGetPageContentQueryKey(page) });
      queryClient.invalidateQueries({ queryKey: getGetPageSeoQueryKey(page) });
      toast({ title: "Page content saved", description: `${label} content and SEO settings are live.` });
    } catch {
      toast({ title: "Could not save changes", description: "No additional fields were cleared. Please try again.", variant: "destructive" });
    }
  };

  const saving = updateContent.isPending || updateSeo.isPending;
  const translated = draft[language];
  return (
    <div className="space-y-6">
      <div className="rounded-md border bg-muted/30 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">{label}</h2>
          <p className="text-sm text-muted-foreground">Route: <code>{route}</code></p>
        </div>
        {hasUnsavedChanges ? <span className="text-sm text-amber-700 flex items-center gap-1"><AlertCircle className="h-4 w-4" /> Unsaved changes</span> : <span className="text-sm text-emerald-700 flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Saved</span>}
      </div>

      <Tabs value={language} onValueChange={(next) => setLanguage(next as Language)}>
        <TabsList aria-label="Content language">
          <TabsTrigger value="en">English</TabsTrigger>
          <TabsTrigger value="ja">日本語</TabsTrigger>
        </TabsList>
        <TabsContent value={language} className="pt-5 space-y-6">
          <div>
            <h3 className="text-lg font-semibold">Page content</h3>
            <p className="text-sm text-muted-foreground mt-1">Japanese fields are optional. Blank values safely display the matching English content on the public site.</p>
          </div>
          <ContentFields
            base={draft.en}
            value={translated}
            onChange={(next) => setDraft({ ...draft, [language]: (next as ContentTree) })}
            isJapanese={language === "ja"}
          />
        </TabsContent>
      </Tabs>

      <details className="rounded-md border p-5" open>
        <summary className="cursor-pointer font-semibold">SEO Settings</summary>
        <div className="pt-5 space-y-5">
          <p className="text-sm text-muted-foreground">Localized metadata follows the selected language. Canonical URL and indexing controls are shared.</p>
          <div className="grid gap-4">
            <div className="space-y-1.5"><Label>Meta title ({language === "en" ? "English" : "日本語"})</Label><Input value={seoDraft.metaTitle[language]} onChange={(e) => setSeoDraft({ ...seoDraft, metaTitle: { ...seoDraft.metaTitle, [language]: e.target.value } })} /></div>
            <div className="space-y-1.5"><Label>Meta description ({language === "en" ? "English" : "日本語"})</Label><Textarea rows={3} value={seoDraft.metaDescription[language]} onChange={(e) => setSeoDraft({ ...seoDraft, metaDescription: { ...seoDraft.metaDescription, [language]: e.target.value } })} /></div>
            <div className="space-y-1.5"><Label>Meta keywords ({language === "en" ? "English" : "日本語"})</Label><Input value={seoDraft.keywords[language].join(", ")} onChange={(e) => setSeoDraft({ ...seoDraft, keywords: { ...seoDraft.keywords, [language]: e.target.value.split(",").map((item) => item.trim()).filter(Boolean) } })} /></div>
            <div className="space-y-1.5"><Label>Open Graph title ({language === "en" ? "English" : "日本語"})</Label><Input value={seoDraft.ogTitle[language]} onChange={(e) => setSeoDraft({ ...seoDraft, ogTitle: { ...seoDraft.ogTitle, [language]: e.target.value } })} /></div>
            <div className="space-y-1.5"><Label>Open Graph description ({language === "en" ? "English" : "日本語"})</Label><Textarea rows={3} value={seoDraft.ogDescription[language]} onChange={(e) => setSeoDraft({ ...seoDraft, ogDescription: { ...seoDraft.ogDescription, [language]: e.target.value } })} /></div>
            <div className="space-y-1.5"><Label>Open Graph image alt text ({language === "en" ? "English" : "日本語"})</Label><Input value={seoDraft.ogImageAlt[language]} onChange={(e) => setSeoDraft({ ...seoDraft, ogImageAlt: { ...seoDraft.ogImageAlt, [language]: e.target.value } })} /></div>
            <div className="space-y-1.5"><Label>Open Graph image URL</Label><Input value={seoDraft.ogImage} onChange={(e) => setSeoDraft({ ...seoDraft, ogImage: e.target.value })} /></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Canonical URL</Label><Input value={seoDraft.canonicalUrl} onChange={(e) => setSeoDraft({ ...seoDraft, canonicalUrl: e.target.value })} /></div>
              <div className="flex items-center justify-between rounded-md border px-4 py-3"><div><Label htmlFor={`indexing-${page}`}>Allow search indexing</Label><p className="text-xs text-muted-foreground">Disable to output a noindex directive.</p></div><Switch id={`indexing-${page}`} checked={seoDraft.allowIndexing} onCheckedChange={(checked) => setSeoDraft({ ...seoDraft, allowIndexing: checked })} /></div>
            </div>
          </div>
        </div>
      </details>

      <div className="sticky bottom-0 flex flex-wrap gap-3 border-t bg-background/95 py-4 backdrop-blur">
        <Button onClick={save} disabled={saving || !hasUnsavedChanges} className="gap-2"><Save className="h-4 w-4" />{saving ? "Saving…" : "Save changes"}</Button>
        <Button type="button" variant="outline" onClick={cancelChanges} disabled={!hasUnsavedChanges} className="gap-2"><X className="h-4 w-4" />Cancel</Button>
        <Button type="button" variant="ghost" onClick={resetLanguage} disabled={!hasUnsavedChanges} className="gap-2"><RotateCcw className="h-4 w-4" />Restore {language === "en" ? "English" : "日本語"}</Button>
      </div>
    </div>
  );
}

export function AdminContent() {
  const [page, setPage] = useState<(typeof pages)[number]["key"]>("home");
  const selected = pages.find((item) => item.key === page) ?? pages[0];

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-3xl font-serif font-bold tracking-tight">Page Content</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage English and Japanese public content, including each page’s SEO metadata.</p>
      </div>
      <Tabs value={page} onValueChange={(next) => setPage(next as typeof page)}>
        <TabsList className="h-auto flex-wrap justify-start">
          {pages.map((item) => <TabsTrigger key={item.key} value={item.key}>{item.label}</TabsTrigger>)}
        </TabsList>
      </Tabs>
      <PageEditor key={selected.key} page={selected.key} label={selected.label} route={selected.route} />
    </div>
  );
}