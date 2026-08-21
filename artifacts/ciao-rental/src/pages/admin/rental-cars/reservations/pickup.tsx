import { useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useAdminReservation, useAdminReservationAction } from "@/hooks/use-rental-operations";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Camera, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function AdminReservationPickup() {
  const [, params] = useRoute("/admin/rental-cars/reservations/:id/pickup");
  const id = Number(params?.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const { data: res, isLoading } = useAdminReservation(id);
  const actionMut = useAdminReservationAction();

  const [checklist, setChecklist] = useState({
    licenseChecked: false,
    damageInspected: false,
    fuelChecked: false,
    contractSigned: false,
  });
  const [notes, setNotes] = useState("");
  const [mileage, setMileage] = useState("");
  const [fuelLevel, setFuelLevel] = useState("Full");
  const [exteriorPhotos, setExteriorPhotos] = useState("");
  const [interiorPhotos, setInteriorPhotos] = useState("");
  const [damageDescription, setDamageDescription] = useState("");

  if (isLoading) return <div className="p-8">Loading...</div>;
  if (!res) return <div className="p-8">Reservation not found</div>;

  const allChecked = Object.values(checklist).every(Boolean);

  const handleSubmit = () => {
    if (!allChecked) return;
    actionMut.mutate({ id, action: "pickup", data: {
      notes, mileage: Number(mileage), fuelLevel,
      identityConfirmed: checklist.contractSigned,
      licenseConfirmed: checklist.licenseChecked,
      idpConfirmed: checklist.licenseChecked,
      paymentConfirmed: checklist.fuelChecked,
      depositConfirmed: checklist.damageInspected,
      exteriorPhotos: exteriorPhotos.split("\n").map((url) => url.trim()).filter(Boolean),
      interiorPhotos: interiorPhotos.split("\n").map((url) => url.trim()).filter(Boolean),
      damageNotes: damageDescription ? [{ location: "Condition report", description: damageDescription }] : [],
    } }, {
      onSuccess: () => {
        toast({ title: "Pickup complete", description: "Vehicle is now active." });
        setLocation(`/admin/rental-cars/reservations/${id}`);
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    });
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <Link href={`/admin/rental-cars/reservations/${id}`}>
          <Button variant="outline" size="icon"><ChevronLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-serif font-bold">Process Pickup</h1>
          <p className="text-muted-foreground">Reservation #{id} • {res.driver?.fullName}</p>
        </div>
      </div>

      <div className="bg-card border rounded-lg p-6 space-y-6 shadow-sm">
        <h2 className="text-lg font-bold flex items-center gap-2 border-b pb-2">
          <CheckCircle2 className="w-5 h-5 text-primary" /> Required Checklist
        </h2>
        
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <Checkbox id="c1" checked={checklist.licenseChecked} onCheckedChange={c => setChecklist(s => ({...s, licenseChecked: !!c}))} />
            <div className="grid gap-1.5 leading-none">
              <Label htmlFor="c1" className="font-medium text-base cursor-pointer">Verify Driver's License</Label>
              <p className="text-sm text-muted-foreground">Ensure international driving permit is valid if applicable.</p>
            </div>
          </div>
          
          <div className="flex items-start space-x-3">
            <Checkbox id="c2" checked={checklist.damageInspected} onCheckedChange={c => setChecklist(s => ({...s, damageInspected: !!c}))} />
            <div className="grid gap-1.5 leading-none">
              <Label htmlFor="c2" className="font-medium text-base cursor-pointer">Pre-rental Damage Inspection</Label>
              <p className="text-sm text-muted-foreground">Walk around the vehicle with customer. Take photos of any existing damage.</p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <Checkbox id="c3" checked={checklist.fuelChecked} onCheckedChange={c => setChecklist(s => ({...s, fuelChecked: !!c}))} />
            <div className="grid gap-1.5 leading-none">
              <Label htmlFor="c3" className="font-medium text-base cursor-pointer">Fuel & Mileage Recorded</Label>
              <p className="text-sm text-muted-foreground">Confirm full tank and note starting mileage.</p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <Checkbox id="c4" checked={checklist.contractSigned} onCheckedChange={c => setChecklist(s => ({...s, contractSigned: !!c}))} />
            <div className="grid gap-1.5 leading-none">
              <Label htmlFor="c4" className="font-medium text-base cursor-pointer">Rental Agreement Signed</Label>
              <p className="text-sm text-muted-foreground">Customer has signed terms and conditions.</p>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label>Pickup mileage</Label><Input type="number" min="0" value={mileage} onChange={(event) => setMileage(event.target.value)} required /></div>
            <div><Label>Fuel level</Label><Select value={fuelLevel} onValueChange={setFuelLevel}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Full", "3/4", "1/2", "1/4", "Empty"].map((level) => <SelectItem key={level} value={level}>{level}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div><Label>Exterior photo URLs</Label><Textarea value={exteriorPhotos} onChange={(event) => setExteriorPhotos(event.target.value)} placeholder="One public URL per line" /></div>
          <div><Label>Interior photo URLs</Label><Textarea value={interiorPhotos} onChange={(event) => setInteriorPhotos(event.target.value)} placeholder="One public URL per line" /></div>
          <div><Label>Existing damage notes / car diagram marks</Label><Textarea value={damageDescription} onChange={(event) => setDamageDescription(event.target.value)} placeholder="Describe and locate any pre-existing damage" /></div>
          <div>
            <Label>Pickup Notes (Optional)</Label>
            <Textarea 
              value={notes} 
              onChange={e => setNotes(e.target.value)} 
              placeholder="Any remarks about the pickup process..." 
              className="mt-2"
            />
          </div>

          <Button 
            className="w-full text-lg h-12" 
            size="lg" 
            disabled={!allChecked || !mileage || actionMut.isPending}
            onClick={handleSubmit}
          >
            {actionMut.isPending ? "Processing..." : "Complete Pickup"}
          </Button>
        </div>
      </div>
    </div>
  );
}
