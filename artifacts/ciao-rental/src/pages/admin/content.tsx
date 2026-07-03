import { useEffect, useState } from "react";
import { useGetPageContent, useUpdateAdminContent, getGetPageContentQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2 } from "lucide-react";

interface WhyItem {
  title: string;
  description: string;
}

interface HomeContent {
  hero: { title: string; subtitle: string; ctaLodging: string; ctaRentalCar: string };
  lodging: { title: string; description: string };
  monthlyStay: { title: string; description: string };
  rentalCarOverview: { title: string; description: string };
  access: { title: string; description: string; address: string; mapEmbedUrl: string };
  whyChooseUs: WhyItem[];
  contact: { title: string; description: string; ctaText: string };
}

interface PricingRow {
  label: string;
  value: string;
}

interface Plan {
  name: string;
  description: string;
  price: string;
}

interface AddOn {
  name: string;
  description: string;
  price: string;
}

interface RentalCarContent {
  pricingTable: { title: string; description: string; rows: PricingRow[] };
  plans: Plan[];
  addOns: AddOn[];
  importantNotes: string[];
}

function RepeatableFields<T extends Record<string, string>>({
  items,
  onChange,
  fields,
  newItem,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  fields: { key: keyof T; label: string; multiline?: boolean }[];
  newItem: T;
}) {
  function updateItem(index: number, key: keyof T, value: string) {
    const next = [...items];
    next[index] = { ...next[index], [key]: value };
    onChange(next);
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-4">
      {items.map((item, index) => (
        <div key={index} className="border rounded-md p-4 space-y-3 relative">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 text-destructive hover:text-destructive h-7 w-7"
            onClick={() => removeItem(index)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pr-8">
            {fields.map((f) => (
              <div key={String(f.key)} className={f.multiline ? "sm:col-span-2 space-y-1.5" : "space-y-1.5"}>
                <Label className="text-xs">{f.label}</Label>
                {f.multiline ? (
                  <Textarea
                    value={item[f.key] ?? ""}
                    onChange={(e) => updateItem(index, f.key, e.target.value)}
                    rows={2}
                  />
                ) : (
                  <Input
                    value={item[f.key] ?? ""}
                    onChange={(e) => updateItem(index, f.key, e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => onChange([...items, newItem])}>
        <Plus className="h-3.5 w-3.5" /> Add
      </Button>
    </div>
  );
}

function HomeContentForm({ initial, onSave, isPending }: { initial: HomeContent; onSave: (data: HomeContent) => void; isPending: boolean }) {
  const [form, setForm] = useState<HomeContent>(initial);

  useEffect(() => setForm(initial), [initial]);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Hero</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={form.hero.title} onChange={(e) => setForm({ ...form, hero: { ...form.hero, title: e.target.value } })} />
          </div>
          <div className="space-y-1.5">
            <Label>Subtitle</Label>
            <Input value={form.hero.subtitle} onChange={(e) => setForm({ ...form, hero: { ...form.hero, subtitle: e.target.value } })} />
          </div>
          <div className="space-y-1.5">
            <Label>Lodging CTA text</Label>
            <Input value={form.hero.ctaLodging} onChange={(e) => setForm({ ...form, hero: { ...form.hero, ctaLodging: e.target.value } })} />
          </div>
          <div className="space-y-1.5">
            <Label>Rental Car CTA text</Label>
            <Input value={form.hero.ctaRentalCar} onChange={(e) => setForm({ ...form, hero: { ...form.hero, ctaRentalCar: e.target.value } })} />
          </div>
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Lodging</h3>
        <div className="space-y-1.5">
          <Label>Title</Label>
          <Input value={form.lodging.title} onChange={(e) => setForm({ ...form, lodging: { ...form.lodging, title: e.target.value } })} />
        </div>
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea rows={2} value={form.lodging.description} onChange={(e) => setForm({ ...form, lodging: { ...form.lodging, description: e.target.value } })} />
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Monthly Stay</h3>
        <div className="space-y-1.5">
          <Label>Title</Label>
          <Input value={form.monthlyStay.title} onChange={(e) => setForm({ ...form, monthlyStay: { ...form.monthlyStay, title: e.target.value } })} />
        </div>
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea rows={2} value={form.monthlyStay.description} onChange={(e) => setForm({ ...form, monthlyStay: { ...form.monthlyStay, description: e.target.value } })} />
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Rental Car Overview</h3>
        <div className="space-y-1.5">
          <Label>Title</Label>
          <Input value={form.rentalCarOverview.title} onChange={(e) => setForm({ ...form, rentalCarOverview: { ...form.rentalCarOverview, title: e.target.value } })} />
        </div>
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea rows={2} value={form.rentalCarOverview.description} onChange={(e) => setForm({ ...form, rentalCarOverview: { ...form.rentalCarOverview, description: e.target.value } })} />
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Why Choose Us</h3>
        <RepeatableFields
          items={form.whyChooseUs}
          onChange={(items) => setForm({ ...form, whyChooseUs: items })}
          fields={[
            { key: "title", label: "Title" },
            { key: "description", label: "Description", multiline: true },
          ]}
          newItem={{ title: "", description: "" }}
        />
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Location & Access</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={form.access.title} onChange={(e) => setForm({ ...form, access: { ...form.access, title: e.target.value } })} />
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Input value={form.access.address} onChange={(e) => setForm({ ...form, access: { ...form.access, address: e.target.value } })} />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Description</Label>
            <Textarea rows={2} value={form.access.description} onChange={(e) => setForm({ ...form, access: { ...form.access, description: e.target.value } })} />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Google Maps Embed URL</Label>
            <Input value={form.access.mapEmbedUrl} onChange={(e) => setForm({ ...form, access: { ...form.access, mapEmbedUrl: e.target.value } })} />
          </div>
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Contact</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={form.contact.title} onChange={(e) => setForm({ ...form, contact: { ...form.contact, title: e.target.value } })} />
          </div>
          <div className="space-y-1.5">
            <Label>CTA Button Text</Label>
            <Input value={form.contact.ctaText} onChange={(e) => setForm({ ...form, contact: { ...form.contact, ctaText: e.target.value } })} />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Description</Label>
            <Textarea rows={2} value={form.contact.description} onChange={(e) => setForm({ ...form, contact: { ...form.contact, description: e.target.value } })} />
          </div>
        </div>
      </section>

      <Button onClick={() => onSave(form)} disabled={isPending} className="w-full sm:w-auto">
        {isPending ? "Saving…" : "Save Home Page Content"}
      </Button>
    </div>
  );
}

function RentalCarContentForm({ initial, onSave, isPending }: { initial: RentalCarContent; onSave: (data: RentalCarContent) => void; isPending: boolean }) {
  const [form, setForm] = useState<RentalCarContent>(initial);

  useEffect(() => setForm(initial), [initial]);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Pricing Table</h3>
        <div className="space-y-1.5">
          <Label>Title</Label>
          <Input value={form.pricingTable.title} onChange={(e) => setForm({ ...form, pricingTable: { ...form.pricingTable, title: e.target.value } })} />
        </div>
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea rows={2} value={form.pricingTable.description} onChange={(e) => setForm({ ...form, pricingTable: { ...form.pricingTable, description: e.target.value } })} />
        </div>
        <Label className="text-xs text-muted-foreground">Pricing Rows</Label>
        <RepeatableFields
          items={form.pricingTable.rows}
          onChange={(rows) => setForm({ ...form, pricingTable: { ...form.pricingTable, rows } })}
          fields={[
            { key: "label", label: "Label" },
            { key: "value", label: "Value" },
          ]}
          newItem={{ label: "", value: "" }}
        />
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Insurance Plans</h3>
        <RepeatableFields
          items={form.plans}
          onChange={(plans) => setForm({ ...form, plans })}
          fields={[
            { key: "name", label: "Name" },
            { key: "price", label: "Price" },
            { key: "description", label: "Description", multiline: true },
          ]}
          newItem={{ name: "", description: "", price: "" }}
        />
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Add-Ons</h3>
        <RepeatableFields
          items={form.addOns}
          onChange={(addOns) => setForm({ ...form, addOns })}
          fields={[
            { key: "name", label: "Name" },
            { key: "price", label: "Price" },
            { key: "description", label: "Description", multiline: true },
          ]}
          newItem={{ name: "", description: "", price: "" }}
        />
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Important Notes</h3>
        <Textarea
          placeholder="One note per line"
          rows={5}
          value={form.importantNotes.join("\n")}
          onChange={(e) => setForm({ ...form, importantNotes: e.target.value.split("\n") })}
        />
        <p className="text-xs text-muted-foreground">Enter one note per line.</p>
      </section>

      <Button onClick={() => onSave({ ...form, importantNotes: form.importantNotes.map((n) => n.trim()).filter(Boolean) })} disabled={isPending} className="w-full sm:w-auto">
        {isPending ? "Saving…" : "Save Rental Car Page Content"}
      </Button>
    </div>
  );
}

export function AdminContent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: homeData, isLoading: homeLoading } = useGetPageContent("home", {
    query: { queryKey: getGetPageContentQueryKey("home") },
  });
  const { data: rentalcarData, isLoading: rentalcarLoading } = useGetPageContent("rentalcar", {
    query: { queryKey: getGetPageContentQueryKey("rentalcar") },
  });

  const updateContent = useUpdateAdminContent();

  function handleSave(page: string, content: Record<string, unknown>) {
    updateContent.mutate(
      { page, data: { content } },
      {
        onSuccess: () => {
          toast({ title: "Content updated", description: "Changes are live on the public site." });
          queryClient.invalidateQueries({ queryKey: getGetPageContentQueryKey(page) });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to update content.", variant: "destructive" });
        },
      },
    );
  }

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-serif font-bold tracking-tight">Page Content</h1>
        <p className="text-muted-foreground text-sm mt-1">Edit content sections. Changes reflect immediately on the public site.</p>
      </div>

      <Tabs defaultValue="home">
        <TabsList>
          <TabsTrigger value="home">Home Page</TabsTrigger>
          <TabsTrigger value="rentalcar">Rental Car Page</TabsTrigger>
        </TabsList>
        <TabsContent value="home" className="pt-6">
          {homeLoading || !homeData ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <HomeContentForm
              initial={homeData.content as unknown as HomeContent}
              onSave={(data) => handleSave("home", data as unknown as Record<string, unknown>)}
              isPending={updateContent.isPending}
            />
          )}
        </TabsContent>
        <TabsContent value="rentalcar" className="pt-6">
          {rentalcarLoading || !rentalcarData ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <RentalCarContentForm
              initial={rentalcarData.content as unknown as RentalCarContent}
              onSave={(data) => handleSave("rentalcar", data as unknown as Record<string, unknown>)}
              isPending={updateContent.isPending}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
