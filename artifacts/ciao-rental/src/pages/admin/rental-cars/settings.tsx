import { useAdminSettings, useUpdateAdminSettings } from "@/hooks/use-rental-operations";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function AdminSettings() {
  const { data: settings, isLoading } = useAdminSettings();
  const updateMut = useUpdateAdminSettings();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    cleaningBufferMinutes: 120,
    preparationBufferMinutes: 60,
    airportDeliveryTravelBufferMinutes: 60,
    lateNightReturnBufferMinutes: 30,
    holdExpiryMinutes: 30,
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        cleaningBufferMinutes: settings.cleaningBufferMinutes ?? 120,
        preparationBufferMinutes: settings.preparationBufferMinutes ?? 60,
        airportDeliveryTravelBufferMinutes: settings.airportDeliveryTravelBufferMinutes ?? 60,
        lateNightReturnBufferMinutes: settings.lateNightReturnBufferMinutes ?? 30,
        holdExpiryMinutes: settings.holdExpiryMinutes ?? 30,
      });
    }
  }, [settings]);

  const handleSave = () => {
    updateMut.mutate(formData, {
      onSuccess: () => toast({ title: "Settings saved successfully" }),
      onError: (err: any) => toast({ title: "Failed to save", description: err.message, variant: "destructive" })
    });
  };

  if (isLoading) return <div className="p-8 text-center">Loading settings...</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold">Global Settings</h1>
        <p className="text-muted-foreground">System-wide parameters for the rental car operations.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Turnaround buffers & booking holds</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>Cleaning buffer (minutes)</Label>
              <Input 
                type="number" 
                value={formData.cleaningBufferMinutes} 
                onChange={e => setFormData(s => ({...s, cleaningBufferMinutes: Number(e.target.value)}))} 
              />
            </div>
            <div className="space-y-2">
              <Label>Preparation buffer (minutes)</Label>
              <Input 
                type="number" value={formData.preparationBufferMinutes} 
                onChange={e => setFormData(s => ({...s, preparationBufferMinutes: Number(e.target.value)}))} 
              />
            </div>
          </div>

          <div className="grid gap-4 pt-4 border-t">
            {[["Airport delivery travel buffer", "airportDeliveryTravelBufferMinutes"], ["Late-night return buffer", "lateNightReturnBufferMinutes"], ["Booking hold expiry", "holdExpiryMinutes"]].map(([label, key]) => <div className="space-y-2" key={key}><Label>{label} (minutes)</Label><Input type="number" value={(formData as Record<string, number>)[key]} onChange={e => setFormData(s => ({...s, [key]: Number(e.target.value)}))} /></div>)}
          </div>

          <Button onClick={handleSave} disabled={updateMut.isPending} className="w-full">
            Save Settings
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
