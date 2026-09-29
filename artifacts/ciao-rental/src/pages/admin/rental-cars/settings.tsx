import { useAdminSettings, useUpdateAdminSettings } from "@/hooks/use-rental-operations";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useCallback } from "react";

const policyFields = [
  ["marketplaceCommissionPercent", "Commission (%)", "number"],
  ["marketplacePayoutTerms", "Payout terms", "text"],
  ["marketplaceCancellationPolicy", "Cancellation policy", "text"],
  ["marketplaceDepositPolicy", "Deposit policy", "text"],
  ["marketplaceResponsePeriodHours", "Response period (hours)", "number"],
  ["marketplacePaymentWindowHours", "Payment window after offer acceptance (hours)", "number"],
  ["marketplaceCoverageTerms", "Insurance / coverage terms", "text"],
] as const;

function MarketplacePolicySettings() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/rental/marketplace-policy", { credentials: "same-origin" });
      if (!response.ok) throw new Error(`Unable to load marketplace policy (${response.status})`);
      const data = await response.json() as { values: Record<string, string | number | null>; missing: string[] };
      setValues(Object.fromEntries(policyFields.map(([key]) => [key, String(data.values[key] ?? "")])));
      setMissing(data.missing);
      setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load policy"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function save() {
    setSaving(true); setError(""); setSuccess("");
    try {
      const body = Object.fromEntries(policyFields.map(([key, , type]) =>
        [key, values[key]?.trim() ? (type === "number" ? Number(values[key]) : values[key].trim()) : null]));
      const response = await fetch("/api/admin/rental/marketplace-policy", {
        method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not save policy");
      }
      const data = await response.json() as { missing: string[] };
      setMissing(data.missing);
      setSuccess("Marketplace policy saved.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save policy"); }
    finally { setSaving(false); }
  }
  return <Card>
    <CardHeader><CardTitle>Partner marketplace decisions</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">Partner vehicles cannot be offered until every decision is supplied. Enter approved terms only; blank fields remain undecided. Existing CIAO fleet settings are unchanged.</p>
      {loading ? <p role="status">Loading marketplace decisions…</p> : <>
        {policyFields.map(([key, label, type]) => <div key={key} className="space-y-2">
          <Label htmlFor={key}>{label}{missing.includes(key) ? " — decision required" : ""}</Label>
          <Input id={key} type={type} min={type === "number" ? (key === "marketplaceCommissionPercent" ? 0 : 0.01) : undefined}
            max={key === "marketplacePaymentWindowHours" || key === "marketplaceResponsePeriodHours" ? 720 : undefined}
            step={type === "number" ? "any" : undefined}
            value={values[key] ?? ""} onChange={event => setValues(prev => ({ ...prev, [key]: event.target.value }))} />
        </div>)}
        {error && <p role="alert" className="text-red-700">{error}</p>}
        {success && <p role="status">{success}</p>}
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save partner decisions"}</Button>
      </>}
    </CardContent>
  </Card>;
}

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
      <MarketplacePolicySettings />
    </div>
  );
}
