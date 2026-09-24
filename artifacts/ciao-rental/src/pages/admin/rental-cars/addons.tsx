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

type PricingType = "flat" | "per_day";
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
  pricingType: "per_day",
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
      const pricingType: PricingType = addon.pricingType === "per_day" ? "per_day" : "flat";
      setEditId(addon.id);
      setFormData({
        name: addon.name,
        nameJa: addon.nameJa || "",
        nameZhTw: addon.nameZhTw || "",
        description: addon.description || "",
        descriptionJa: addon.descriptionJa || "",
        descriptionZhTw: addon.descriptionZhTw || "",
        pricingType,
        price: String(pricingType === "per_day" ? addon.perDayFee || 0 : addon.flatFee || 0),
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
      flatFee: formData.pricingType === "flat" ? price : 0,
      perDayFee: formData.pricingType === "per_day" ? price : 0,
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
                  <SelectContent><SelectItem value="per_day">Per day</SelectItem><SelectItem value="flat">Flat fee per booking</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Price (¥)</Label>
                <Input type="number" min="0" step="1" value={formData.price} onChange={(event) => setFormData((current) => ({ ...current, price: event.target.value }))} />
                <p className="text-xs text-muted-foreground">{formData.pricingType === "per_day" ? "Multiplied by the rental days." : "Charged once for the booking."}</p>
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
              const isPerDay = addon.pricingType === "per_day";
              return <TableRow key={addon.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openForm(addon)}><TableCell className="font-medium">{addon.name}</TableCell><TableCell>{addon.nameJa || "—"}</TableCell><TableCell>{addon.nameZhTw || "—"}</TableCell><TableCell>{formatYen(isPerDay ? addon.perDayFee : addon.flatFee)} {isPerDay ? "/ day" : "/ booking"}</TableCell><TableCell className="text-right"><Button variant="ghost" size="sm" className="text-destructive" onClick={(event) => handleDelete(addon.id, event)}>Delete</Button></TableCell></TableRow>;
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
