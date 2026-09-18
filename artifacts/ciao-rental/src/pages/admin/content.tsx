import { useEffect, useMemo, useState } from "react";
import {
  getGetPageContentQueryKey,
  getGetPageSeoQueryKey,
  useCreateAdminContentPage,
  useDeleteAdminContentPage,
  useGetPageContent,
  useGetPageSeo,
  useListAdminContentPages,
  useUpdateAdminContent,
  useUpdateAdminSeo,
  type AdminPageSummary,
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
import type { Language } from "@/lib/language";

const languages = ["en", "ja", "zh-CN"] as const;
const languageLabels: Record<Language, string> = { en: "English", ja: "日本語", "zh-CN": "简体中文" };
type ContentTree = Record<string, unknown>;
type LocalizedContent = Record<Language, ContentTree>;
type LocalizedText = Record<Language, string>;

type SeoDraft = {
  slugs: LocalizedText;
  metaTitle: LocalizedText;
  metaDescription: LocalizedText;
  keywords: Record<Language, string[]>;
  ogTitle: LocalizedText;
  ogDescription: LocalizedText;
  ogImage: string;
  ogImageAlt: LocalizedText;
  canonicalUrls: LocalizedText;
  allowIndexing: boolean;
};

type PageDraft = {
  title: LocalizedText;
  published: boolean;
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const equal = (one: unknown, two: unknown) => JSON.stringify(one) === JSON.stringify(two);
const isRecord = (value: unknown): value is ContentTree => typeof value === "object" && value !== null && !Array.isArray(value);
const humanize = (value: string) => value.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());
const blankLocalizedText = (): LocalizedText => ({ en: "", ja: "", "zh-CN": "" });
const blankContent = (): LocalizedContent => ({ en: { body: "" }, ja: { body: "" }, "zh-CN": { body: "" } });

function ContentFields({
  base,
  value,
  onChange,
  title,
  allowStructureEdits,
}: {
  base: unknown;
  value: unknown;
  onChange: (value: unknown) => void;
  title?: string;
  allowStructureEdits: boolean;
}) {
  if (typeof base === "string") {
    const current = typeof value === "string" ? value : "";
    const multiline = base.length > 72 || /description|subtitle|notes|rules|body/i.test(title ?? "");
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
          <div key={index} className="space-y-2 border-l pl-4">
            <ContentFields
              base={entry}
              value={current[index]}
              title={`${title ?? "Item"} ${index + 1}`}
              onChange={(next) => {
                const copy = [...current];
                copy[index] = next;
                onChange(copy);
              }}
              allowStructureEdits={allowStructureEdits}
            />
            {allowStructureEdits && (
              <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => onChange(current.filter((_, itemIndex) => itemIndex !== index))}>
                <Trash2 className="mr-1 h-3.5 w-3.5" />Remove item
              </Button>
            )}
          </div>
        ))}
        {allowStructureEdits && base.length > 0 && (
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
            allowStructureEdits={allowStructureEdits}
          />
        ))}
      </section>
    );
  }

  return null;
}

