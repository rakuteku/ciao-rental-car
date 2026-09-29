import { useAdminSettings, useUpdateAdminSettings } from "@/hooks/use-rental-operations";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useCallback } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

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

async function adminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || body?.message || `Request failed (${response.status})`);
  return body as T;
}

function redactSnapshot(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSnapshot);
  if (!value || typeof value !== "object") {
    return typeof value === "string"
      ? value.replace(/\b(sk_(?:test|live)_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+)\b/g, "[redacted]")
      : value;
  }
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !/(secret|token|password|credential|authorization|idempotency|email|phone|address)/i.test(key))
    .map(([key, item]) => [key, redactSnapshot(item)]));
}

function FinanceCollection({ title, rows, emptyText, children }: {
  title: string;
  rows: any[];
  emptyText: string;
  children: (row: any) => ReactNode;
}) {
  return <Card>
    <CardHeader><CardTitle>{title} <span className="ml-1 text-sm font-normal text-muted-foreground">({rows.length})</span></CardTitle></CardHeader>
    <CardContent className="space-y-3">
      {rows.length ? rows.map((row, index) => <div key={row.id ?? row.stripeEventId ?? row.stripeDisputeId ?? index} className="rounded-md border p-4">{children(row)}</div>) : <p className="text-sm text-muted-foreground">{emptyText}</p>}
    </CardContent>
  </Card>;
}

