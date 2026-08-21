import { useAdminAddons, useCreateAdminAddon, useUpdateAdminAddon, useDeleteAdminAddon } from "@/hooks/use-rental-operations";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function AdminAddons() {
  const { data: addons = [], isLoading } = useAdminAddons();
  const createMut = useCreateAdminAddon();
  const updateMut = useUpdateAdminAddon();
  const deleteMut = useDeleteAdminAddon();
  const { toast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({ name: "", description: "", flatFee: "", perDayFee: "", perUnitFee: "" });
  const [editId, setEditId] = useState<number | null>(null);

  const openForm = (addon?: any) => {
    if (addon) {
      setEditId(addon.id);
      setFormData({ name: addon.name, description: addon.description || "", flatFee: String(addon.flatFee || 0), perDayFee: String(addon.perDayFee || 0), perUnitFee: String(addon.perUnitFee || 0) });
    } else {
      setEditId(null);
      setFormData({ name: "", description: "", flatFee: "0", perDayFee: "0", perUnitFee: "0" });
    }
    setIsOpen(true);
  };

  const handleSave = () => {
    const payload = {
      name: formData.name,
      description: formData.description,
      flatFee: Number(formData.flatFee),
      perDayFee: Number(formData.perDayFee),
      perUnitFee: Number(formData.perUnitFee),
    };
    if (editId) {
      updateMut.mutate({ id: editId, data: payload }, {
        onSuccess: () => { toast({ title: "Updated Addon" }); setIsOpen(false); }
      });
    } else {
      createMut.mutate(payload, {
        onSuccess: () => { toast({ title: "Created Addon" }); setIsOpen(false); }
      });
    }
  };

  const handleDelete = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Delete this addon?")) {
      deleteMut.mutate(id, {
        onSuccess: () => toast({ title: "Deleted addon" })
      });
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-serif font-bold">Addons</h1>
          <p className="text-muted-foreground">Manage extra services and products.</p>
        </div>
        <Button onClick={() => openForm()}>Add New</Button>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Edit" : "Add"} Addon</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Name</Label>
              <Input value={formData.name} onChange={e => setFormData(s => ({...s, name: e.target.value}))} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={formData.description} onChange={e => setFormData(s => ({...s, description: e.target.value}))} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Flat Fee ($)</Label>
                <Input type="number" value={formData.flatFee} onChange={e => setFormData(s => ({...s, flatFee: e.target.value}))} />
              </div>
              <div>
                <Label>Per Day ($)</Label>
                <Input type="number" value={formData.perDayFee} onChange={e => setFormData(s => ({...s, perDayFee: e.target.value}))} />
              </div>
              <div>
                <Label>Per Unit ($)</Label>
                <Input type="number" value={formData.perUnitFee} onChange={e => setFormData(s => ({...s, perUnitFee: e.target.value}))} />
              </div>
            </div>
            <Button className="w-full" onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="bg-card border rounded-lg overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Flat Fee</TableHead>
              <TableHead>Per Day</TableHead>
              <TableHead>Per Unit</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : addons.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No addons found.</TableCell></TableRow>
            ) : (
              addons.map((a: any) => (
                <TableRow key={a.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openForm(a)}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell>${a.flatFee}</TableCell>
                  <TableCell>${a.perDayFee}</TableCell>
                  <TableCell>${a.perUnitFee}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={e => handleDelete(a.id, e)}>Delete</Button>
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