function PageEditor({ page, summary }: { page: string; summary?: AdminPageSummary }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [language, setLanguage] = useState<Language>("en");
  const [draft, setDraft] = useState<LocalizedContent | null>(null);
  const [savedContent, setSavedContent] = useState<LocalizedContent | null>(null);
  const [pageDraft, setPageDraft] = useState<PageDraft | null>(null);
  const [savedPage, setSavedPage] = useState<PageDraft | null>(null);
  const [seoDraft, setSeoDraft] = useState<SeoDraft | null>(null);
  const [savedSeo, setSavedSeo] = useState<SeoDraft | null>(null);

  const contentQuery = useGetPageContent(page);
  const seoQuery = useGetPageSeo(page);
  const updateContent = useUpdateAdminContent();
  const updateSeo = useUpdateAdminSeo();

  useEffect(() => {
    if (!contentQuery.data || draft) return;
    const initial = clone(contentQuery.data.content) as LocalizedContent;
    const pageInitial: PageDraft = { title: clone(contentQuery.data.title), published: contentQuery.data.published };
    setDraft(initial);
    setSavedContent(clone(initial));
    setPageDraft(pageInitial);
    setSavedPage(clone(pageInitial));
  }, [contentQuery.data, draft]);

  useEffect(() => {
    if (!seoQuery.data || seoDraft) return;
    const initial: SeoDraft = {
      slugs: clone(seoQuery.data.slugs),
      metaTitle: clone(seoQuery.data.metaTitle),
      metaDescription: clone(seoQuery.data.metaDescription),
      keywords: clone(seoQuery.data.keywords),
      ogTitle: clone(seoQuery.data.ogTitle),
      ogDescription: clone(seoQuery.data.ogDescription),
      ogImage: seoQuery.data.ogImage,
      ogImageAlt: clone(seoQuery.data.ogImageAlt),
      canonicalUrls: clone(seoQuery.data.canonicalUrls),
      allowIndexing: seoQuery.data.allowIndexing,
    };
    setSeoDraft(initial);
    setSavedSeo(clone(initial));
  }, [seoDraft, seoQuery.data]);

  const hasUnsavedChanges = useMemo(
    () => Boolean(draft && savedContent && pageDraft && savedPage && seoDraft && savedSeo && (!equal(draft, savedContent) || !equal(pageDraft, savedPage) || !equal(seoDraft, savedSeo))),
    [draft, savedContent, pageDraft, savedPage, seoDraft, savedSeo],
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

  if (contentQuery.isLoading || seoQuery.isLoading || !draft || !pageDraft || !seoDraft) {
    return <p className="py-10 text-sm text-muted-foreground">Loading page content and SEO settings…</p>;
  }
  if (contentQuery.isError || seoQuery.isError) {
    return <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Unable to load this page’s content. Refresh and try again.</div>;
  }

  const updateLocalized = (field: keyof PageDraft["title"], value: string) => {
    setPageDraft({ ...pageDraft, title: { ...pageDraft.title, [field]: value } });
  };
  const updateSeoLocalized = (field: keyof SeoDraft, value: string) => {
    setSeoDraft({ ...seoDraft, [field]: { ...(seoDraft[field] as LocalizedText), [language]: value } });
  };
  const resetLanguage = () => {
    if (!savedContent || !savedPage || !savedSeo) return;
    setDraft({ ...draft, [language]: clone(savedContent[language]) });
    setPageDraft({ ...pageDraft, title: { ...pageDraft.title, [language]: savedPage.title[language] } });
    setSeoDraft({
      ...seoDraft,
      slugs: { ...seoDraft.slugs, [language]: savedSeo.slugs[language] },
      metaTitle: { ...seoDraft.metaTitle, [language]: savedSeo.metaTitle[language] },
      metaDescription: { ...seoDraft.metaDescription, [language]: savedSeo.metaDescription[language] },
      keywords: { ...seoDraft.keywords, [language]: savedSeo.keywords[language] },
      ogTitle: { ...seoDraft.ogTitle, [language]: savedSeo.ogTitle[language] },
      ogDescription: { ...seoDraft.ogDescription, [language]: savedSeo.ogDescription[language] },
      ogImageAlt: { ...seoDraft.ogImageAlt, [language]: savedSeo.ogImageAlt[language] },
      canonicalUrls: { ...seoDraft.canonicalUrls, [language]: savedSeo.canonicalUrls[language] },
    });
  };
  const cancelChanges = () => {
    if (savedContent && savedPage && savedSeo) {
      setDraft(clone(savedContent));
      setPageDraft(clone(savedPage));
      setSeoDraft(clone(savedSeo));
    }
  };
  const save = async () => {
    if (!pageDraft.title.en.trim() || !seoDraft.slugs.en.trim()) {
      toast({ title: "English title and URL slug are required", variant: "destructive" });
      return;
    }
    try {
      await updateContent.mutateAsync({
        page,
        data: { title: pageDraft.title, slugs: seoDraft.slugs, content: draft, published: pageDraft.published },
      });
      await updateSeo.mutateAsync({
        page,
        data: {
          slugs: seoDraft.slugs,
          metaTitle: seoDraft.metaTitle,
          metaDescription: seoDraft.metaDescription,
          keywords: seoDraft.keywords,
          ogTitle: seoDraft.ogTitle,
          ogDescription: seoDraft.ogDescription,
          ogImage: seoDraft.ogImage,
          ogImageAlt: seoDraft.ogImageAlt,
          canonicalUrls: seoDraft.canonicalUrls,
          allowIndexing: seoDraft.allowIndexing,
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetPageContentQueryKey(page) }),
        queryClient.invalidateQueries({ queryKey: getGetPageSeoQueryKey(page) }),
      ]);
      setSavedContent(clone(draft));
      setSavedPage(clone(pageDraft));
      setSavedSeo(clone(seoDraft));
      toast({ title: "Page saved", description: "All language fields and SEO settings were saved." });
    } catch (error) {
      toast({ title: "Could not save page", description: error instanceof Error ? error.message : "Check the URL slugs and try again.", variant: "destructive" });
    }
  };
  const currentBase = draft.en;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{summary?.isCustom ? "Custom CMS page" : "Built-in page"}</p>
          <h2 className="text-2xl font-serif font-bold">{pageDraft.title.en || page}</h2>
          <p className="text-sm text-muted-foreground">English: {seoDraft.canonicalUrls.en || seoDraft.slugs.en}</p>
        </div>
        <div className="flex items-center gap-3 rounded-md border px-3 py-2">
          <div><Label htmlFor={`published-${page}`}>Published</Label><p className="text-xs text-muted-foreground">Unpublished pages are hidden from public routes.</p></div>
          <Switch id={`published-${page}`} checked={pageDraft.published} onCheckedChange={(published) => setPageDraft({ ...pageDraft, published })} />
        </div>
      </div>

      <Tabs value={language} onValueChange={(value) => setLanguage(value as Language)}>
        <TabsList className="grid h-auto w-full grid-cols-3">
          {languages.map((item) => <TabsTrigger key={item} value={item}>{languageLabels[item]}</TabsTrigger>)}
        </TabsList>
        {languages.map((item) => (
          <TabsContent key={item} value={item} className="space-y-5 pt-4">
            {item !== "en" && <p className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">Leave untranslated {languageLabels[item]} fields empty to use English at runtime. Empty values remain empty in the saved CMS record.</p>}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5"><Label>Page title · {languageLabels[item]}</Label><Input value={pageDraft.title[item]} onChange={(event) => updateLocalized(item, event.target.value)} placeholder={item === "en" ? "Page title" : "Optional translation"} /></div>
              <div className="space-y-1.5"><Label>URL slug · {languageLabels[item]}</Label><Input value={seoDraft.slugs[item]} onChange={(event) => updateSeoLocalized("slugs", event.target.value)} placeholder={item === "en" ? "/about" : "Optional localized slug"} /><p className="text-xs text-muted-foreground">Must be unique within this language.</p></div>
            </div>
            <section className="space-y-4 rounded-md border p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Page content · {languageLabels[item]}</h3>
              <ContentFields base={currentBase} value={draft[item]} onChange={(value) => setDraft({ ...draft, [item]: value as ContentTree })} allowStructureEdits={item === "en"} />
            </section>
          </TabsContent>
        ))}
      </Tabs>

      <details className="rounded-md border" open>
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">SEO metadata</summary>
        <div className="space-y-4 border-t p-4">
          {languages.map((item) => (
            <section key={item} className="grid gap-4 rounded-md bg-muted/20 p-4 md:grid-cols-2">
              <h3 className="md:col-span-2 text-sm font-semibold">{languageLabels[item]}</h3>
              <div className="space-y-1.5"><Label>Meta title</Label><Input value={seoDraft.metaTitle[item]} onChange={(event) => updateSeoLocalized("metaTitle", event.target.value)} /></div>
              <div className="space-y-1.5"><Label>Meta description</Label><Textarea rows={3} value={seoDraft.metaDescription[item]} onChange={(event) => updateSeoLocalized("metaDescription", event.target.value)} /></div>
              <div className="space-y-1.5"><Label>Meta keywords</Label><Input value={seoDraft.keywords[item].join(", ")} onChange={(event) => setSeoDraft({ ...seoDraft, keywords: { ...seoDraft.keywords, [item]: event.target.value.split(",").map((entry) => entry.trim()).filter(Boolean) } })} /></div>
              <div className="space-y-1.5"><Label>Canonical URL</Label><Input value={seoDraft.canonicalUrls[item]} onChange={(event) => updateSeoLocalized("canonicalUrls", event.target.value)} /></div>
              <div className="space-y-1.5"><Label>Open Graph title</Label><Input value={seoDraft.ogTitle[item]} onChange={(event) => updateSeoLocalized("ogTitle", event.target.value)} /></div>
              <div className="space-y-1.5"><Label>Open Graph description</Label><Textarea rows={2} value={seoDraft.ogDescription[item]} onChange={(event) => updateSeoLocalized("ogDescription", event.target.value)} /></div>
              <div className="space-y-1.5"><Label>Open Graph image alt</Label><Input value={seoDraft.ogImageAlt[item]} onChange={(event) => updateSeoLocalized("ogImageAlt", event.target.value)} /></div>
            </section>
          ))}
          <div className="space-y-1.5"><Label>Open Graph image URL</Label><Input value={seoDraft.ogImage} onChange={(event) => setSeoDraft({ ...seoDraft, ogImage: event.target.value })} /></div>
          <div className="flex items-center justify-between rounded-md border px-4 py-3"><div><Label htmlFor={`indexing-${page}`}>Allow search indexing</Label><p className="text-xs text-muted-foreground">Disable to output a noindex directive and remove the page from the sitemap.</p></div><Switch id={`indexing-${page}`} checked={seoDraft.allowIndexing} onCheckedChange={(allowIndexing) => setSeoDraft({ ...seoDraft, allowIndexing })} /></div>
        </div>
      </details>

      <div className="sticky bottom-0 flex flex-wrap gap-3 border-t bg-background/95 py-4 backdrop-blur">
        <Button onClick={save} disabled={updateContent.isPending || updateSeo.isPending || !hasUnsavedChanges} className="gap-2"><Save className="h-4 w-4" />{updateContent.isPending || updateSeo.isPending ? "Saving…" : "Save changes"}</Button>
        <Button type="button" variant="outline" onClick={cancelChanges} disabled={!hasUnsavedChanges} className="gap-2"><X className="h-4 w-4" />Cancel</Button>
        <Button type="button" variant="ghost" onClick={resetLanguage} disabled={!hasUnsavedChanges} className="gap-2"><RotateCcw className="h-4 w-4" />Restore {languageLabels[language]}</Button>
      </div>
    </div>
  );
}

