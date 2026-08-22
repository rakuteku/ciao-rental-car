import { useAdminPricingRules, useCreateAdminPricingRule, useUpdateAdminPricingRule, useDeleteAdminPricingRule } from "@/hooks/use-rental-operations";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export function AdminPricingRules() {
  const { data: rules = [], isLoading } = useAdminPricingRules();
  const createMut = useCreateAdminPricingRule();
  const updateMut = useUpdateAdminPricingRule();
  const deleteMut = useDeleteAdminPricingRule();
  const { toast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({ name: "", appliesTo: "all", vehicleClass: "", multiplier: "1.0", startDate: "", endDate: "", isActive: true });
  const [editId, setEditId] = useState<number | null>(null);

  const openForm = (rule?: any) => {
    if (rule) {
      setEditId(rule.id);
      setFormData({ name: rule.name, appliesTo: rule.appliesTo || "all", vehicleClass: rule.vehicleClass || "", multiplier: String(rule.multiplier || 1.0), startDate: rule.startDate || "", endDate: rule.endDate || "", isActive: rule.isActive });
    } else {
      setEditId(null);
      setFormData({ name: "", appliesTo: "all", vehicleClass: "", multiplier: "1.0", startDate: "", endDate: "", isActive: true });
    }
    setIsOpen(true);
  };

  const handleSave = () => {
    const payload = {
      name: formData.name,
      appliesTo: formData.appliesTo,
      vehicleClass: formData.appliesTo === "class" ? formData.vehicleClass : null,
      startDate: formData.startDate,
      endDate: formData.endDate,
      multiplier: Number(formData.multiplier),
      isActive: formData.isActive,
    };
    if (editId) {
      updateMut.mutate({ id: editId, data: payload }, {
        onSuccess: () => { toast({ title: "Updated Rule" }); setIsOpen(false); }
      });
    } else {
      createMut.mutate(payload, {
        onSuccess: () => { toast({ title: "Created Rule" }); setIsOpen(false); }
      });
    }
  };

  const handleDelete = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Delete this rule?")) {
      deleteMut.mutate(id, {
        onSuccess: () => toast({ title: "Deleted rule" })
      });
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-serif font-bold">Pricing Rules</h1>
          <p className="text-muted-foreground">Dynamic multipliers and seasonal adjustments.</p>
        </div>
        <Button onClick={() => openForm()}>Add Rule</Button>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Edit" : "Add"} Pricing Rule</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Rule Name</Label>
              <Input value={formData.name} onChange={e => setFormData(s => ({...s, name: e.target.value}))} />
            </div>
            <div>
              <Label>Applies to</Label>
              <select className="w-full h-10 rounded-md border bg-background px-3" value={formData.appliesTo} onChange={e => setFormData(s => ({...s, appliesTo: e.target.value}))}>
                <option value="all">All vehicles</option>
                <option value="class">Vehicle class</option>
              </select>
            </div>
            {formData.appliesTo === "class" && <div>
              <Label>Vehicle class</Label>
              <Input value={formData.vehicleClass} onChange={e => setFormData(s => ({...s, vehicleClass: e.target.value}))} placeholder="compact, SUV, minivan..." />
            </div>}
            <div>
              <Label>Start date</Label>
              <Input type="date" value={formData.startDate} onChange={e => setFormData(s => ({...s, startDate: e.target.value}))} />
            </div>
            <div>
              <Label>End date</Label>
              <Input type="date" value={formData.endDate} onChange={e => setFormData(s => ({...s, endDate: e.target.value}))} />
            </div>
            <div>
              <Label>Multiplier (e.g. 1.2 = +20%)</Label>
              <Input type="number" step="0.1" value={formData.multiplier} onChange={e => setFormData(s => ({...s, multiplier: e.target.value}))} />
            </div>
            <Button className="w-full" onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="bg-card border rounded-lg overflow-x-auto shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rule Name</TableHead>
              <TableHead>Target Class</TableHead>
              <TableHead>Multiplier</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : rules.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No rules found.</TableCell></TableRow>
            ) : (
              rules.map((r: any) => (
                <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openForm(r)}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.appliesTo === "all" ? "All vehicles" : r.vehicleClass || `Vehicle #${r.vehicleId}`}</TableCell>
                  <TableCell>{r.multiplier}x</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={e => handleDelete(r.id, e)}>Delete</Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
