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
import { useLanguage } from "@/lib/language";

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
  category: "equipment" | "insurance" | "winter_tires";
  insuranceKind: "basic" | "cdw" | "noc" | "full";
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
  category: "equipment",
  insuranceKind: "cdw",
});

function formatYen(value: number) {
  return `¥${Number(value || 0).toLocaleString("ja-JP")}`;
}

export function AdminAddons() {
  const { language } = useLanguage();
  const t = (en: string, ja: string) => language === "ja" ? ja : en;
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
        category: addon.category || "equipment",
        insuranceKind: addon.insuranceKind || "cdw",
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
    if (!formData.name.trim() || !Number.isInteger(price) || price < 0) {
      toast({ title: t("Check the add-on details", "入力内容を確認してください"), description: t("English name and a whole-yen price are required.", "英語名と整数の円料金が必要です。"), variant: "destructive" });
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
      category: formData.category,
      insuranceKind: formData.category === "insurance" ? formData.insuranceKind : null,
      maxQty: 1,
      flatFee: ["per_rental", "per_handover"].includes(formData.pricingType) ? price : 0,
      perDayFee: formData.pricingType === "per_started_24_hours" ? price : 0,
      published: formData.category !== "winter_tires",
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
        <div><h1 className="text-3xl font-serif font-bold">{t("Equipment & protection", "備品・補償")}</h1></div>
        <Button onClick={() => openForm()}>{t("Add New", "新規追加")}</Button>
      </div>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? t("Edit equipment or protection", "備品・補償を編集") : t("Add equipment or protection", "備品・補償を追加")}</DialogTitle></DialogHeader>
          <div className="space-y-6 py-3">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>{t("Category", "種類")}</Label><Select value={formData.category} onValueChange={(category: AddonFormData["category"]) => setFormData(current => ({ ...current, category }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="equipment">{t("Optional equipment", "オプション備品")}</SelectItem><SelectItem value="insurance">{t("Insurance & protection", "保険・補償")}</SelectItem><SelectItem value="winter_tires">{t("Winter tires (included, not sold)", "冬用タイヤ（標準装備・販売なし）")}</SelectItem></SelectContent></Select></div>
              {formData.category === "insurance" && <div className="space-y-1.5"><Label>{t("Protection type", "補償の種類")}</Label><Select value={formData.insuranceKind} onValueChange={(insuranceKind: AddonFormData["insuranceKind"]) => setFormData(current => ({ ...current, insuranceKind }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="basic">{t("Basic", "基本補償")}</SelectItem><SelectItem value="cdw">{t("CDW / deductible waiver", "CDW・免責補償")}</SelectItem><SelectItem value="noc">{t("NOC protection", "NOC補償")}</SelectItem><SelectItem value="full">{t("Full protection package", "フル補償パッケージ")}</SelectItem></SelectContent></Select></div>}
            </div>
            {([ ["English", "name", "description"], ["日本語", "nameJa", "descriptionJa"], ["繁體中文", "nameZhTw", "descriptionZhTw"] ] as const).map(([language, nameField, descriptionField]) => (
              <section key={language} className="space-y-3 border-b pb-5 last:border-b-0">
                <h3 className="text-sm font-semibold">{language}</h3>
                <div className="space-y-1.5"><Label>{t("Name", "名称")}{language === "English" ? " *" : ""}</Label><Input value={formData[nameField]} onChange={(event) => setFormData((current) => ({ ...current, [nameField]: event.target.value }))} /></div>
                <div className="space-y-1.5"><Label>{t("Description / coverage terms", "説明・補償条件")}</Label><Textarea value={formData[descriptionField]} onChange={(event) => setFormData((current) => ({ ...current, [descriptionField]: event.target.value }))} /></div>
              </section>
            ))}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("Pricing method", "料金の計算方法")}</Label>
                <Select value={formData.pricingType} onValueChange={(value: PricingType) => setFormData((current) => ({ ...current, pricingType: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="per_started_24_hours">{t("Per started 24 hours", "24時間ごと（端数切上げ）")}</SelectItem><SelectItem value="per_rental">{t("Per rental", "1予約につき")}</SelectItem><SelectItem value="per_handover">{t("Per handover", "引渡しごと")}</SelectItem><SelectItem value="included">{t("Included", "料金に含む")}</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("Price (¥)", "料金（円）")}</Label>
                <Input type="number" min="0" step="1" value={formData.price} onChange={(event) => setFormData((current) => ({ ...current, price: event.target.value }))} />
                <p className="text-xs text-muted-foreground">{formData.pricingType === "per_started_24_hours" ? "A 25-hour rental uses two periods." : formData.pricingType === "included" ? "Shown as included with no charge." : formData.pricingType === "per_handover" ? "Charged once for the selected handover service." : "Charged once per booking."}</p>
              </div>
            </div>
            <Button className="w-full" onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}>{t("Save", "保存")}</Button>
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
