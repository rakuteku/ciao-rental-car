import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAdminAddons, useCreateAdminAddon, useDeleteAdminAddon, useUpdateAdminAddon } from "@/hooks/use-rental-operations";

type PricingType = "per_started_24_hours" | "per_rental" | "per_handover" | "included";
type AddonFormData = {
  name: string;
  nameJa: string;
  nameZhTw: string;
  description: string;
  descriptionJa: string;
  descriptionZhTw: string;
  pricingType: PricingType;
  price: string;
};

const emptyForm = (): AddonFormData => ({
  name: "",
  nameJa: "",
  nameZhTw: "",
  description: "",
  descriptionJa: "",
  descriptionZhTw: "",
  pricingType: "per_started_24_hours",
  price: "0",
});

function formatYen(value: number) {
  return `¥${Number(value || 0).toLocaleString("ja-JP")}`;
}

export function AdminAddons() {
  const { data: addons = [], isLoading } = useAdminAddons();
  const createMut = useCreateAdminAddon();
  const updateMut = useUpdateAdminAddon();
  const deleteMut = useDeleteAdminAddon();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState<AddonFormData>(emptyForm);
  const [editId, setEditId] = useState<number | null>(null);

  const openForm = (addon?: any) => {
    if (addon) {
      const pricingType: PricingType = addon.pricingType === "per_day" ? "per_started_24_hours" : addon.pricingType === "flat" ? "per_rental" : addon.pricingType;
      setEditId(addon.id);
      setFormData({
        name: addon.name,
        nameJa: addon.nameJa || "",
        nameZhTw: addon.nameZhTw || "",
        description: addon.description || "",
        descriptionJa: addon.descriptionJa || "",
        descriptionZhTw: addon.descriptionZhTw || "",
        pricingType,
        price: String(pricingType === "per_started_24_hours" ? addon.perDayFee || 0 : addon.flatFee || 0),
      });
    } else {
      setEditId(null);
      setFormData(emptyForm());
    }
    setIsOpen(true);
  };

  const handleSave = () => {
    const price = Number(formData.price);
    if (!formData.name.trim() || !Number.isFinite(price) || price < 0) {
      toast({ title: "Check the add-on details", description: "English name and a valid yen price are required.", variant: "destructive" });
      return;
    }
    const payload = {
      name: formData.name.trim(),
      nameJa: formData.nameJa.trim() || null,
      nameZhTw: formData.nameZhTw.trim() || null,
      description: formData.description.trim(),
      descriptionJa: formData.descriptionJa.trim() || null,
      descriptionZhTw: formData.descriptionZhTw.trim() || null,
      pricingType: formData.pricingType,
      flatFee: ["per_rental", "per_handover"].includes(formData.pricingType) ? price : 0,
      perDayFee: formData.pricingType === "per_started_24_hours" ? price : 0,
      published: true,
    };
    const options = { onSuccess: () => { toast({ title: editId ? "Add-on updated" : "Add-on created" }); setIsOpen(false); } };
    if (editId) updateMut.mutate({ id: editId, data: payload }, options);
    else createMut.mutate(payload, options);
  };

  const handleDelete = (id: number, event: React.MouseEvent) => {
    event.stopPropagation();
    if (confirm("Delete this add-on?")) deleteMut.mutate(id, { onSuccess: () => toast({ title: "Add-on deleted" }) });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div><h1 className="text-3xl font-serif font-bold">Add-ons</h1><p className="text-muted-foreground">Manage translated extras and yen pricing.</p></div>
        <Button onClick={() => openForm()}>Add New</Button>
      </div>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? "Edit" : "Add"} Add-on</DialogTitle></DialogHeader>
          <div className="space-y-6 py-3">
            {([ ["English", "name", "description"], ["日本語", "nameJa", "descriptionJa"], ["繁體中文", "nameZhTw", "descriptionZhTw"] ] as const).map(([language, nameField, descriptionField]) => (
              <section key={language} className="space-y-3 border-b pb-5 last:border-b-0">
                <h3 className="text-sm font-semibold">{language}</h3>
                <div className="space-y-1.5"><Label>Name{language === "English" ? " *" : ""}</Label><Input value={formData[nameField]} onChange={(event) => setFormData((current) => ({ ...current, [nameField]: event.target.value }))} /></div>
                <div className="space-y-1.5"><Label>Description</Label><Textarea value={formData[descriptionField]} onChange={(event) => setFormData((current) => ({ ...current, [descriptionField]: event.target.value }))} /></div>
              </section>
            ))}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Pricing method</Label>
                <Select value={formData.pricingType} onValueChange={(value: PricingType) => setFormData((current) => ({ ...current, pricingType: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="per_started_24_hours">Per started 24 hours</SelectItem><SelectItem value="per_rental">Per rental</SelectItem><SelectItem value="per_handover">Per handover</SelectItem><SelectItem value="included">Included</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Price (¥)</Label>
                <Input type="number" min="0" step="1" value={formData.price} onChange={(event) => setFormData((current) => ({ ...current, price: event.target.value }))} />
                <p className="text-xs text-muted-foreground">{formData.pricingType === "per_started_24_hours" ? "A 25-hour rental uses two periods." : formData.pricingType === "included" ? "Shown as included with no charge." : formData.pricingType === "per_handover" ? "Charged once for the selected handover service." : "Charged once per booking."}</p>
              </div>
            </div>
            <Button className="w-full" onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
      <div className="overflow-x-auto border bg-card shadow-sm">
        <Table>
          <TableHeader><TableRow><TableHead>English</TableHead><TableHead>Japanese</TableHead><TableHead>Traditional Chinese</TableHead><TableHead>Pricing</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={5} className="py-8 text-center">Loading...</TableCell></TableRow> : addons.length === 0 ? <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No add-ons found.</TableCell></TableRow> : addons.map((addon: any) => {
              const isPerPeriod = addon.pricingType === "per_day" || addon.pricingType === "per_started_24_hours";
              const unit = isPerPeriod ? "/ started 24h" : addon.pricingType === "per_handover" ? "/ handover" : addon.pricingType === "included" ? "included" : "/ rental";
              return <TableRow key={addon.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openForm(addon)}><TableCell className="font-medium">{addon.name}</TableCell><TableCell>{addon.nameJa || "—"}</TableCell><TableCell>{addon.nameZhTw || "—"}</TableCell><TableCell>{addon.pricingType === "included" ? "Included" : formatYen(isPerPeriod ? addon.perDayFee : addon.flatFee)} {unit}</TableCell><TableCell className="text-right"><Button variant="ghost" size="sm" className="text-destructive" onClick={(event) => handleDelete(addon.id, event)}>Delete</Button></TableCell></TableRow>;
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
