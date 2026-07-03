import { useEffect, useState } from "react";
import { useGetPageSeo, useUpdateAdminSeo, getGetPageSeoQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface SeoFormData {
  slug: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
}

function SeoForm({
  initial,
  onSave,
  isPending,
}: {
  initial: SeoFormData;
  onSave: (data: SeoFormData) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState<SeoFormData>(initial);

  useEffect(() => setForm(initial), [initial]);

  const set = (field: keyof SeoFormData, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label>URL Slug</Label>
        <Input value={form.slug} onChange={(e) => set("slug", e.target.value)} />
        <p className="text-xs text-muted-foreground">Used for the sitemap link, e.g. "/" or "/rentalcar".</p>
      </div>
      <div className="space-y-1.5">
        <Label>Meta Title</Label>
        <Input value={form.metaTitle} onChange={(e) => set("metaTitle", e.target.value)} />
        <p className="text-xs text-muted-foreground">Shown as the browser tab title and in search results.</p>
      </div>
      <div className="space-y-1.5">
        <Label>Meta Description</Label>
        <Textarea rows={2} value={form.metaDescription} onChange={(e) => set("metaDescription", e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Keywords</Label>
        <Input value={form.keywords} onChange={(e) => set("keywords", e.target.value)} placeholder="comma, separated, keywords" />
      </div>
      <div className="space-y-1.5">
        <Label>Open Graph Title</Label>
        <Input value={form.ogTitle} onChange={(e) => set("ogTitle", e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Open Graph Description</Label>
        <Textarea rows={2} value={form.ogDescription} onChange={(e) => set("ogDescription", e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Open Graph Image URL</Label>
        <Input value={form.ogImage} onChange={(e) => set("ogImage", e.target.value)} />
      </div>
      <Button onClick={() => onSave(form)} disabled={isPending} className="w-full sm:w-auto">
        {isPending ? "Saving…" : "Save SEO Settings"}
      </Button>
    </div>
  );
}

export function AdminSeo() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: homeSeo, isLoading: homeLoading } = useGetPageSeo("home", {
    query: { queryKey: getGetPageSeoQueryKey("home") },
  });
  const { data: rentalcarSeo, isLoading: rentalcarLoading } = useGetPageSeo("rentalcar", {
    query: { queryKey: getGetPageSeoQueryKey("rentalcar") },
  });
  const { data: lodgingSeo, isLoading: lodgingLoading } = useGetPageSeo("lodging", {
    query: { queryKey: getGetPageSeoQueryKey("lodging") },
  });

  const updateSeo = useUpdateAdminSeo();

  function handleSave(page: string, data: SeoFormData) {
    updateSeo.mutate(
      {
        page,
        data: {
          slug: data.slug,
          metaTitle: data.metaTitle,
          metaDescription: data.metaDescription,
          keywords: data.keywords.split(",").map((k) => k.trim()).filter(Boolean),
          ogTitle: data.ogTitle,
          ogDescription: data.ogDescription,
          ogImage: data.ogImage,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "SEO settings updated", description: "Changes are live on the public site." });
          queryClient.invalidateQueries({ queryKey: getGetPageSeoQueryKey(page) });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to update SEO settings.", variant: "destructive" });
        },
      },
    );
  }

  return (
    <div className="p-8 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-serif font-bold tracking-tight">SEO Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Edit per-page metadata for search engines and social sharing. Also used to build the sitemap.
        </p>
      </div>

      <Tabs defaultValue="home">
        <TabsList>
          <TabsTrigger value="home">Home Page</TabsTrigger>
          <TabsTrigger value="rentalcar">Rental Car Page</TabsTrigger>
          <TabsTrigger value="lodging">Lodging Page</TabsTrigger>
        </TabsList>
        <TabsContent value="home" className="pt-6">
          {homeLoading || !homeSeo ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <SeoForm
              initial={{
                slug: homeSeo.slug,
                metaTitle: homeSeo.metaTitle,
                metaDescription: homeSeo.metaDescription,
                keywords: homeSeo.keywords.join(", "),
                ogTitle: homeSeo.ogTitle,
                ogDescription: homeSeo.ogDescription,
                ogImage: homeSeo.ogImage,
              }}
              onSave={(data) => handleSave("home", data)}
              isPending={updateSeo.isPending}
            />
          )}
        </TabsContent>
        <TabsContent value="rentalcar" className="pt-6">
          {rentalcarLoading || !rentalcarSeo ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <SeoForm
              initial={{
                slug: rentalcarSeo.slug,
                metaTitle: rentalcarSeo.metaTitle,
                metaDescription: rentalcarSeo.metaDescription,
                keywords: rentalcarSeo.keywords.join(", "),
                ogTitle: rentalcarSeo.ogTitle,
                ogDescription: rentalcarSeo.ogDescription,
                ogImage: rentalcarSeo.ogImage,
              }}
              onSave={(data) => handleSave("rentalcar", data)}
              isPending={updateSeo.isPending}
            />
          )}
        </TabsContent>
        <TabsContent value="lodging" className="pt-6">
          {lodgingLoading || !lodgingSeo ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <SeoForm
              initial={{
                slug: lodgingSeo.slug,
                metaTitle: lodgingSeo.metaTitle,
                metaDescription: lodgingSeo.metaDescription,
                keywords: lodgingSeo.keywords.join(", "),
                ogTitle: lodgingSeo.ogTitle,
                ogDescription: lodgingSeo.ogDescription,
                ogImage: lodgingSeo.ogImage,
              }}
              onSave={(data) => handleSave("lodging", data)}
              isPending={updateSeo.isPending}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
