import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAdminReservations, useAdminReservationAction, useCreateAdminReservation } from "@/hooks/use-rental-operations";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, MoreHorizontal, Check, X, Car, CalendarClock } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function AdminReservations() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({ vehicleId: "", pickupAt: "", returnAt: "", pickupLocation: "CIAO Sapporo", returnLocation: "CIAO Sapporo", fullName: "", email: "", phone: "", customPrice: "", source: "phone" });

  const { data: reservations = [], isLoading } = useAdminReservations({ 
    status: statusFilter !== "all" ? statusFilter : undefined 
  });
  
  const actionMut = useAdminReservationAction();
  const createManual = useCreateAdminReservation();

  const handleAction = (id: number, action: string) => {
    actionMut.mutate({ id, action }, {
      onSuccess: () => {
        toast({ title: "Reservation updated" });
      },
      onError: (err: any) => {
        toast({ title: "Action failed", description: err.message, variant: "destructive" });
      }
    });
  };

  const filtered = Array.isArray(reservations) ? reservations.filter((r: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.id.toString().includes(q) || r.pickupLocation?.toLowerCase().includes(q) || r.driver?.fullName?.toLowerCase().includes(q);
  }) : [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold">Reservations</h1>
          <p className="text-muted-foreground">Manage rental car bookings and operational flow.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search ID, name, location..." value={search} onChange={e => setSearch(e.target.value)} className="w-64 pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending_payment">Pending payment</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="in_rental">In rental</SelectItem>
              <SelectItem value="return_completed">Returned</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setManualOpen(true)}>Manual reservation</Button>
        </div>
      </div>
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>New manual reservation</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["Vehicle ID", "vehicleId", "number"], ["Pickup", "pickupAt", "datetime-local"], ["Return", "returnAt", "datetime-local"],
              ["Pickup location", "pickupLocation", "text"], ["Return location", "returnLocation", "text"], ["Customer name", "fullName", "text"],
              ["Customer email", "email", "email"], ["Phone", "phone", "tel"], ["Custom price (¥)", "customPrice", "number"],
            ].map(([label, key, type]) => <div key={key} className="space-y-1"><Label>{label}</Label><Input type={type} value={(manual as Record<string, string>)[key]} onChange={(event) => setManual((value) => ({ ...value, [key]: event.target.value }))} /></div>)}
            <div className="space-y-1"><Label>Source</Label><Select value={manual.source} onValueChange={(source) => setManual((value) => ({ ...value, source }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="phone">Phone</SelectItem><SelectItem value="walk_in">Walk-in</SelectItem><SelectItem value="partner">Partner</SelectItem><SelectItem value="airbnb">Airbnb</SelectItem><SelectItem value="corporate">Corporate</SelectItem></SelectContent></Select></div>
          </div>
          <Button disabled={createManual.isPending} onClick={() => createManual.mutate({ vehicleId: Number(manual.vehicleId), pickupAt: new Date(manual.pickupAt).toISOString(), returnAt: new Date(manual.returnAt).toISOString(), pickupLocation: manual.pickupLocation, returnLocation: manual.returnLocation, driver: { fullName: manual.fullName, email: manual.email, phone: manual.phone }, customPrice: manual.customPrice ? Number(manual.customPrice) : undefined, source: manual.source }, { onSuccess: () => { setManualOpen(false); toast({ title: "Manual reservation created" }); }, onError: (error: Error) => toast({ title: "Could not create reservation", description: error.message, variant: "destructive" }) })}>Create reservation</Button>
        </DialogContent>
      </Dialog>

      <div className="bg-card border rounded-lg overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Vehicle ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No reservations found.</TableCell></TableRow>
            ) : (
              filtered.map((r: any) => (
                <TableRow key={r.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => setLocation(`/admin/rental-cars/reservations/${r.id}`)}>
                  <TableCell className="font-mono">#{r.id}</TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{new Date(r.pickupAt).toLocaleDateString()}</div>
                    <div className="text-xs text-muted-foreground">to {new Date(r.returnAt).toLocaleDateString()}</div>
                  </TableCell>
                  <TableCell>{r.driver?.fullName || "N/A"}</TableCell>
                  <TableCell>#{r.vehicleId}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === 'confirmed' ? 'default' : r.status === 'cancelled' ? 'destructive' : 'secondary'}>
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{r.paymentStatus}</TableCell>
                  <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreHorizontal className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setLocation(`/admin/rental-cars/reservations/${r.id}`)}>
                          View Details
                        </DropdownMenuItem>
                        {['pending_payment', 'driver_documents_pending', 'driver_documents_under_review'].includes(r.status) && (
                          <DropdownMenuItem onClick={() => handleAction(r.id, "confirm")}>
                            <Check className="w-4 h-4 mr-2" /> Confirm
                          </DropdownMenuItem>
                        )}
                        {r.status === 'confirmed' && (
                          <DropdownMenuItem onClick={() => setLocation(`/admin/rental-cars/reservations/${r.id}/pickup`)}>
                            <Car className="w-4 h-4 mr-2" /> Start Pickup
                          </DropdownMenuItem>
                        )}
                        {['in_rental', 'overdue'].includes(r.status) && (
                          <DropdownMenuItem onClick={() => setLocation(`/admin/rental-cars/reservations/${r.id}/return`)}>
                            <CalendarClock className="w-4 h-4 mr-2" /> Process Return
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => handleAction(r.id, "cancel")} className="text-destructive">
                          <X className="w-4 h-4 mr-2" /> Cancel
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