function AdminFinanceReconciliation() {
  const client = useQueryClient();
  const finance = useQuery({
    queryKey: ["admin", "rental", "finance", "global"],
    queryFn: () => adminRequest<any>("/api/admin/rental/finance"),
    refetchInterval: 30_000,
  });
  const deliveryStatuses = ["pending", "unconfigured", "failed"] as const;
  const deliveryQueries = useQueries({
    queries: deliveryStatuses.map(status => ({
      queryKey: ["admin", "rental", "notifications", status],
      queryFn: () => adminRequest<any[]>(`/api/admin/rental/notifications?status=${status}`),
      refetchInterval: 30_000,
    })),
  });
  const retry = useMutation({
    mutationFn: ({ id, confirmDuplicateRisk }: { id: number; confirmDuplicateRisk: boolean }) =>
      adminRequest<any>(`/api/admin/rental/notifications/${encodeURIComponent(id)}/retry`, {
        method: "POST",
        body: JSON.stringify({ confirmDuplicateRisk }),
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["admin", "rental", "notifications"] });
    },
  });
  const [retryNotice, setRetryNotice] = useState("");
  const { toast } = useToast();
  const rows = finance.data || {};
  const payments = Array.isArray(rows.payments) ? rows.payments : [];
  const refunds = Array.isArray(rows.refunds) ? rows.refunds : [];
  const disputes = Array.isArray(rows.disputes) ? rows.disputes : [];
  const payouts = Array.isArray(rows.payouts) ? rows.payouts : [];
  const unresolvedFailures = (Array.isArray(rows.reconciliationFailures) ? rows.reconciliationFailures : [])
    .filter((item: any) => !item.resolvedAt);
  const stripeEvents = Array.isArray(rows.stripeEvents) ? rows.stripeEvents : [];
  const notifications = deliveryQueries.flatMap(query => Array.isArray(query.data) ? query.data : []);
  const notificationError = deliveryQueries.find(query => query.isError)?.error;

  return <div className="space-y-6">
    <div>
      <h2 className="text-2xl font-serif font-bold">Global finance & delivery reconciliation</h2>
      <p className="mt-1 text-sm text-muted-foreground">Unmatched Stripe events and unresolved payment issues across all reservations.</p>
    </div>
    {finance.isLoading ? <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading global finance ledger…</CardContent></Card>
      : finance.isError ? <Card><CardContent className="space-y-3 p-6"><p role="alert" className="text-sm text-destructive">{finance.error.message}</p><Button variant="outline" onClick={() => void finance.refetch()}>Retry finance load</Button></CardContent></Card>
        : <>
          <Card className={unresolvedFailures.length || stripeEvents.length ? "border-red-300" : ""}>
            <CardHeader><CardTitle className="flex items-center justify-between gap-3">Unresolved reconciliation failures <span className="rounded-full bg-red-100 px-3 py-1 text-sm text-red-800">{unresolvedFailures.length}</span></CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {unresolvedFailures.length ? unresolvedFailures.map((failure: any) => <div key={failure.id} className="rounded-md border border-red-200 bg-red-50 p-4 text-sm">
                <p className="font-semibold">{failure.failureType || "Reconciliation failure"} · #{failure.id}</p>
                <p className="mt-1">{String(redactSnapshot(failure.message))}</p>
                <p className="mt-1 text-xs text-muted-foreground">Payment #{failure.paymentId ?? "unmatched"} · Stripe event {failure.stripeEventId || "not linked"} · {failure.createdAt ? new Date(failure.createdAt).toLocaleString() : "Date unavailable"}</p>
                {failure.details && <p className="mt-2 break-words text-xs text-muted-foreground">Reference details: {JSON.stringify(redactSnapshot(failure.details))}</p>}
              </div>) : <p className="text-sm text-muted-foreground">No unresolved reconciliation failures.</p>}
            </CardContent>
          </Card>

          <FinanceCollection title="Failed Stripe events" rows={stripeEvents} emptyText="No failed Stripe events.">
            {event => <div className="space-y-1 text-sm">
              <p className="font-semibold">{event.eventType || "Stripe event"} · {event.status}</p>
              <p className="break-all text-xs text-muted-foreground">Event {event.id} · object {event.objectId || "unmatched"} · attempts {event.attempts ?? "—"}</p>
              <p className="text-xs text-muted-foreground">Received {event.receivedAt ? new Date(event.receivedAt).toLocaleString() : "—"}{event.processedAt ? ` · Last processed ${new Date(event.processedAt).toLocaleString()}` : ""}</p>
              <p className="text-xs text-red-700">Event processing failed. Review the linked reconciliation failure.</p>
            </div>}
          </FinanceCollection>

          <FinanceCollection title="Payments" rows={payments} emptyText="No global payment records.">
            {payment => <div className="space-y-2 text-sm">
              <div className="flex flex-wrap justify-between gap-3"><strong>Payment #{payment.id} · {payment.status}</strong><strong>{payment.currency || "JPY"} {Number(payment.amount || 0).toLocaleString()}</strong></div>
              <p className="text-xs text-muted-foreground">Reservation #{payment.reservationId} · Request #{payment.requestId} · Operator #{payment.operatorId} · {payment.provider || "provider unavailable"}</p>
              <div className="space-y-1 break-all text-xs text-muted-foreground">
                {payment.stripeCheckoutSessionId && <p>Checkout session: {payment.stripeCheckoutSessionId}</p>}
                {payment.stripePaymentIntentId && <p>Payment intent: {payment.stripePaymentIntentId}</p>}
                {payment.stripeChargeId && <p>Charge: {payment.stripeChargeId}</p>}
                {payment.stripeProductId && <p>Stripe product: {payment.stripeProductId}</p>}
                {payment.stripePriceId && <p>Stripe price: {payment.stripePriceId}</p>}
              </div>
              <details className="rounded border bg-muted/30 p-3">
                <summary className="cursor-pointer font-medium">Immutable pricing & policy snapshots · policy version {payment.commissionPolicyVersion || "unavailable"}</summary>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <div><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Price snapshot</p><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(redactSnapshot(payment.priceSnapshot), null, 2)}</pre></div>
                  <div><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Policy snapshot</p><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(redactSnapshot(payment.policySnapshot), null, 2)}</pre></div>
                </div>
              </details>
            </div>}
          </FinanceCollection>

          <div className="grid gap-6 lg:grid-cols-2">
            <FinanceCollection title="Refunds" rows={refunds} emptyText="No refunds.">
              {refund => <div className="space-y-1 text-sm"><p className="font-semibold">Refund #{refund.id} · {refund.status} · {refund.currency || "JPY"} {Number(refund.amount || 0).toLocaleString()}</p><p className="break-all text-xs text-muted-foreground">Payment #{refund.paymentId} · Stripe refund {refund.stripeRefundId || "not assigned"}</p><p className="text-xs text-muted-foreground">{refund.reason || ""}{refund.createdAt ? ` · ${new Date(refund.createdAt).toLocaleString()}` : ""}</p></div>}
            </FinanceCollection>
            <FinanceCollection title="Disputes" rows={disputes} emptyText="No disputes.">
              {dispute => <div className="space-y-1 text-sm"><p className="font-semibold">Dispute #{dispute.id} · {dispute.status} · {dispute.currency || "JPY"} {Number(dispute.amount || 0).toLocaleString()}</p><p className="break-all text-xs text-muted-foreground">Payment #{dispute.paymentId} · Stripe dispute {dispute.stripeDisputeId}</p><p className="text-xs text-muted-foreground">{dispute.reason || ""}{dispute.evidenceDueAt ? ` · Evidence due ${new Date(dispute.evidenceDueAt).toLocaleString()}` : ""}</p></div>}
            </FinanceCollection>
            <FinanceCollection title="Payouts" rows={payouts} emptyText="No payouts reported.">
              {payout => <div className="space-y-1 text-sm"><p className="font-semibold">Payout #{payout.id} · {payout.status} · {payout.currency || "JPY"} {Number(payout.amount || 0).toLocaleString()}</p><p className="break-all text-xs text-muted-foreground">Payment #{payout.paymentId} · Reference: {payout.reference || "—"}</p><p className="text-xs text-muted-foreground">{payout.reportedAt ? `Reported ${new Date(payout.reportedAt).toLocaleString()}` : ""}</p></div>}
            </FinanceCollection>
          </div>
        </>}

    <Card>
      <CardHeader><CardTitle>Rental email delivery queue</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Pending, unconfigured, and failed deliveries. Message contents and mail credentials are intentionally not shown.</p>
        {notificationError && <p role="alert" className="text-sm text-destructive">{notificationError instanceof Error ? notificationError.message : "Could not load email delivery queue."}</p>}
        {deliveryQueries.some(query => query.isLoading) ? <p role="status" className="text-sm text-muted-foreground">Loading notification delivery records…</p>
          : notifications.length ? notifications.map((notification: any) => {
            const uncertain = Boolean(notification.dataSubmittedAt);
            const inFlight = retry.isPending && retry.variables?.id === notification.id;
            return <NotificationDeliveryRow key={notification.id} notification={notification} uncertain={uncertain} inFlight={inFlight}
              onRetry={(confirmDuplicateRisk) => {
                setRetryNotice("");
                retry.mutate({ id: Number(notification.id), confirmDuplicateRisk }, {
                  onSuccess: result => {
                    setRetryNotice(`Notification #${notification.id}: ${result.deliveryStatus || "retry accepted"}.`);
                    toast({ title: "Delivery retry submitted", description: `Current status: ${result.deliveryStatus || "pending"}` });
                  },
                  onError: error => toast({ title: "Retry failed", description: error.message, variant: "destructive" }),
                });
              }} />;
          }) : !notificationError && <p className="text-sm text-muted-foreground">No pending, unconfigured, or failed notification deliveries.</p>}
        {retryNotice && <p role="status" className="text-sm text-emerald-700">{retryNotice}</p>}
      </CardContent>
    </Card>
  </div>;
}

function NotificationDeliveryRow({ notification, uncertain, inFlight, onRetry }: {
  notification: any;
  uncertain: boolean;
  inFlight: boolean;
  onRetry: (confirmDuplicateRisk: boolean) => void;
}) {
  const [confirmDuplicateRisk, setConfirmDuplicateRisk] = useState(false);
  return <div className="rounded-md border p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1 text-sm">
        <p className="font-semibold">Notification #{notification.id} · {notification.eventType} · <span className="capitalize">{notification.deliveryStatus}</span></p>
        <p className="text-muted-foreground">Recipient: {notification.email || "Unavailable"} · Attempts: {notification.attemptCount ?? 0}</p>
        <p className="text-xs text-muted-foreground">Created {notification.createdAt ? new Date(notification.createdAt).toLocaleString() : "—"}{notification.lastAttemptAt ? ` · Last attempt ${new Date(notification.lastAttemptAt).toLocaleString()}` : ""}{notification.nextAttemptAt ? ` · Next attempt ${new Date(notification.nextAttemptAt).toLocaleString()}` : ""}</p>
        {uncertain && <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <label className="flex items-start gap-2"><input type="checkbox" checked={confirmDuplicateRisk} onChange={event => setConfirmDuplicateRisk(event.target.checked)} className="mt-1" /><span><strong>Possible uncertain SMTP DATA submission:</strong> message data was already handed to SMTP, but delivery confirmation is missing. Retrying may send a duplicate; explicitly confirm that risk to proceed.</span></label>
        </div>}
      </div>
      <Button size="sm" variant="outline" disabled={inFlight || (uncertain && !confirmDuplicateRisk)}
        onClick={() => onRetry(confirmDuplicateRisk)}>{inFlight ? "Retrying…" : "Retry delivery"}</Button>
    </div>
  </div>;
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
      <AdminFinanceReconciliation />
    </div>
  );
}