function NewPageForm({ onCreated }: { onCreated: (page: string) => void }) {
  const { toast } = useToast();
  const create = useCreateAdminContentPage();
  const [page, setPage] = useState("");
  const [title, setTitle] = useState<LocalizedText>(blankLocalizedText());
  const [slugs, setSlugs] = useState<LocalizedText>(blankLocalizedText());
  const [metaTitle, setMetaTitle] = useState<LocalizedText>(blankLocalizedText());
  const [metaDescription, setMetaDescription] = useState<LocalizedText>(blankLocalizedText());
  const [content, setContent] = useState<LocalizedContent>(blankContent());

  const update = (setter: (value: LocalizedText) => void, current: LocalizedText, language: Language, value: string) => setter({ ...current, [language]: value });
  const submit = async () => {
    if (!page.trim() || !title.en.trim() || !slugs.en.trim() || !metaTitle.en.trim() || !metaDescription.en.trim()) {
      toast({ title: "Complete the English page fields first", variant: "destructive" });
      return;
    }
    try {
      await create.mutateAsync({ data: { page, title, slugs, metaTitle, metaDescription, content } });
      toast({ title: "Page created" });
      onCreated(page.trim().toLowerCase());
    } catch (error) {
      toast({ title: "Could not create page", description: error instanceof Error ? error.message : "Check the page key and URL slugs.", variant: "destructive" });
    }
  };

  return (
    <section className="space-y-5 rounded-lg border bg-card p-4 sm:p-6">
      <div><h2 className="text-xl font-serif font-bold">Create a CMS page</h2><p className="text-sm text-muted-foreground">English values are required. Japanese and Chinese translations can be added later.</p></div>
      <div className="space-y-1.5"><Label>Page key</Label><Input value={page} onChange={(event) => setPage(event.target.value)} placeholder="about-us" /><p className="text-xs text-muted-foreground">Stable internal key; use letters, numbers, hyphens, or underscores.</p></div>
      <Tabs defaultValue="en">
        <TabsList className="grid w-full grid-cols-3">{languages.map((item) => <TabsTrigger key={item} value={item}>{languageLabels[item]}</TabsTrigger>)}</TabsList>
        {languages.map((item) => (
          <TabsContent key={item} value={item} className="grid gap-4 pt-4 md:grid-cols-2">
            <div className="space-y-1.5"><Label>Page title</Label><Input value={title[item]} onChange={(event) => update(setTitle, title, item, event.target.value)} /></div>
            <div className="space-y-1.5"><Label>URL slug</Label><Input value={slugs[item]} onChange={(event) => update(setSlugs, slugs, item, event.target.value)} placeholder={item === "en" ? "/about-us" : "Optional localized slug"} /></div>
            <div className="space-y-1.5"><Label>Meta title</Label><Input value={metaTitle[item]} onChange={(event) => update(setMetaTitle, metaTitle, item, event.target.value)} /></div>
            <div className="space-y-1.5"><Label>Meta description</Label><Textarea rows={3} value={metaDescription[item]} onChange={(event) => update(setMetaDescription, metaDescription, item, event.target.value)} /></div>
            <div className="space-y-1.5 md:col-span-2"><Label>Page content</Label><Textarea rows={5} value={String(content[item].body ?? "")} onChange={(event) => setContent({ ...content, [item]: { ...content[item], body: event.target.value } })} /></div>
          </TabsContent>
        ))}
      </Tabs>
      <Button onClick={submit} disabled={create.isPending} className="gap-2"><Plus className="h-4 w-4" />{create.isPending ? "Creating…" : "Create page"}</Button>
    </section>
  );
}

