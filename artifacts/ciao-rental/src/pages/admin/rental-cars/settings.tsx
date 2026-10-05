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
import { Plus, Trash2 } from "lucide-react";
import { useLanguage } from "@/lib/language";
import { DEFAULT_RENTAL_LOCATIONS, normalizeRentalLocations, type RentalLocation } from "@/lib/rental-locations";

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
  const { language } = useLanguage();
  const ja = language === "ja";
  const t = (english: string, japanese: string) => ja ? japanese : english;

  const [formData, setFormData] = useState<{
    cleaningBufferMinutes: number;
    preparationBufferMinutes: number;
    airportDeliveryTravelBufferMinutes: number;
    lateNightReturnBufferMinutes: number;
    holdExpiryMinutes: number;
    bookingLocations: RentalLocation[];
    oneWayFees: Array<{ pickupLocation: string; returnLocation: string; fee: number; active: boolean }>;
  }>({
    cleaningBufferMinutes: 120,
    preparationBufferMinutes: 60,
    airportDeliveryTravelBufferMinutes: 60,
    lateNightReturnBufferMinutes: 30,
    holdExpiryMinutes: 30,
    bookingLocations: DEFAULT_RENTAL_LOCATIONS,
    oneWayFees: [],
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        cleaningBufferMinutes: settings.cleaningBufferMinutes ?? 120,
        preparationBufferMinutes: settings.preparationBufferMinutes ?? 60,
        airportDeliveryTravelBufferMinutes: settings.airportDeliveryTravelBufferMinutes ?? 60,
        lateNightReturnBufferMinutes: settings.lateNightReturnBufferMinutes ?? 30,
        holdExpiryMinutes: settings.holdExpiryMinutes ?? 30,
        bookingLocations: normalizeRentalLocations(settings.bookingLocations),
        oneWayFees: Array.isArray(settings.oneWayFees) ? settings.oneWayFees : [],
      });
    }
  }, [settings]);

  const handleSave = () => {
    if (formData.bookingLocations.some(location => !location.value.trim() || !location.labelEn.trim())) {
      toast({ title: t("Location details are incomplete", "場所の設定が未入力です"), description: t("Each location needs a booking value and English label.", "各場所に予約値と英語表示名を入力してください。"), variant: "destructive" });
      return;
    }
    updateMut.mutate(formData, {
      onSuccess: () => toast({ title: t("Settings saved successfully", "設定を保存しました") }),
      onError: (err: any) => toast({ title: t("Failed to save", "保存できませんでした"), description: err.message, variant: "destructive" })
    });
  };

  if (isLoading) return <div className="p-8 text-center">{t("Loading settings...", "設定を読み込んでいます...")}</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold">{t("Global Settings", "全体設定")}</h1>
        <p className="text-muted-foreground">{t("System-wide parameters for the rental car operations.", "レンタカー運営全体に適用される設定です。")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("Turnaround buffers & booking holds", "清掃・準備時間と予約保持")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>{t("Cleaning buffer (minutes)", "清掃時間（分）")}</Label>
              <Input 
                type="number" 
                value={formData.cleaningBufferMinutes} 
                onChange={e => setFormData(s => ({...s, cleaningBufferMinutes: Number(e.target.value)}))} 
              />
            </div>
            <div className="space-y-2">
              <Label>{t("Preparation buffer (minutes)", "準備時間（分）")}</Label>
              <Input 
                type="number" value={formData.preparationBufferMinutes} 
                onChange={e => setFormData(s => ({...s, preparationBufferMinutes: Number(e.target.value)}))} 
              />
            </div>
          </div>

          <div className="grid gap-4 pt-4 border-t">
            {[[t("Airport delivery travel buffer", "空港配車の移動時間"), "airportDeliveryTravelBufferMinutes"], [t("Late-night return buffer", "夜間返却の予備時間"), "lateNightReturnBufferMinutes"], [t("Booking hold expiry", "予約保持の有効時間"), "holdExpiryMinutes"]].map(([label, key]) => <div className="space-y-2" key={key}><Label>{label} ({t("minutes", "分")})</Label><Input type="number" value={formData[key as "airportDeliveryTravelBufferMinutes" | "lateNightReturnBufferMinutes" | "holdExpiryMinutes"]} onChange={e => setFormData(s => ({...s, [key]: Number(e.target.value)}))} /></div>)}
          </div>

          <Button onClick={handleSave} disabled={updateMut.isPending} className="w-full">
            {t("Save Settings", "設定を保存")}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("Pickup & return locations", "受取・返却場所")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("Set the customer-facing translation for every booking option. The booking value is stored with reservations and should remain stable.", "予約画面に表示する各場所の翻訳を設定します。予約値は予約データに保存されるため、運用開始後は変更しないでください。")}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {formData.bookingLocations.map((location, index) => {
            const updateLocation = (key: keyof RentalLocation, value: string) => setFormData(current => ({
              ...current,
              bookingLocations: current.bookingLocations.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
            }));
            return <div key={`${location.value}-${index}`} className="grid gap-3 rounded-md border p-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_140px_140px_auto]">
              <div className="space-y-1.5"><Label>{t("Booking value", "予約値")}</Label><Input value={location.value} onChange={event => updateLocation("value", event.target.value)} placeholder="Sapporo Station" /></div>
              <div className="space-y-1.5"><Label>{t("English label", "英語表示")}</Label><Input value={location.labelEn} onChange={event => updateLocation("labelEn", event.target.value)} /></div>
              <div className="space-y-1.5"><Label>{t("Japanese label", "日本語表示")}</Label><Input value={location.labelJa} onChange={event => updateLocation("labelJa", event.target.value)} /></div>
              <div className="space-y-1.5"><Label>{t("Traditional Chinese label", "繁体字表示")}</Label><Input value={location.labelZhTw} onChange={event => updateLocation("labelZhTw", event.target.value)} /></div>
              <div className="space-y-1.5"><Label>{t("Pickup fee (JPY)", "受取料金（円）")}</Label><Input type="number" min="0" step="1" value={location.pickupFee} onChange={event => setFormData(current => ({ ...current, bookingLocations: current.bookingLocations.map((item, itemIndex) => itemIndex === index ? { ...item, pickupFee: Number(event.target.value) } : item) }))} /></div>
              <div className="space-y-1.5"><Label>{t("Return fee (JPY)", "返却料金（円）")}</Label><Input type="number" min="0" step="1" value={location.returnFee} onChange={event => setFormData(current => ({ ...current, bookingLocations: current.bookingLocations.map((item, itemIndex) => itemIndex === index ? { ...item, returnFee: Number(event.target.value) } : item) }))} /></div>
              <Button type="button" variant="ghost" size="icon" className="self-end" aria-label={t("Remove location", "場所を削除")} disabled={formData.bookingLocations.length === 1}
                onClick={() => setFormData(current => ({ ...current, bookingLocations: current.bookingLocations.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 className="h-4 w-4" /></Button>
            </div>;
          })}
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" onClick={() => setFormData(current => ({ ...current, bookingLocations: [...current.bookingLocations, { value: "", labelEn: "", labelJa: "", labelZhTw: "", pickupFee: 0, returnFee: 0 }] }))}><Plus className="mr-2 h-4 w-4" />{t("Add location", "場所を追加")}</Button>
            <Button type="button" onClick={handleSave} disabled={updateMut.isPending}>{updateMut.isPending ? t("Saving...", "保存中...") : t("Save locations", "場所を保存")}</Button>
          </div>
          <div className="space-y-3 border-t pt-5">
            <div><h3 className="font-semibold">{t("One-way fee overrides", "乗り捨て特別料金")}</h3><p className="text-sm text-muted-foreground">{t("An active override replaces both normal location fees.", "有効な特別料金は通常の受取・返却料金の両方を置き換えます。")}</p></div>
            {formData.oneWayFees.map((fee, index) => <div key={index} className="grid gap-3 rounded-md border p-4 md:grid-cols-[1fr_1fr_160px_auto_auto]">
              <div className="space-y-1.5"><Label>{t("Pickup", "受取")}</Label><select className="h-10 w-full rounded-md border bg-background px-3" value={fee.pickupLocation} onChange={event => setFormData(current => ({ ...current, oneWayFees: current.oneWayFees.map((item, i) => i === index ? { ...item, pickupLocation: event.target.value } : item) }))}>{formData.bookingLocations.map(location => <option key={location.value} value={location.value}>{location.labelEn}</option>)}</select></div>
              <div className="space-y-1.5"><Label>{t("Return", "返却")}</Label><select className="h-10 w-full rounded-md border bg-background px-3" value={fee.returnLocation} onChange={event => setFormData(current => ({ ...current, oneWayFees: current.oneWayFees.map((item, i) => i === index ? { ...item, returnLocation: event.target.value } : item) }))}>{formData.bookingLocations.map(location => <option key={location.value} value={location.value}>{location.labelEn}</option>)}</select></div>
              <div className="space-y-1.5"><Label>{t("Override fee (JPY)", "特別料金（円）")}</Label><Input type="number" min="0" step="1" value={fee.fee} onChange={event => setFormData(current => ({ ...current, oneWayFees: current.oneWayFees.map((item, i) => i === index ? { ...item, fee: Number(event.target.value) } : item) }))} /></div>
              <div className="flex items-end pb-2"><Switch checked={fee.active} onCheckedChange={active => setFormData(current => ({ ...current, oneWayFees: current.oneWayFees.map((item, i) => i === index ? { ...item, active } : item) }))} /></div>
              <Button type="button" variant="ghost" size="icon" className="self-end" onClick={() => setFormData(current => ({ ...current, oneWayFees: current.oneWayFees.filter((_, i) => i !== index) }))}><Trash2 className="h-4 w-4" /></Button>
            </div>)}
            <Button type="button" variant="outline" onClick={() => setFormData(current => ({ ...current, oneWayFees: [...current.oneWayFees, { pickupLocation: current.bookingLocations[0]?.value ?? "", returnLocation: current.bookingLocations[1]?.value ?? current.bookingLocations[0]?.value ?? "", fee: 0, active: true }] }))}><Plus className="mr-2 h-4 w-4" />{t("Add one-way fee", "乗り捨て料金を追加")}</Button>
          </div>
        </CardContent>
      </Card>
      <MarketplacePolicySettings />
      <AdminFinanceReconciliation />
    </div>
  );
}
