import { useRoute, Link } from "wouter";
import { useAdminReservation, useAdminReservationTrip, useUpdateAdminReservation, useReviewAdminDocument, useAdminRentalFinance, useRefundAdminRentalPayment, usePayoutAdminRentalPayment, useRentalMarketplaceConfig } from "@/hooks/use-rental-operations";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Car, Calendar, User, CreditCard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useEffect, useRef, type FormEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { RentalExceptionsPanel } from "@/components/rental/RentalExceptionsPanel";

function financeRows(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of ["payments", "ledger", "items", "records", "transactions"]) {
    if (Array.isArray(value[key])) return value[key];
  }
  if (value.finance && value.finance !== value) return financeRows(value.finance);
  if (value.data && value.data !== value) return financeRows(value.data);
  return [];
}

function FinanceLedgerRow({ payment }: { payment: any }) {
  const [amount, setAmount] = useState(String(payment.refundableAmount ?? payment.amount ?? ""));
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const refund = useRefundAdminRentalPayment();
  const payout = usePayoutAdminRentalPayment();
  const { toast } = useToast();
  const paymentId = Number(payment.id ?? payment.paymentId);
  const submitRefund = (event: FormEvent) => {
    event.preventDefault();
    if (!Number.isInteger(paymentId) || paymentId <= 0 || !Number.isFinite(Number(amount)) || Number(amount) <= 0 || !reason.trim()) return;
    refund.mutate({ paymentId, amount: Number(amount), reason: reason.trim() }, {
      onSuccess: () => { setReason(""); toast({ title: "Stripe refund requested", description: "The request was submitted. Check the ledger for Stripe's current refund status." }); },
      onError: (error: Error) => toast({ title: "Refund failed", description: error.message, variant: "destructive" }),
    });
  };
  const submitPayout = (event: FormEvent) => {
    event.preventDefault();
    if (!Number.isInteger(paymentId) || paymentId <= 0 || !reference.trim()) return;
    payout.mutate({ paymentId, reference: reference.trim(), notes: notes.trim() }, {
      onSuccess: () => { setReference(""); setNotes(""); toast({ title: "Manual payout reported" }); },
      onError: (error: Error) => toast({ title: "Payout failed", description: error.message, variant: "destructive" }),
    });
  };
  return <div className="space-y-3 rounded-md border p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="font-semibold">Payment #{paymentId || "—"}</p><p className="text-sm text-muted-foreground">{payment.type || payment.kind || "Payment"} · {payment.status || "Status unavailable"}</p></div>
      <div className="text-right"><p className="font-semibold">{payment.currency || "JPY"} {payment.amount == null ? "—" : Number(payment.amount).toLocaleString()}</p>{payment.createdAt && <p className="text-xs text-muted-foreground">{new Date(payment.createdAt).toLocaleString()}</p>}</div>
    </div>
    {(payment.stripePaymentIntentId || payment.stripeCheckoutSessionId || payment.reference) && <p className="break-all text-xs text-muted-foreground">{payment.stripePaymentIntentId || payment.stripeCheckoutSessionId || payment.reference}</p>}
    {paymentId > 0 && <div className="grid gap-4 border-t pt-3 lg:grid-cols-2">
      <form onSubmit={submitRefund} className="space-y-2">
        <p className="text-sm font-medium">Manual refund</p>
        <input aria-label="Refund amount" type="number" min="1" step="1" required value={amount} onChange={event => setAmount(event.target.value)} placeholder="Amount (JPY)" className="h-10 w-full rounded-md border bg-background px-3 text-sm" />
        <Textarea required value={reason} onChange={event => setReason(event.target.value)} placeholder="Refund reason" className="min-h-16" />
        <Button type="submit" size="sm" variant="destructive" disabled={refund.isPending || !reason.trim() || Number(amount) <= 0}>{refund.isPending ? "Requesting…" : "Request Stripe refund"}</Button>
      </form>
      <form onSubmit={submitPayout} className="space-y-2">
        <p className="text-sm font-medium">Manual operator payout</p>
        <input required value={reference} onChange={event => setReference(event.target.value)} placeholder="Transfer reference" className="h-10 w-full rounded-md border bg-background px-3 text-sm" />
        <Textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Payout notes (optional)" className="min-h-16" />
        <Button type="submit" size="sm" disabled={payout.isPending || !reference.trim()}>{payout.isPending ? "Reporting…" : "Report manual payout"}</Button>
      </form>
    </div>}
  </div>;
}

