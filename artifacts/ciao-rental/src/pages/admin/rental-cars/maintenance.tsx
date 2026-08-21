import { useAdminMaintenance, useCreateAdminMaintenance, useUpdateAdminMaintenance } from "@/hooks/use-rental-operations";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function AdminMaintenance() {
  const { data: logs = [], isLoading } = useAdminMaintenance();
  const createMut = useCreateAdminMaintenance();
  const updateMut = useUpdateAdminMaintenance();
  const { toast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({ vehicleId: "", type: "", status: "scheduled", cost: "", notes: "" });
  const [editId, setEditId] = useState<number | null>(null);

  const openForm = (log?: any) => {
    if (log) {
      setEditId(log.id);
      setFormData({ vehicleId: String(log.vehicleId), type: log.type, status: log.status, cost: String(log.cost || ""), notes: log.notes || "" });
    } else {
      setEditId(null);
      setFormData({ vehicleId: "", type: "", status: "scheduled", cost: "", notes: "" });
    }
    setIsOpen(true);
  };

  const handleSave = () => {
    const payload = {
      vehicleId: Number(formData.vehicleId),
      type: formData.type,
      status: formData.status,
      cost: Number(formData.cost) || 0,
      notes: formData.notes
    };
    if (editId) {
      updateMut.mutate({ id: editId, data: payload }, {
        onSuccess: () => { toast({ title: "Updated log" }); setIsOpen(false); }
      });
    } else {
      createMut.mutate(payload, {
        onSuccess: () => { toast({ title: "Created log" }); setIsOpen(false); }
      });
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-serif font-bold">Maintenance Logs</h1>
          <p className="text-muted-foreground">Track service, repairs, and cleaning.</p>
        </div>
        <Button onClick={() => openForm()}>Add Log</Button>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Edit" : "Add"} Maintenance</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Vehicle ID</Label>
              <Input type="number" value={formData.vehicleId} onChange={e => setFormData(s => ({...s, vehicleId: e.target.value}))} />
            </div>
            <div>
              <Label>Task / Description</Label>
              <Input value={formData.type} onChange={e => setFormData(s => ({...s, type: e.target.value}))} placeholder="Oil change, cleaning, repair..." />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={v => setFormData(s => ({...s, status: v}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Cost ($)</Label>
              <Input type="number" value={formData.cost} onChange={e => setFormData(s => ({...s, cost: e.target.value}))} />
            </div>
            <Button className="w-full" onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="bg-card border rounded-lg overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vehicle ID</TableHead>
              <TableHead>Task</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Cost</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : logs.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No logs found.</TableCell></TableRow>
            ) : (
              logs.map((log: any) => (
                <TableRow key={log.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openForm(log)}>
                  <TableCell>#{log.vehicleId}</TableCell>
                  <TableCell className="font-medium">{log.type}</TableCell>
                  <TableCell className="capitalize">{log.status.replace("_", " ")}</TableCell>
                  <TableCell>${log.cost}</TableCell>
                  <TableCell>{new Date(log.createdAt || Date.now()).toLocaleDateString()}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