export function AdminContent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const pagesQuery = useListAdminContentPages();
  const deletePage = useDeleteAdminContentPage();
  const [selectedPage, setSelectedPage] = useState<string | undefined>();
  const [showNew, setShowNew] = useState(false);
  const pages = pagesQuery.data ?? [];
  const selected = pages.find((item) => item.page === selectedPage) ?? pages[0];

  useEffect(() => {
    if (!selectedPage && pages[0]) setSelectedPage(pages[0].page);
  }, [pages, selectedPage]);

  const remove = async (page: string) => {
    if (!window.confirm(`Delete the custom page "${page}"?`)) return;
    try {
      await deletePage.mutateAsync({ page });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/content"] });
      setSelectedPage(undefined);
      toast({ title: "Page deleted" });
    } catch (error) {
      toast({ title: "Could not delete page", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    }
  };

  return (
    <div className="max-w-6xl space-y-6 p-4 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold tracking-tight">Page Content</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage every published and draft CMS page in English, Japanese, and Simplified Chinese.</p>
        </div>
        <Button onClick={() => setShowNew((value) => !value)} className="gap-2"><Plus className="h-4 w-4" />{showNew ? "Close" : "New page"}</Button>
      </div>
      {showNew && <NewPageForm onCreated={(page) => { setShowNew(false); setSelectedPage(page); void pagesQuery.refetch(); }} />}
      {pagesQuery.isLoading && <p className="py-10 text-sm text-muted-foreground">Loading CMS pages…</p>}
      {pagesQuery.isError && <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><AlertCircle className="h-4 w-4" />Unable to load CMS pages. Refresh and try again.</div>}
      {!pagesQuery.isLoading && !pagesQuery.isError && pages.length > 0 && (
        <>
          <Tabs value={selected?.page} onValueChange={setSelectedPage}>
            <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
              {pages.map((item) => <TabsTrigger key={item.page} value={item.page}>{item.title.en || item.page}{item.isCustom ? " · Custom" : ""}</TabsTrigger>)}
            </TabsList>
          </Tabs>
          {selected && (
            <div className="space-y-4">
              <PageEditor key={selected.page} page={selected.page} summary={selected} />
              {selected.isCustom && <Button variant="outline" className="gap-2 text-destructive" onClick={() => remove(selected.page)} disabled={deletePage.isPending}><Trash2 className="h-4 w-4" />Delete custom page</Button>}
            </div>
          )}
        </>
      )}
      {!pagesQuery.isLoading && !pagesQuery.isError && pages.length === 0 && <div className="rounded-md border p-6 text-sm text-muted-foreground">No CMS pages exist yet.</div>}
      {selected && !selected.published && <div className="flex items-center gap-2 text-xs text-amber-700"><CheckCircle2 className="h-4 w-4" />This page is saved as a draft.</div>}
    </div>
  );
}