export function AdminReservationDetail() {
  const [, params] = useRoute("/admin/rental-cars/reservations/:id");
  const id = Number(params?.id);
  const { data: res, isLoading } = useAdminReservation(id);
  const updateMut = useUpdateAdminReservation();
  const reviewDocument = useReviewAdminDocument();
  const financeQuery = useAdminRentalFinance(id);
  const marketplace = useRentalMarketplaceConfig();
  const tripQuery = useAdminReservationTrip(id, Boolean(marketplace.data?.enabled));
  const { toast } = useToast();

  const [notes, setNotes] = useState("");
  const initRef = useRef(false);

  useEffect(() => {
    if (res && !initRef.current) {
      setNotes(res.internalNotes || "");
      initRef.current = true;
    }
  }, [res]);

  if (isLoading) return <div className="p-8 text-center">Loading reservation...</div>;
  if (!res) return <div className="p-8 text-center text-destructive">Reservation not found</div>;

  const handleSaveNotes = () => {
    updateMut.mutate({ id, data: { internalNotes: notes } }, {
      onSuccess: () => toast({ title: "Notes saved" }),
      onError: (err: any) => toast({ title: "Failed to save", description: err.message, variant: "destructive" })
    });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/rental-cars/reservations">
          <Button variant="outline" size="icon"><ChevronLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-serif font-bold">Reservation #{res.id}</h1>
            <Badge variant={res.status === 'confirmed' || res.status === 'in_rental' ? 'default' : res.status === 'cancelled' ? 'destructive' : 'secondary'}>{res.status}</Badge>
          </div>
          <p className="text-muted-foreground text-sm">Created {new Date(res.createdAt).toLocaleString()}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Calendar className="w-5 h-5" /> Itinerary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Pickup</p>
                <p className="font-medium">{new Date(res.pickupAt).toLocaleString()}</p>
                <p className="text-sm">{res.pickupLocation}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Return</p>
                <p className="font-medium">{new Date(res.returnAt).toLocaleString()}</p>
                <p className="text-sm">{res.returnLocation}</p>
              </div>
            </div>
            {res.status === 'confirmed' && (
              <Link href={`/admin/rental-cars/reservations/${id}/pickup`}>
                <Button className="w-full mt-2">Start Pickup Process</Button>
              </Link>
            )}
            {res.status === 'in_rental' && (
              <Link href={`/admin/rental-cars/reservations/${id}/return`}>
                <Button className="w-full mt-2">Start Return Process</Button>
              </Link>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Document verification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {res.documents?.length ? res.documents.map((document: any) => (
              <div className="rounded border p-3 space-y-2" key={document.id}>
                <div className="flex items-center justify-between gap-2"><a className="font-medium underline" href={typeof document.fileUrl === "string" && document.fileUrl.startsWith("rental-private://") ? `/api/admin/rental/reservations/${id}/driver-documents/${document.id}/content` : document.fileUrl} target="_blank" rel="noreferrer">{document.docType.replace("_", " ")}</a><Badge variant="outline">{document.status}</Badge></div>
                {document.adminNotes && <p className="text-sm text-muted-foreground">{document.adminNotes}</p>}
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => reviewDocument.mutate({ id: document.id, data: { status: "approved" } }, { onSuccess: () => toast({ title: "Document approved" }) })}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => reviewDocument.mutate({ id: document.id, data: { status: "resubmit_required", adminNotes: "Please upload a clearer or valid document." } }, { onSuccess: () => toast({ title: "Resubmission requested" }) })}>Request resubmission</Button>
                  <Button size="sm" variant="destructive" onClick={() => reviewDocument.mutate({ id: document.id, data: { status: "rejected", adminNotes: "Document rejected by rental staff." } }, { onSuccess: () => toast({ title: "Document rejected" }) })}>Reject</Button>
                </div>
              </div>
            )) : <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><User className="w-5 h-5" /> Customer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p><span className="text-muted-foreground inline-block w-24">Name:</span> {res.driver?.fullName}</p>
            <p><span className="text-muted-foreground inline-block w-24">Email:</span> {res.driver?.email}</p>
            <p><span className="text-muted-foreground inline-block w-24">Phone:</span> {res.driver?.phone}</p>
            {res.driver?.flightNumber && <p><span className="text-muted-foreground inline-block w-24">Flight:</span> {res.driver.flightNumber}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Car className="w-5 h-5" /> Vehicle & Addons</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p><span className="text-muted-foreground inline-block w-24">Vehicle ID:</span> #{res.vehicleId}</p>
            {res.addons && res.addons.length > 0 ? (
              <div className="mt-4">
                <p className="font-medium text-sm mb-2">Addons:</p>
                <ul className="space-y-1 text-sm">
                  {res.addons.map((a: any) => (
                    <li key={a.id} className="flex justify-between">
                      <span>{a.qty}x Addon #{a.addonId}</span>
                      <span>¥{Number(a.totalPrice).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : <p className="text-sm text-muted-foreground mt-4">No addons selected</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><CreditCard className="w-5 h-5" /> Payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between items-center mb-2">
              <span className="text-muted-foreground">Status</span>
              <Badge variant="outline">{res.paymentStatus}</Badge>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>¥{Number(res.subtotal).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Taxes & Fees</span>
              <span>¥{(Number(res.tax || 0) + Number(res.deliveryFee || 0)).toLocaleString()}</span>
            </div>
            <div className="flex justify-between font-bold mt-2 pt-2 border-t">
              <span>Total</span>
              <span>¥{Number(res.finalTotal).toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-lg">Payment ledger & reconciliation</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {financeQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading payment ledger…</p>
              : financeQuery.isError ? <div role="alert" className="space-y-2 text-sm"><p className="text-destructive">{financeQuery.error.message}</p><Button size="sm" variant="outline" onClick={() => void financeQuery.refetch()}>Retry</Button></div>
                : financeRows(financeQuery.data).length ? financeRows(financeQuery.data).map((payment: any, index: number) => <FinanceLedgerRow key={payment.id ?? payment.paymentId ?? index} payment={payment} />)
                  : <p className="text-sm text-muted-foreground">No payment ledger entries are available for this reservation.</p>}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Internal Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea 
              value={notes} 
              onChange={e => setNotes(e.target.value)} 
              placeholder="Add staff notes here (not visible to customer)..."
              className="min-h-[100px] mb-4"
            />
            <Button onClick={handleSaveNotes} disabled={updateMut.isPending}>Save Notes</Button>
          </CardContent>
        </Card>
      </div>
      {marketplace.isLoading && <p role="status" className="rounded-md border p-3 text-sm text-muted-foreground">Checking rental exception feature availability…</p>}
      {marketplace.isError && <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">Platform exception tools are unavailable because rollout status could not be checked.</p>}
      {marketplace.data?.enabled && res.source === "marketplace_request" && <RentalExceptionsPanel reservationId={id} scope="admin" operatorContact={tripQuery.data?.operatorContact ?? res.operatorContact} />}
    </div>
  );
}
