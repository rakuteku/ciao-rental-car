import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import {
  useRentalExceptionAction,
  useRentalExceptionAlternatives,
  useRentalExceptionCancellationOffers,
  useRentalExceptionExtensionStatus,
  useRentalExceptions,
  usePartnerRentalExceptionExtensions,
  useUploadRentalExceptionEvidence,
  type RentalExceptionScope,
} from "@/hooks/use-rental-operations";

type Contact = { name?: string; email?: string; phone?: string } | null | undefined;
type ExceptionData = {
  incidents?: Record<string, any>[];
  timeline?: Record<string, any>[];
  claims?: Record<string, any>[];
  evidence?: Record<string, any>[];
};

const textField = "min-h-10 w-full rounded-md border bg-background px-3 py-2 text-sm";
const textArea = `${textField} min-h-20`;

function contactValue(contact: Contact, field: "email" | "phone") {
  const value = contact?.[field];
  return value ? field === "email"
    ? <a data-testid="link-rental-operator-email" className="underline" href={`mailto:${value}`}>{value}</a>
    : <a data-testid="link-rental-operator-phone" className="underline" href={`tel:${value}`}>{value}</a>
    : null;
}

function EmergencyGuidance({ contact }: { contact: Contact }) {
  return <aside className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950" data-testid="panel-emergency-guidance">
    <h3 className="flex items-center gap-2 font-semibold"><ShieldAlert className="h-5 w-5" /> Safety first</h3>
    <p className="mt-2 text-sm">If anyone is in immediate danger or there is a road accident, move to safety and call Japanese emergency services: <strong>110 for police</strong> or <strong>119 for ambulance / fire</strong>. Do not wait for an in-app response.</p>
    <div className="mt-3 border-t border-amber-200 pt-3 text-sm">
      <p className="font-semibold">Your rental operator</p>
      {contact?.name && <p>{contact.name}</p>}
      {contactValue(contact, "phone") && <p>Phone: {contactValue(contact, "phone")}</p>}
      {contactValue(contact, "email") && <p>Email: {contactValue(contact, "email")}</p>}
      {!contact?.name && !contact?.phone && !contact?.email && <p role="status" className="mt-1">Operator contact details are not available in this booking record. Use the booking confirmation to contact the operator.</p>}
    </div>
  </aside>;
}

function policyText(snapshot: unknown) {
  if (snapshot == null) return null;
  return typeof snapshot === "string" ? snapshot : JSON.stringify(snapshot, null, 2);
}

export function RentalExceptionsPanel({ reservationId, scope, operatorContact, reservationStatus }: {
  reservationId: number;
  scope: RentalExceptionScope;
  operatorContact?: Contact;
  reservationStatus?: string;
}) {
  const customer = scope === "customer";
  const query = useRentalExceptions(reservationId, scope);
  const alternativesQuery = useRentalExceptionAlternatives(reservationId, scope === "admin" ? "customer" : scope, scope !== "admin");
  const cancellationOffersQuery = useRentalExceptionCancellationOffers(reservationId, customer);
  const partnerExtensionsQuery = usePartnerRentalExceptionExtensions(reservationId, scope === "partner");
  const action = useRentalExceptionAction();
  const uploadEvidence = useUploadRentalExceptionEvidence();
  const [cancelQuote, setCancelQuote] = useState<Record<string, any> | null>(null);
  const [cancelConsent, setCancelConsent] = useState(false);
  const [customerCancellationReason, setCustomerCancellationReason] = useState<"customer" | "no_show" | "weather">("customer");
  const [cancellationOfferCheckoutUrls, setCancellationOfferCheckoutUrls] = useState<Record<string, string>>({});
  const [cancellationOfferAlternativeQuoteIds, setCancellationOfferAlternativeQuoteIds] = useState<Record<string, number>>({});
  const [cancellationOfferResults, setCancellationOfferResults] = useState<Record<string, Record<string, any>>>({});
  const [cancellationOfferSnapshots, setCancellationOfferSnapshots] = useState<Record<string, Record<string, any>>>({});
  const [cancellationOfferVerification, setCancellationOfferVerification] = useState<Record<string, Record<string, any>>>({});
  const [extensionReturnAt, setExtensionReturnAt] = useState("");
  const [extensionQuote, setExtensionQuote] = useState<Record<string, any> | null>(null);
  const [extensionConsent, setExtensionConsent] = useState(false);
  const [extensionRequoteRequired, setExtensionRequoteRequired] = useState(false);
  const [partnerExtensionRequoteRequired, setPartnerExtensionRequoteRequired] = useState<Record<string, boolean>>({});
  const [checkoutUrl, setCheckoutUrl] = useState("");
  const [extensionPaymentStatus, setExtensionPaymentStatus] = useState("");
  const [incidentCategory, setIncidentCategory] = useState("");
  const [incidentSeverity, setIncidentSeverity] = useState("medium");
  const [incidentDescription, setIncidentDescription] = useState("");
  const [unsafeVehicle, setUnsafeVehicle] = useState(false);
  const [incidentOccurredAt, setIncidentOccurredAt] = useState("");
  const [incidentExtras, setIncidentExtras] = useState({
    location: "",
    peopleRole: "",
    peopleName: "",
    peopleContact: "",
    policeReported: false,
    policeReference: "",
    roadsideDetails: "",
    insurerReference: "",
    towDetails: "",
    replacementVehicleDetails: "",
    downtimeStart: "",
    downtimeEnd: "",
    nextBookingImpact: "",
    customerUpdate: "",
  });
  const [claimResponses, setClaimResponses] = useState<Record<string, string>>({});
  const [disputedItems, setDisputedItems] = useState<Record<string, string>>({});
  const [selectedEvidenceFiles, setSelectedEvidenceFiles] = useState<Record<string, File | null>>({});
  const [claimDraft, setClaimDraft] = useState({ incidentId: "", invoiceReference: "", insurerOutcome: "" });
  const [claimItemDrafts, setClaimItemDrafts] = useState<Record<string, { category: string; description: string; amount: string }>>({});
  const [claimDetailsDrafts, setClaimDetailsDrafts] = useState<Record<string, { invoiceReference: string; insurerOutcome: string }>>({});
  const [claimDecision, setClaimDecision] = useState<Record<string, { notes: string; insurerOutcome: string }>>({});
  const [incidentResolutions, setIncidentResolutions] = useState<Record<string, string>>({});
  const [operatorAlternativeVehicleId, setOperatorAlternativeVehicleId] = useState("");
  const [operatorAlternativeQuote, setOperatorAlternativeQuote] = useState<Record<string, any> | null>(null);
  const [cancellationQuoteId, setCancellationQuoteId] = useState("");
  const [operatorRefundAmount, setOperatorRefundAmount] = useState("");
  const [operatorDecisionNote, setOperatorDecisionNote] = useState("");
  const [operatorCancellationReason, setOperatorCancellationReason] = useState<"operator" | "no_show" | "weather">("operator");
  const [operatorCancellationVehicleId, setOperatorCancellationVehicleId] = useState("");
  const [operatorCancellationOffer, setOperatorCancellationOffer] = useState<Record<string, any> | null>(null);
  const [operatorCancellationResolution, setOperatorCancellationResolution] = useState<Record<string, any> | null>(null);
  const [alternativeCheckoutUrls, setAlternativeCheckoutUrls] = useState<Record<string, string>>({});
  const [alternativePaymentStatuses, setAlternativePaymentStatuses] = useState<Record<string, string>>({});
  const [alternativeAcceptedStatuses, setAlternativeAcceptedStatuses] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const extensionApprovalQuery = useRentalExceptionExtensionStatus(
    reservationId,
    Number(extensionQuote?.quoteId ?? 0),
    customer && Boolean(extensionQuote),
  );

  if (query.isLoading) return <section className="rounded-xl border bg-card p-5" role="status">Loading rental exception history…</section>;
  if (query.isError) return <section className="space-y-3 rounded-xl border border-destructive/30 bg-card p-5" role="alert">
    <h2 className="font-semibold">Rental exception history unavailable</h2>
    <p className="text-sm text-destructive">{query.error instanceof Error ? query.error.message : "Could not load exception details."}</p>
    <button type="button" data-testid={`button-retry-exceptions-${reservationId}`} onClick={() => void query.refetch()} className="min-h-10 rounded-md border px-4 text-sm">Retry</button>
  </section>;

  const data = (query.data ?? {}) as ExceptionData;
  const incidents = Array.isArray(data.incidents) ? data.incidents : [];
  const timeline = Array.isArray(data.timeline) ? data.timeline : [];
  const claims = Array.isArray(data.claims) ? data.claims : [];
  const evidence = Array.isArray(data.evidence) ? data.evidence : [];
  const visibleCancellationOffers = Array.isArray(cancellationOffersQuery.data)
    ? [...cancellationOffersQuery.data as Record<string, any>[]]
    : [];
  Object.entries(cancellationOfferResults).forEach(([quoteId, result]) => {
    if (!visibleCancellationOffers.some(offer => String(offer.quoteId) === quoteId) && cancellationOfferSnapshots[quoteId]) {
      visibleCancellationOffers.push({ ...cancellationOfferSnapshots[quoteId], selectedChoice: result.choice });
    }
  });
  const canCancel = !reservationStatus || ["pending_payment", "confirmed", "awaiting_pickup", "vehicle_dispatched"].includes(reservationStatus);
  const runAction = (
    url: string,
    payload: Record<string, unknown>,
    onSuccess: (result: any) => void = () => {},
    method: "POST" | "PATCH" = "POST",
    onError?: (failure: Error & { requoteRequired?: boolean; approvalStatus?: string }) => void,
  ) => {
    setError("");
    action.mutate({ reservationId, scope, url, method, data: payload }, {
      onSuccess: result => { onSuccess(result); void query.refetch(); },
      onError: failure => { setError(failure.message); onError?.(failure); },
    });
  };
  const customerPath = (path: string) => `/rental/exceptions/reservations/${reservationId}/${path}`;
  const evidenceUploader = (
    key: string,
    evidenceKind: "incident" | "invoice" | "insurer" | "customer_response",
    refs: { incidentId?: number; claimId?: number; claimItemId?: number } = {},
  ) => <div className="space-y-2 rounded-md bg-muted/40 p-3">
    <label className="block space-y-1 text-sm">Private evidence (PDF, JPEG, or PNG; up to 10 MB)
      <input key={selectedEvidenceFiles[key]?.name ?? "empty"} data-testid={`input-exception-evidence-${key}`} type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" className={textField} onChange={event => setSelectedEvidenceFiles(current => ({ ...current, [key]: event.target.files?.[0] ?? null }))} />
    </label>
    <button type="button" data-testid={`button-upload-exception-evidence-${key}`} disabled={!selectedEvidenceFiles[key] || uploadEvidence.isPending} onClick={() => {
      const file = selectedEvidenceFiles[key];
      if (!file) return;
      setError("");
      uploadEvidence.mutate({ reservationId, scope, file, evidenceKind, ...refs }, {
        onSuccess: () => {
          setSelectedEvidenceFiles(current => ({ ...current, [key]: null }));
          void query.refetch();
        },
        onError: (failure: Error) => setError(failure.message),
      });
    }} className="min-h-9 rounded-md border px-3 text-sm disabled:opacity-50">{uploadEvidence.isPending ? "Uploading…" : "Upload private evidence"}</button>
  </div>;
  const money = (value: unknown) => value == null ? "—" : `¥${Number(value).toLocaleString()}`;
  const cancellationConsentValid = cancelConsent && Boolean(cancelQuote?.quoteId);
  const extensionConsentValid = extensionConsent && Boolean(extensionQuote?.quoteId);
  const extensionApproval = extensionApprovalQuery.data as Record<string, any> | undefined;
  const extensionApprovalShapeValid = Boolean(
    extensionQuote && extensionApproval &&
    Number(extensionApproval.quoteId) === Number(extensionQuote.quoteId) &&
    typeof extensionQuote.quoteVersion === "string" && extensionQuote.quoteVersion.length > 0 &&
    extensionApproval.quoteVersion === extensionQuote.quoteVersion &&
    ["pending", "approved", "stale"].includes(extensionApproval.approvalStatus) &&
    typeof extensionApproval.status === "string" &&
    typeof extensionApproval.expiresAt === "string" &&
    Number.isFinite(Date.parse(extensionApproval.expiresAt)),
  );
  const extensionQuoteExpired = Boolean(
    extensionApprovalShapeValid && extensionApproval &&
    Date.parse(extensionApproval.expiresAt) <= Date.now(),
  );
  const extensionApprovalReady = Boolean(
    extensionApprovalShapeValid && extensionApproval?.approvalStatus === "approved" &&
    extensionApproval.status === "quoted" && !extensionQuoteExpired,
  );
  const extensionNeedsRequote = extensionRequoteRequired || Boolean(
    extensionApprovalShapeValid && (extensionApproval?.approvalStatus === "stale" || extensionQuoteExpired),
  ) || Boolean(extensionApprovalQuery.isSuccess && !extensionApprovalShapeValid);
  const invalidIncidentDetails = Boolean(
    incidentExtras.downtimeStart && incidentExtras.downtimeEnd &&
    new Date(incidentExtras.downtimeEnd) < new Date(incidentExtras.downtimeStart),
  ) || Boolean(
    (incidentExtras.peopleName.trim() || incidentExtras.peopleContact.trim()) && !incidentExtras.peopleRole.trim(),
  );

  return <section data-testid={`section-rental-exceptions-${scope}-${reservationId}`} className="space-y-5 rounded-xl border bg-card p-5 shadow-sm">
    <div>
      <p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">Rental support</p>
      <h2 className="mt-1 text-xl font-semibold">Changes, safety & claims</h2>
      <p className="mt-1 text-sm text-muted-foreground">Track requests and report safety incidents. Emergency services should be contacted directly.</p>
    </div>
    {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
    <EmergencyGuidance contact={operatorContact} />

    {customer && <div className="grid gap-4 lg:grid-cols-2">
      {canCancel && <article className="space-y-3 rounded-lg border p-4">
        <div><h3 className="font-semibold">Cancellation quote & confirmation</h3><p className="text-sm text-muted-foreground">Choose the reason, review the exact saved-policy quote, and explicitly consent before submitting.</p></div>
        {!cancelQuote && <>
          <label className="block space-y-1 text-sm">Cancellation reason<select data-testid="select-cancellation-reason" className={textField} value={customerCancellationReason} onChange={event => setCustomerCancellationReason(event.target.value as typeof customerCancellationReason)}><option value="customer">Customer requested cancellation</option><option value="no_show">Customer no-show</option><option value="weather">Unsafe / impractical weather</option></select></label>
          <button type="button" data-testid="button-request-cancellation-quote" disabled={action.isPending} onClick={() => runAction(customerPath("cancellation/quote"), { reason: customerCancellationReason }, result => { setCancelQuote(result); setCancelConsent(false); })} className="min-h-10 rounded-md border px-4 text-sm font-medium disabled:opacity-50">{action.isPending ? "Requesting quote…" : "Get cancellation quote"}</button>
        </>}
        {cancelQuote && <div className="space-y-3 rounded-md bg-muted/50 p-3" data-testid="panel-cancellation-quote">
          <p className="font-medium">Cancellation quote</p>
          {cancelQuote.reasonText && <p><strong>Reason:</strong> {cancelQuote.reasonText}</p>}
          {cancelQuote.policyReason && <p className="text-sm">{cancelQuote.policyReason}</p>}
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt>Refundable amount</dt><dd className="text-right font-semibold">{money(cancelQuote.refundableAmount)}</dd>
            <dt>Retained amount</dt><dd className="text-right font-semibold">{money(cancelQuote.retainedAmount)}</dd>
          </dl>
          {cancelQuote.manualReviewRequired && <p className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-950">This quote requires operator review; the final refund will be determined by the operator.</p>}
          {cancelQuote.policySnapshot != null && <details className="text-sm"><summary className="cursor-pointer font-medium">Cancellation policy snapshot</summary><pre className="mt-2 whitespace-pre-wrap rounded bg-background p-2 text-xs">{policyText(cancelQuote.policySnapshot)}</pre></details>}
          {cancelQuote.expiresAt && <p className="text-xs text-muted-foreground">Quote expires {new Date(cancelQuote.expiresAt).toLocaleString()}</p>}
          <label className="flex items-start gap-2 text-sm"><input data-testid="check-cancellation-consent" type="checkbox" className="mt-1" checked={cancelConsent} onChange={event => setCancelConsent(event.target.checked)} /><span>I have reviewed the reason, refundable amount, retained amount, and policy and explicitly accept this cancellation quote.</span></label>
          {!cancelQuote.confirmation && <button type="button" data-testid="button-confirm-cancellation" disabled={!cancellationConsentValid || action.isPending} onClick={() => runAction(customerPath("cancellation/confirm"), { quoteId: cancelQuote.quoteId, accepted: true }, result => { setCancelConsent(false); setCancelQuote({ ...cancelQuote, confirmation: result }); })} className="min-h-10 rounded-md bg-destructive px-4 text-sm font-semibold text-destructive-foreground disabled:opacity-50">{action.isPending ? "Submitting…" : "Confirm cancellation"}</button>}
          {cancelQuote.confirmation && <p data-testid="status-cancellation-confirmation" role="status" className="text-sm">
            {cancelQuote.confirmation.status === "operator_review"
              ? "Your cancellation was accepted for operator review. No refund has been confirmed."
              : cancelQuote.confirmation.refundStatus === "succeeded"
                ? `Refund confirmed: ${money(cancelQuote.confirmation.refundAmount)}`
                : cancelQuote.confirmation.refundStatus === "not_required"
                  ? "Cancellation confirmed; no refund was due."
                  : `Cancellation accepted, but refund completion is not confirmed${cancelQuote.confirmation.refundStatus ? ` (provider status: ${cancelQuote.confirmation.refundStatus})` : ""}.`}
            {cancelQuote.confirmation.refundAmount != null && cancelQuote.confirmation.refundStatus !== "succeeded" ? ` Quoted refund: ${money(cancelQuote.confirmation.refundAmount)}.` : ""} Reference quote #{cancelQuote.quoteId}.
          </p>}
        </div>}
      </article>}

      <article className="space-y-3 rounded-lg border p-4">
        <h3 className="font-semibold">Operator cancellation offers</h3>
        <p className="text-sm text-muted-foreground">Choose exactly one offered outcome. A refund is not complete until its provider status is confirmed as succeeded.</p>
        {cancellationOffersQuery.isLoading ? <p role="status" className="text-sm text-muted-foreground">Checking for operator offers…</p>
          : cancellationOffersQuery.isError ? <div role="alert" className="space-y-2 text-sm text-destructive"><p>{cancellationOffersQuery.error instanceof Error ? cancellationOffersQuery.error.message : "Could not load cancellation offers."}</p><button type="button" data-testid="button-retry-cancellation-offers" onClick={() => void cancellationOffersQuery.refetch()} className="rounded border px-3 py-2 text-foreground">Retry</button></div>
            : !Array.isArray(cancellationOffersQuery.data) ? <p role="alert" className="text-sm text-destructive">Cancellation offer response was not valid. No choice can be submitted until offers load correctly.</p>
              : visibleCancellationOffers.length === 0 ? <p className="text-sm text-muted-foreground">There are no active operator cancellation offers.</p>
                : visibleCancellationOffers.map((offer: any) => {
                  const quoteId = String(offer.quoteId);
                  const offerResult = cancellationOfferResults[quoteId];
                  const alternativeQuoteId = cancellationOfferAlternativeQuoteIds[quoteId] ?? Number(offer.alternativeQuoteId);
                  const selectedChoice = offer.selectedChoice ?? (offerResult?.choice ?? null);
                  const offerIsValid = Number.isSafeInteger(Number(offer.quoteId)) && Number(offer.quoteId) > 0
                    && Number.isFinite(offer.fullRefundAmount) && typeof offer.reasonText === "string"
                    && typeof offer.policyReason === "string" && typeof offer.alternativeVehicleName === "string"
                    && Number.isSafeInteger(Number(offer.alternativeQuoteId)) && Number(offer.alternativeQuoteId) > 0
                    && Number.isFinite(offer.alternativeAdditionalAmount) && typeof offer.expiresAt === "string"
                    && Number.isFinite(Date.parse(offer.expiresAt)) && offer.customerConsentRequired === true
                    && [null, "alternative", "full_refund"].includes(offer.selectedChoice ?? null);
                  if (!offerIsValid) return <div key={quoteId} role="alert" data-testid={`invalid-operator-cancellation-offer-${quoteId}`} className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">This cancellation offer has incomplete or invalid details. Do not accept it; contact the operator.</div>;
                  return <div key={quoteId} data-testid={`operator-cancellation-offer-${quoteId}`} className="space-y-3 rounded-md border p-3 text-sm">
                    <p className="font-semibold">{offer.reasonText || "Operator cancellation offer"}</p>
                    {offer.policyReason && <p>{offer.policyReason}</p>}
                    <dl className="grid grid-cols-2 gap-2">
                      <dt>Full refund offered</dt><dd className="text-right font-semibold">{money(offer.fullRefundAmount)}</dd>
                      <dt>Alternative vehicle</dt><dd className="text-right">{offer.alternativeVehicleName || "Unavailable"}</dd>
                      <dt>Additional amount</dt><dd className="text-right">{money(offer.alternativeAdditionalAmount)}</dd>
                    </dl>
                    {offer.policySnapshot && <details><summary className="cursor-pointer font-medium">Offer terms</summary><pre className="mt-2 whitespace-pre-wrap rounded bg-muted p-2 text-xs">{policyText(offer.policySnapshot)}</pre></details>}
                    <p className="text-xs text-muted-foreground">Offer expires {offer.expiresAt ? new Date(offer.expiresAt).toLocaleString() : "at an unspecified time"}.</p>
                    {selectedChoice ? <p role="status" className="rounded bg-muted p-2">You selected {selectedChoice === "full_refund" ? "the full refund" : "the alternate vehicle"}. No other choice can be made for this offer.</p> : <>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" data-testid={`button-accept-full-refund-${quoteId}`} disabled={action.isPending} onClick={() => runAction(customerPath("cancellation/confirm"), { quoteId: Number(quoteId), accepted: true, choice: "full_refund" }, result => {
                          setCancellationOfferSnapshots(current => ({ ...current, [quoteId]: offer }));
                          setCancellationOfferResults(current => ({ ...current, [quoteId]: { ...result, choice: "full_refund" } }));
                        })} className="min-h-10 rounded-md bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50">Accept full refund</button>
                        <button type="button" data-testid={`button-accept-cancellation-alternative-${quoteId}`} disabled={action.isPending || !Number.isInteger(alternativeQuoteId) || alternativeQuoteId < 1} onClick={() => runAction(customerPath("cancellation/accept-alternative"), { quoteId: Number(quoteId), accepted: true }, result => {
                          const checkout = typeof result?.checkoutUrl === "string" ? result.checkoutUrl : "";
                          setCancellationOfferSnapshots(current => ({ ...current, [quoteId]: offer }));
                          setCancellationOfferResults(current => ({ ...current, [quoteId]: { ...result, choice: "alternative" } }));
                          setCancellationOfferAlternativeQuoteIds(current => ({ ...current, [quoteId]: Number(result?.quoteId) || alternativeQuoteId }));
                          if (checkout) setCancellationOfferCheckoutUrls(current => ({ ...current, [quoteId]: checkout }));
                        })} className="min-h-10 rounded-md border px-4 font-medium disabled:opacity-50">Accept alternate vehicle</button>
                      </div>
                    </>}
                    {selectedChoice === "alternative" && !cancellationOfferCheckoutUrls[quoteId] && !offerResult && <p role="alert" className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-950">The alternate-vehicle choice is already recorded, but this offer list does not include a recoverable checkout URL. Payment and vehicle substitution are not confirmed here; contact the operator if checkout was not completed.</p>}
                    {cancellationOfferCheckoutUrls[quoteId] && <div className="space-y-2 rounded border bg-background p-3">
                      <p>Checkout is ready. Payment and vehicle substitution are not confirmed until server verification succeeds.</p>
                      <a data-testid={`link-cancellation-alternative-checkout-${quoteId}`} href={cancellationOfferCheckoutUrls[quoteId]} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center rounded-md bg-primary px-3 font-medium text-primary-foreground">Open secure checkout</a>
                      <button type="button" data-testid={`button-verify-cancellation-alternative-${quoteId}`} disabled={action.isPending || !Number.isInteger(alternativeQuoteId) || alternativeQuoteId < 1} onClick={() => runAction(customerPath("alternatives/verify-payment"), { quoteId: alternativeQuoteId }, result => setCancellationOfferVerification(current => ({ ...current, [quoteId]: result ?? {} })))} className="ml-2 min-h-9 rounded-md border px-3">Verify payment and alternative</button>
                    </div>}
                    {offerResult && offerResult.choice === "full_refund" && <p role="status" className="rounded bg-muted p-2">
                      {offerResult.refundStatus === "succeeded"
                        ? `Full refund confirmed: ${money(offerResult.refundAmount)}.`
                        : `Full refund was accepted but is not confirmed complete${offerResult.refundStatus ? ` (provider status: ${offerResult.refundStatus})` : ""}.`}
                    </p>}
                    {offerResult && offerResult.choice === "alternative" && !cancellationOfferCheckoutUrls[quoteId] && <p role="status" className="rounded bg-muted p-2">
                      {offerResult.status === "applied" && offerResult.reservationId
                        ? "Alternate vehicle applied by the server; no additional payment was due."
                        : "Alternate-vehicle acceptance was recorded; application/payment status is not yet confirmed."}
                    </p>}
                    {cancellationOfferVerification[quoteId] && <p role="status" className="rounded bg-muted p-2">
                      {cancellationOfferVerification[quoteId].status === "applied" && cancellationOfferVerification[quoteId].applied === true
                        ? "Payment verified and alternate vehicle applied."
                        : cancellationOfferVerification[quoteId].status === "refunded"
                          ? "Payment could not be applied; the payment provider confirmed the refund."
                          : cancellationOfferVerification[quoteId].status === "refund_pending"
                            ? "Payment could not be applied; a refund is pending provider confirmation."
                          : `Verification response: ${cancellationOfferVerification[quoteId].status ?? "status unavailable"}. Vehicle substitution is not confirmed.`}
                    </p>}
                  </div>;
                })}
      </article>

      <article className="space-y-3 rounded-lg border p-4">
        <div><h3 className="font-semibold">Request a rental extension</h3><p className="text-sm text-muted-foreground">The operator must approve this exact quote version before checkout becomes available.</p></div>
        {extensionRequoteRequired && <p role="alert" data-testid="status-extension-requote-required" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">This extension quote changed or became unavailable. Request a fresh quote; checkout remains disabled.</p>}
        {!extensionQuote && <>
          <label className="block space-y-1 text-sm">Requested new return time<input data-testid="input-extension-return-time" type="datetime-local" className={textField} value={extensionReturnAt} onChange={event => setExtensionReturnAt(event.target.value)} /></label>
          <button type="button" data-testid="button-extension-quote" disabled={action.isPending || !extensionReturnAt} onClick={() => runAction(customerPath("extension/quote"), { returnAt: new Date(extensionReturnAt).toISOString() }, result => {
            setExtensionRequoteRequired(false);
            setExtensionQuote(result);
            setExtensionConsent(false);
            setCheckoutUrl("");
            setExtensionPaymentStatus("");
          })} className="min-h-10 rounded-md border px-4 text-sm font-medium disabled:opacity-50">{action.isPending ? "Requesting quote…" : extensionRequoteRequired ? "Request fresh extension quote" : "Get extension quote"}</button>
        </>}
        {extensionQuote && <div className="space-y-3 rounded-md bg-muted/50 p-3" data-testid="panel-extension-quote">
          <p className="font-medium">Extension quote</p>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt>Current return</dt><dd className="text-right">{extensionQuote.oldReturnAt ? new Date(extensionQuote.oldReturnAt).toLocaleString() : "—"}</dd>
            <dt>New return</dt><dd className="text-right">{extensionQuote.newReturnAt ? new Date(extensionQuote.newReturnAt).toLocaleString() : "—"}</dd>
            <dt>Additional amount</dt><dd className="text-right font-semibold">{money(extensionQuote.additionalAmount)}</dd>
          </dl>
          {extensionQuote.policySnapshot != null && <details className="text-sm"><summary className="cursor-pointer font-medium">Extension policy snapshot</summary><pre className="mt-2 whitespace-pre-wrap rounded bg-background p-2 text-xs">{policyText(extensionQuote.policySnapshot)}</pre></details>}
          {extensionQuote.expiresAt && <p className="text-xs text-muted-foreground">Quote expires {new Date(extensionQuote.expiresAt).toLocaleString()}</p>}
          {extensionApprovalQuery.isLoading && <p role="status" className="text-sm">Checking operator approval…</p>}
          {extensionApprovalQuery.isError && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{extensionApprovalQuery.error instanceof Error ? extensionApprovalQuery.error.message : "Could not verify operator approval."} Checkout is disabled.</p><button type="button" data-testid="button-retry-extension-approval" onClick={() => void extensionApprovalQuery.refetch()} className="min-h-9 rounded-md border px-3">Refresh approval status</button></div>}
          {!extensionApprovalQuery.isLoading && !extensionApprovalQuery.isError && !extensionApprovalShapeValid && <p role="alert" className="text-sm text-destructive">Operator approval response is incomplete or does not match this quote version. Checkout is disabled; refresh status or request a fresh quote.</p>}
          {extensionApprovalShapeValid && extensionApproval?.approvalStatus === "pending" && <p role="status" data-testid="status-extension-approval-pending" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">Waiting for operator approval of quote version {extensionQuote.quoteVersion}. This status refreshes automatically.</p>}
          {extensionApprovalShapeValid && extensionApproval?.approvalStatus === "approved" && extensionApprovalReady && <p role="status" data-testid="status-extension-approved" className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-950">Operator approved quote version {extensionApproval.quoteVersion}. Approved until {new Date(extensionApproval.expiresAt).toLocaleString()}.</p>}
          {extensionNeedsRequote && extensionQuote && <div className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            <p>Approval is stale or the quote expired. Checkout is disabled.</p>
            <button type="button" data-testid="button-reset-extension-quote" onClick={() => { setExtensionQuote(null); setExtensionConsent(false); setCheckoutUrl(""); setExtensionPaymentStatus(""); }} className="min-h-9 rounded-md border border-amber-700 px-3">Request a fresh quote</button>
          </div>}
          <button type="button" data-testid="button-refresh-extension-approval" disabled={extensionApprovalQuery.isFetching} onClick={() => void extensionApprovalQuery.refetch()} className="min-h-9 rounded-md border px-3 text-sm">{extensionApprovalQuery.isFetching ? "Refreshing…" : "Refresh approval status"}</button>
          {!checkoutUrl && !extensionPaymentStatus && !extensionNeedsRequote && <label className="flex items-start gap-2 text-sm"><input data-testid="check-extension-consent" type="checkbox" className="mt-1" checked={extensionConsent} onChange={event => setExtensionConsent(event.target.checked)} /><span>I reviewed the additional amount and extension policy and explicitly accept these terms.</span></label>}
          {!checkoutUrl && !extensionPaymentStatus && !extensionNeedsRequote && <button type="button" data-testid="button-extension-checkout" disabled={!extensionConsentValid || !extensionApprovalReady || action.isPending} onClick={() => runAction(customerPath("extension/checkout"), { quoteId: extensionQuote.quoteId, accepted: true }, result => {
            const url = typeof result?.checkoutUrl === "string" ? result.checkoutUrl : "";
            if (url) {
              const validCheckout = Number(result?.quoteId) === Number(extensionQuote.quoteId)
                && result?.quoteVersion === extensionQuote.quoteVersion
                && result?.approvalStatus === "approved"
                && typeof result?.expiresAt === "string" && Number.isFinite(Date.parse(result.expiresAt));
              if (!validCheckout) {
                setError("Checkout response did not match this approved extension quote; no checkout link was opened.");
                return;
              }
              setCheckoutUrl(url);
            } else if (result?.status === "applied" && Number(result?.reservationId) === reservationId) {
              setExtensionPaymentStatus("Extension applied by the server; no additional payment was due.");
            } else {
              setExtensionPaymentStatus("Checkout response did not confirm that the extension was applied. Verify the quote status or contact support.");
            }
          }, "POST", failure => {
            if (failure.requoteRequired) {
              setExtensionRequoteRequired(true);
              setExtensionQuote(null);
              setExtensionConsent(false);
              setCheckoutUrl("");
              setExtensionPaymentStatus("");
            } else if (failure.approvalStatus === "pending") {
              void extensionApprovalQuery.refetch();
            }
          })} className="min-h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{action.isPending ? "Preparing checkout…" : extensionApprovalReady ? "Continue to checkout" : "Waiting for operator approval"}</button>}
          {checkoutUrl && <div className="space-y-2 rounded-md border bg-background p-3 text-sm">
            <p>Checkout is ready. Complete payment, then verify the exact quote with the server.</p>
            <a data-testid="link-extension-checkout" href={checkoutUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 font-semibold text-primary-foreground">Open secure checkout</a>
            <button type="button" data-testid="button-verify-extension-payment" disabled={action.isPending} onClick={() => runAction(customerPath("extension/verify-payment"), { quoteId: extensionQuote.quoteId }, result => {
              setExtensionPaymentStatus(result?.status === "applied" && result?.applied === true
                ? "Payment verified and extension applied."
                : result?.status === "refunded"
                  ? "Payment was verified but the extension could not be applied; provider refund confirmed."
                  : result?.status === "refund_pending"
                    ? "Payment was verified but the extension could not be applied; refund confirmation is pending."
                    : `Payment verification returned ${result?.status ?? "an unknown status"}; extension application is not confirmed.`);
            })} className="min-h-10 rounded-md border px-4">Verify payment status</button>
          </div>}
          {extensionPaymentStatus && <p data-testid="status-extension-payment" role="status">Payment: {extensionPaymentStatus}</p>}
        </div>}
      </article>
      <article className="space-y-3 rounded-lg border p-4">
        <div><h3 className="font-semibold">Alternative vehicles</h3><p className="text-sm text-muted-foreground">Review and accept an operator-proposed replacement vehicle.</p></div>
        {alternativesQuery.isLoading ? <p role="status" className="text-sm text-muted-foreground">Loading available offers…</p>
          : alternativesQuery.isError ? <div role="alert" className="space-y-2 text-sm text-destructive"><p>{alternativesQuery.error instanceof Error ? alternativesQuery.error.message : "Could not load alternatives."}</p><button type="button" onClick={() => void alternativesQuery.refetch()} className="rounded border px-3 py-2 text-foreground">Retry</button></div>
            : Array.isArray(alternativesQuery.data) && alternativesQuery.data.length ? alternativesQuery.data.map((offer: any) => {
              const quoteId = String(offer.quoteId);
              return <div key={quoteId} data-testid={`alternative-offer-${quoteId}`} className="space-y-2 rounded-md border p-3 text-sm">
                <p className="font-semibold">{offer.vehicleName} · Total {money(offer.total)}{Number(offer.additionalAmount) ? ` · Additional ${money(offer.additionalAmount)}` : ""}</p>
                {offer.expiresAt && <p className="text-xs text-muted-foreground">Offer expires {new Date(offer.expiresAt).toLocaleString()}</p>}
                {offer.policySnapshot && <details><summary className="cursor-pointer font-medium">Offer terms</summary><pre className="mt-2 whitespace-pre-wrap rounded bg-muted p-2 text-xs">{policyText(offer.policySnapshot)}</pre></details>}
                {!alternativeCheckoutUrls[quoteId] && !alternativeAcceptedStatuses[quoteId] && <button type="button" data-testid={`button-accept-alternative-${quoteId}`} disabled={action.isPending} onClick={() => runAction(customerPath("alternatives/accept"), { quoteId: Number(quoteId), accepted: true }, result => {
                  const checkout = String(result?.checkoutUrl ?? "");
                  if (checkout) setAlternativeCheckoutUrls(current => ({ ...current, [quoteId]: checkout }));
                  else setAlternativeAcceptedStatuses(current => ({ ...current, [quoteId]: String(result?.status ?? "applied") }));
                })} className="min-h-9 rounded-md bg-primary px-3 font-medium text-primary-foreground disabled:opacity-50">Accept alternative</button>}
                {alternativeCheckoutUrls[quoteId] && <div className="space-y-2">
                  <a data-testid={`link-alternative-checkout-${quoteId}`} href={alternativeCheckoutUrls[quoteId]} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center rounded-md bg-primary px-3 font-medium text-primary-foreground">Open secure checkout</a>
                  <button type="button" data-testid={`button-verify-alternative-${quoteId}`} disabled={action.isPending} onClick={() => runAction(customerPath("alternatives/verify-payment"), { quoteId: Number(quoteId) }, result => setAlternativePaymentStatuses(current => ({ ...current, [quoteId]: String(result?.status ?? result?.paymentStatus ?? "Verified") })))} className="ml-2 min-h-9 rounded-md border px-3">Verify payment</button>
                </div>}
                {(alternativeAcceptedStatuses[quoteId] || alternativePaymentStatuses[quoteId]) && <p role="status">Alternative status: {alternativePaymentStatuses[quoteId] ?? alternativeAcceptedStatuses[quoteId]}</p>}
              </div>;
            }) : <p className="text-sm text-muted-foreground">No alternative vehicle offers are available for this reservation.</p>}
      </article>
    </div>}

    {(customer || scope === "partner") && <div className="grid gap-4 lg:grid-cols-2">
      <article className="space-y-3 rounded-lg border p-4">
        <h3 className="font-semibold">Report a safety incident</h3>
        <p className="text-sm text-muted-foreground">For emergencies, call 110 or 119 first. Report only after reaching safety.</p>
        <label className="block space-y-1 text-sm">Category<input data-testid="input-incident-category" className={textField} value={incidentCategory} onChange={event => setIncidentCategory(event.target.value)} required /></label>
        <label className="block space-y-1 text-sm">Severity<select data-testid="input-incident-severity" className={textField} value={incidentSeverity} onChange={event => setIncidentSeverity(event.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
        <textarea data-testid="input-incident-description" className={textArea} value={incidentDescription} onChange={event => setIncidentDescription(event.target.value)} placeholder="Describe what happened" />
        <label className="flex items-center gap-2 text-sm"><input data-testid="check-incident-unsafe-vehicle" type="checkbox" checked={unsafeVehicle} onChange={event => setUnsafeVehicle(event.target.checked)} />Vehicle may be unsafe to drive</label>
        <label className="block space-y-1 text-sm">Occurred at (optional)<input data-testid="input-incident-occurred-at" type="datetime-local" className={textField} value={incidentOccurredAt} onChange={event => setIncidentOccurredAt(event.target.value)} /></label>
        <details className="rounded-md border p-3 text-sm">
          <summary className="cursor-pointer font-medium">Additional incident details</summary>
          <div className="mt-3 grid gap-3">
            <label className="space-y-1">Location<input data-testid="input-incident-location" className={textField} value={incidentExtras.location} onChange={event => setIncidentExtras(current => ({ ...current, location: event.target.value }))} /></label>
            <fieldset className="space-y-2 rounded border p-3"><legend className="px-1 font-medium">People involved (optional)</legend>
              <label className="block space-y-1">Role<input data-testid="input-incident-person-role" className={textField} value={incidentExtras.peopleRole} onChange={event => setIncidentExtras(current => ({ ...current, peopleRole: event.target.value }))} placeholder="e.g. customer, passenger, other driver" /></label>
              <label className="block space-y-1">Name<input data-testid="input-incident-person-name" className={textField} value={incidentExtras.peopleName} onChange={event => setIncidentExtras(current => ({ ...current, peopleName: event.target.value }))} /></label>
              <label className="block space-y-1">Contact<input data-testid="input-incident-person-contact" className={textField} value={incidentExtras.peopleContact} onChange={event => setIncidentExtras(current => ({ ...current, peopleContact: event.target.value }))} /></label>
            </fieldset>
            <label className="flex items-center gap-2"><input data-testid="check-incident-police-reported" type="checkbox" checked={incidentExtras.policeReported} onChange={event => setIncidentExtras(current => ({ ...current, policeReported: event.target.checked }))} />Police were notified</label>
            <label className="space-y-1">Police reference<input data-testid="input-incident-police-reference" className={textField} value={incidentExtras.policeReference} onChange={event => setIncidentExtras(current => ({ ...current, policeReference: event.target.value }))} /></label>
            <label className="space-y-1">Roadside assistance details<textarea data-testid="input-incident-roadside-details" className={textArea} value={incidentExtras.roadsideDetails} onChange={event => setIncidentExtras(current => ({ ...current, roadsideDetails: event.target.value }))} /></label>
            <label className="space-y-1">Insurer reference<input data-testid="input-incident-insurer-reference" className={textField} value={incidentExtras.insurerReference} onChange={event => setIncidentExtras(current => ({ ...current, insurerReference: event.target.value }))} /></label>
            <label className="space-y-1">Tow details<textarea data-testid="input-incident-tow-details" className={textArea} value={incidentExtras.towDetails} onChange={event => setIncidentExtras(current => ({ ...current, towDetails: event.target.value }))} /></label>
            <label className="space-y-1">Replacement vehicle details<textarea data-testid="input-incident-replacement-vehicle" className={textArea} value={incidentExtras.replacementVehicleDetails} onChange={event => setIncidentExtras(current => ({ ...current, replacementVehicleDetails: event.target.value }))} /></label>
            <label className="space-y-1">Downtime start<input data-testid="input-incident-downtime-start" type="datetime-local" className={textField} value={incidentExtras.downtimeStart} onChange={event => setIncidentExtras(current => ({ ...current, downtimeStart: event.target.value }))} /></label>
            <label className="space-y-1">Downtime end<input data-testid="input-incident-downtime-end" type="datetime-local" className={textField} value={incidentExtras.downtimeEnd} onChange={event => setIncidentExtras(current => ({ ...current, downtimeEnd: event.target.value }))} /></label>
            <label className="space-y-1">Impact on next booking<textarea data-testid="input-incident-next-booking-impact" className={textArea} value={incidentExtras.nextBookingImpact} onChange={event => setIncidentExtras(current => ({ ...current, nextBookingImpact: event.target.value }))} /></label>
            {scope === "partner" && <label className="space-y-1">Update for customer<textarea data-testid="input-incident-customer-update" className={textArea} value={incidentExtras.customerUpdate} onChange={event => setIncidentExtras(current => ({ ...current, customerUpdate: event.target.value }))} /></label>}
          </div>
        </details>
        {invalidIncidentDetails && <p role="alert" className="text-sm text-destructive">Provide a role for the person involved and ensure downtime end is after downtime start.</p>}
        <button type="button" data-testid="button-submit-incident" disabled={action.isPending || invalidIncidentDetails || !incidentCategory.trim() || !incidentSeverity.trim() || !incidentDescription.trim()} onClick={() => runAction(customer ? customerPath("incidents") : `/rental/exceptions/operator/reservations/${reservationId}/incidents`, {
          category: incidentCategory.trim(),
          severity: incidentSeverity.trim(),
          description: incidentDescription.trim(),
          ...(unsafeVehicle ? { unsafeVehicle: true } : {}),
          ...(incidentOccurredAt ? { occurredAt: new Date(incidentOccurredAt).toISOString() } : {}),
          ...(incidentExtras.location.trim() ? { location: incidentExtras.location.trim() } : {}),
          ...(incidentExtras.peopleRole.trim() ? { peopleInvolved: [{ role: incidentExtras.peopleRole.trim(), ...(incidentExtras.peopleName.trim() ? { name: incidentExtras.peopleName.trim() } : {}), ...(incidentExtras.peopleContact.trim() ? { contact: incidentExtras.peopleContact.trim() } : {}) }] } : {}),
          ...(incidentExtras.policeReported ? { policeReported: true } : {}),
          ...(incidentExtras.policeReference.trim() ? { policeReference: incidentExtras.policeReference.trim() } : {}),
          ...(incidentExtras.roadsideDetails.trim() ? { roadsideDetails: incidentExtras.roadsideDetails.trim() } : {}),
          ...(incidentExtras.insurerReference.trim() ? { insurerReference: incidentExtras.insurerReference.trim() } : {}),
          ...(incidentExtras.towDetails.trim() ? { towDetails: incidentExtras.towDetails.trim() } : {}),
          ...(incidentExtras.replacementVehicleDetails.trim() ? { replacementVehicleDetails: incidentExtras.replacementVehicleDetails.trim() } : {}),
          ...(incidentExtras.downtimeStart ? { downtimeStart: new Date(incidentExtras.downtimeStart).toISOString() } : {}),
          ...(incidentExtras.downtimeEnd ? { downtimeEnd: new Date(incidentExtras.downtimeEnd).toISOString() } : {}),
          ...(incidentExtras.nextBookingImpact.trim() ? { nextBookingImpact: incidentExtras.nextBookingImpact.trim() } : {}),
          ...(incidentExtras.customerUpdate.trim() ? { customerUpdate: incidentExtras.customerUpdate.trim() } : {}),
        }, () => { setIncidentCategory(""); setIncidentSeverity("medium"); setIncidentDescription(""); setUnsafeVehicle(false); setIncidentOccurredAt(""); setIncidentExtras({
          location: "", peopleRole: "", peopleName: "", peopleContact: "", policeReported: false, policeReference: "",
          roadsideDetails: "", insurerReference: "", towDetails: "", replacementVehicleDetails: "", downtimeStart: "",
          downtimeEnd: "", nextBookingImpact: "", customerUpdate: "",
        }); })} className="min-h-10 rounded-md border px-4 text-sm font-medium disabled:opacity-50">Submit incident report</button>
      </article>
      {scope === "partner" && <article className="space-y-3 rounded-lg border p-4">
        <h3 className="font-semibold">Offer an alternate vehicle</h3>
        <p className="text-sm text-muted-foreground">For a customer replacement-vehicle request. For an operator-initiated cancellation with refund-or-alternative choices, use the cancellation offer form below.</p>
        {alternativesQuery.isLoading ? <p role="status" className="text-sm text-muted-foreground">Checking fleet availability…</p>
          : alternativesQuery.isError ? <div role="alert" className="space-y-2 text-sm text-destructive"><p>{alternativesQuery.error instanceof Error ? alternativesQuery.error.message : "Could not load alternatives."}</p><button type="button" onClick={() => void alternativesQuery.refetch()} className="rounded border px-3 py-2 text-foreground">Retry</button></div>
            : Array.isArray(alternativesQuery.data) && alternativesQuery.data.length > 0 ? <>
              <label className="block space-y-1 text-sm">Available vehicle<select data-testid="select-operator-alternative" className={textField} value={operatorAlternativeVehicleId} onChange={event => setOperatorAlternativeVehicleId(event.target.value)}><option value="">Select an alternative</option>{alternativesQuery.data.map((vehicle: any) => <option key={vehicle.vehicleId} value={String(vehicle.vehicleId)}>{vehicle.name} · ¥{Number(vehicle.total).toLocaleString()} · +¥{Number(vehicle.additionalAmount).toLocaleString()}</option>)}</select></label>
              <button type="button" data-testid="button-create-operator-alternative" disabled={!operatorAlternativeVehicleId || action.isPending} onClick={() => runAction(`/partner/rental/exceptions/reservations/${reservationId}/alternatives`, { vehicleId: Number(operatorAlternativeVehicleId) }, result => { setOperatorAlternativeQuote(result); void alternativesQuery.refetch(); })} className="min-h-10 rounded-md border px-4 text-sm disabled:opacity-50">{action.isPending ? "Creating quote…" : "Send alternate vehicle quote"}</button>
              {operatorAlternativeQuote && <p role="status" className="text-sm">Quote #{operatorAlternativeQuote.quoteId} sent for {operatorAlternativeQuote.vehicleName}; additional amount {money(operatorAlternativeQuote.additionalAmount)}.</p>}
             </> : Array.isArray(alternativesQuery.data)
               ? <p className="text-sm text-muted-foreground">No alternate vehicles are currently available for this booking.</p>
               : <p role="alert" className="text-sm text-destructive">Available-vehicle response was invalid.</p>}
      </article>}
      {scope === "partner" && <article className="space-y-3 rounded-lg border p-4">
        <h3 className="font-semibold">Offer cancellation resolution</h3>
        <p className="text-sm text-muted-foreground">This creates one operator offer: the customer may explicitly choose a full refund or the listed alternate vehicle. No refund is submitted before customer choice.</p>
        <label className="block space-y-1 text-sm">Reason<select data-testid="select-operator-cancellation-reason" className={textField} value={operatorCancellationReason} onChange={event => setOperatorCancellationReason(event.target.value as typeof operatorCancellationReason)}><option value="operator">Operator cannot fulfill</option><option value="no_show">Customer no-show</option><option value="weather">Unsafe / impractical weather</option></select></label>
        {alternativesQuery.isLoading ? <p role="status" className="text-sm text-muted-foreground">Checking available replacement vehicles…</p>
          : alternativesQuery.isError ? <p role="alert" className="text-sm text-destructive">{alternativesQuery.error instanceof Error ? alternativesQuery.error.message : "Available vehicles could not be loaded."}</p>
            : Array.isArray(alternativesQuery.data) && alternativesQuery.data.length > 0 ? <>
              <label className="block space-y-1 text-sm">Alternate vehicle<select data-testid="select-operator-cancellation-vehicle" className={textField} value={operatorCancellationVehicleId} onChange={event => setOperatorCancellationVehicleId(event.target.value)}><option value="">Select a replacement vehicle</option>{alternativesQuery.data.map((vehicle: any) => <option key={vehicle.vehicleId} value={String(vehicle.vehicleId)}>{vehicle.name} · {money(vehicle.total)} · additional {money(vehicle.additionalAmount)}</option>)}</select></label>
              <button type="button" data-testid="button-create-cancellation-offer" disabled={action.isPending || !operatorCancellationVehicleId} onClick={() => runAction(`/partner/rental/exceptions/reservations/${reservationId}/cancellation/offer`, {
                reason: operatorCancellationReason,
                alternativeVehicleId: Number(operatorCancellationVehicleId),
              }, result => {
                const validOffer = Number.isSafeInteger(result?.quoteId) && Number.isSafeInteger(result?.alternativeQuoteId)
                  && typeof result?.reasonText === "string" && typeof result?.policyReason === "string"
                  && Number.isFinite(result?.fullRefundAmount) && typeof result?.alternative?.vehicleName === "string"
                  && Number.isFinite(result?.alternative?.total) && Number.isFinite(result?.alternative?.additionalAmount)
                  && result?.customerConsentRequired === true && typeof result?.expiresAt === "string"
                  && Number.isFinite(Date.parse(result.expiresAt));
                if (!validOffer) {
                  setError("Cancellation offer response was incomplete; no offer is shown as created.");
                  return;
                }
                setOperatorCancellationOffer(result);
                setOperatorCancellationVehicleId("");
              })} className="min-h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{action.isPending ? "Creating offer…" : "Send cancellation offer"}</button>
            </> : Array.isArray(alternativesQuery.data)
              ? <p className="text-sm text-muted-foreground">No eligible alternate vehicles are available for an operator cancellation offer.</p>
              : <p role="alert" className="text-sm text-destructive">Available-vehicle response was invalid. No cancellation offer can be created.</p>}
        {operatorCancellationOffer && <div data-testid="status-operator-cancellation-offer" role="status" className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm">
          <p className="font-semibold">Offer #{operatorCancellationOffer.quoteId} created; customer consent is required.</p>
          <p>{operatorCancellationOffer.reasonText}</p>
          <p>{operatorCancellationOffer.policyReason}</p>
          <p>Full refund offered: {money(operatorCancellationOffer.fullRefundAmount)}</p>
          <p>Alternative: {operatorCancellationOffer.alternative?.vehicleName ?? "Unavailable"} · total {money(operatorCancellationOffer.alternative?.total)} · additional {money(operatorCancellationOffer.alternative?.additionalAmount)}</p>
          {operatorCancellationOffer.expiresAt && <p>Expires {new Date(operatorCancellationOffer.expiresAt).toLocaleString()}</p>}
          <p>No refund has been initiated.</p>
        </div>}
      </article>}
      {customer && <article className="space-y-3 rounded-lg border p-4">
        <h3 className="font-semibold">Claims and responses</h3>
        <p className="text-sm text-muted-foreground">Respond to a claim, dispute specific items, and attach private supporting evidence.</p>
        {claims.length === 0 ? <p className="text-sm text-muted-foreground">There are no claims requiring a response.</p> : claims.map((claim, index) => {
          const claimId = String(claim.id ?? claim.claimId ?? index);
          return <div key={claimId} data-testid={`claim-record-${claimId}`} className="space-y-2 rounded-md border p-3 text-sm">
            <p className="font-semibold">{claim.title ?? claim.description ?? `Claim ${claimId}`} · {claim.status ?? "open"}</p>
            {claim.totalAmount != null && <p>Claim total: {money(claim.totalAmount)}</p>}
            {Array.isArray(claim.items) && <ul className="list-inside list-disc">{claim.items.map((item: any, itemIndex: number) => <li key={item.id ?? itemIndex}>{item.description ?? item.label ?? `Item ${item.id ?? itemIndex + 1}`} · {money(item.amount)} · {item.status ?? "submitted"}</li>)}</ul>}
            {Array.isArray(claim.evidence) && claim.evidence.length > 0 && <div><p className="font-medium">Evidence records</p><ul className="list-inside list-disc">{claim.evidence.map((item: any, evidenceIndex: number) => <li key={item.id ?? evidenceIndex}>{item.fileName ?? item.name ?? item.label ?? `Evidence record ${evidenceIndex + 1}`}{item.status ? ` · ${item.status}` : ""}</li>)}</ul></div>}
            {claim.customerResponse && <p className="rounded bg-muted p-2">Your previous response: {claim.customerResponse}</p>}
            {["submitted", "disputed"].includes(String(claim.status)) ? <>
              <label className="block space-y-1">Your response<textarea data-testid={`input-claim-response-${claimId}`} className={textArea} value={claimResponses[claimId] ?? ""} onChange={event => setClaimResponses(current => ({ ...current, [claimId]: event.target.value }))} /></label>
              <label className="block space-y-1">Disputed item IDs (optional, one per line)<textarea data-testid={`input-claim-disputed-items-${claimId}`} className={`${textArea} min-h-14`} value={disputedItems[claimId] ?? ""} onChange={event => setDisputedItems(current => ({ ...current, [claimId]: event.target.value }))} /></label>
              {evidenceUploader(`customer-claim-${claimId}`, "customer_response", { claimId: Number(claimId) })}
              <button type="button" data-testid={`button-submit-claim-response-${claimId}`} disabled={action.isPending || !claimResponses[claimId]?.trim()} onClick={() => {
              const ids = (disputedItems[claimId] ?? "").split("\n").map(value => value.trim()).filter(Boolean).map(Number);
              if (ids.some(itemId => !Number.isInteger(itemId) || itemId < 1)) {
                setError("Disputed item IDs must be positive whole numbers.");
                return;
              }
              runAction(`/rental/exceptions/claims/${encodeURIComponent(claimId)}/customer-response`, {
                response: claimResponses[claimId].trim(),
                ...(ids.length ? { disputedItemIds: ids } : {}),
              }, () => {
                setClaimResponses(current => ({ ...current, [claimId]: "" }));
                setDisputedItems(current => ({ ...current, [claimId]: "" }));
              });
              }} className="min-h-10 rounded-md border px-4 text-sm font-medium disabled:opacity-50">Send response</button>
            </> : <p className="text-sm text-muted-foreground">This claim is not currently awaiting a customer response.</p>}
          </div>;
        })}
      </article>}
      {scope === "partner" && <div className="rounded-lg border p-4 text-sm text-muted-foreground">Use the operator claim controls below to create and itemize claims.</div>}
    </div>}

    {scope === "partner" && <section className="space-y-4 rounded-xl border p-4">
      <div>
        <h3 className="text-lg font-semibold">Operator claim management</h3>
        <p className="text-sm text-muted-foreground">Create a claim, itemize charges, keep invoice/insurer details current, and attach private evidence. Platform approval never automatically charges a customer.</p>
      </div>
      <article className="space-y-3 rounded-lg border p-4">
        <h4 className="font-semibold">Open a claim</h4>
        <label className="block space-y-1 text-sm">Related incident (optional)<select data-testid="select-new-claim-incident" className={textField} value={claimDraft.incidentId} onChange={event => setClaimDraft(current => ({ ...current, incidentId: event.target.value }))}><option value="">No linked incident</option>{incidents.map((incident: any) => <option key={incident.id} value={String(incident.id)}>Incident #{incident.id} · {incident.category}</option>)}</select></label>
        <label className="block space-y-1 text-sm">Invoice reference (optional)<input data-testid="input-new-claim-invoice" className={textField} value={claimDraft.invoiceReference} onChange={event => setClaimDraft(current => ({ ...current, invoiceReference: event.target.value }))} /></label>
        <label className="block space-y-1 text-sm">Insurer outcome (optional)<textarea data-testid="input-new-claim-insurer-outcome" className={textArea} value={claimDraft.insurerOutcome} onChange={event => setClaimDraft(current => ({ ...current, insurerOutcome: event.target.value }))} /></label>
        <button type="button" data-testid="button-create-rental-claim" disabled={action.isPending} onClick={() => runAction(`/rental/exceptions/reservations/${reservationId}/claims`, {
          ...(claimDraft.incidentId ? { incidentId: Number(claimDraft.incidentId) } : {}),
          ...(claimDraft.invoiceReference.trim() ? { invoiceReference: claimDraft.invoiceReference.trim() } : {}),
          ...(claimDraft.insurerOutcome.trim() ? { insurerOutcome: claimDraft.insurerOutcome.trim() } : {}),
        }, () => setClaimDraft({ incidentId: "", invoiceReference: "", insurerOutcome: "" }))} className="min-h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{action.isPending ? "Creating…" : "Create claim"}</button>
      </article>

      {claims.map((claim: any, index: number) => {
        const claimId = Number(claim.id ?? claim.claimId);
        if (!Number.isInteger(claimId) || claimId < 1) return null;
        const details = claimDetailsDrafts[String(claimId)] ?? {
          invoiceReference: claim.invoiceReference ?? "",
          insurerOutcome: claim.insurerOutcome ?? "",
        };
        const itemDraft = claimItemDrafts[String(claimId)] ?? { category: "repair", description: "", amount: "" };
        return <article key={claimId} data-testid={`operator-claim-${claimId}`} className="space-y-3 rounded-lg border p-4">
          <div className="flex flex-wrap justify-between gap-2"><h4 className="font-semibold">Claim #{claimId} · {claim.status ?? "draft"}</h4><strong>{money(claim.totalAmount)}</strong></div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block space-y-1 text-sm">Invoice reference<input data-testid={`input-claim-invoice-${claimId}`} className={textField} value={details.invoiceReference} onChange={event => setClaimDetailsDrafts(current => ({ ...current, [String(claimId)]: { ...details, invoiceReference: event.target.value } }))} /></label>
            <label className="block space-y-1 text-sm">Insurer outcome<input data-testid={`input-claim-insurer-${claimId}`} className={textField} value={details.insurerOutcome} onChange={event => setClaimDetailsDrafts(current => ({ ...current, [String(claimId)]: { ...details, insurerOutcome: event.target.value } }))} /></label>
          </div>
          <button type="button" data-testid={`button-save-claim-details-${claimId}`} disabled={action.isPending} onClick={() => runAction(`/rental/exceptions/claims/${claimId}/details`, {
            invoiceReference: details.invoiceReference,
            insurerOutcome: details.insurerOutcome,
          }, () => setClaimDetailsDrafts(current => ({ ...current, [String(claimId)]: details })), "PATCH")} className="min-h-9 rounded-md border px-3 text-sm">Save claim details</button>
          {evidenceUploader(`claim-${claimId}-invoice`, "invoice", { claimId })}
          {evidenceUploader(`claim-${claimId}-insurer`, "insurer", { claimId })}
          <div className="space-y-2 border-t pt-3">
            <h5 className="font-medium">Itemized charges</h5>
            {Array.isArray(claim.items) && claim.items.map((item: any) => <div key={item.id} className="space-y-2 rounded border p-3 text-sm">
              <p><strong>{item.category}</strong> · {item.description} · {money(item.amount)} · {item.status}</p>
              {evidenceUploader(`claim-${claimId}-item-${item.id}`, "invoice", { claimId, claimItemId: Number(item.id) })}
            </div>)}
            {["draft", "submitted"].includes(String(claim.status)) && <div className="grid gap-2 rounded bg-muted/40 p-3 md:grid-cols-3">
              <label className="space-y-1 text-sm">Category<select data-testid={`select-claim-item-category-${claimId}`} className={textField} value={itemDraft.category} onChange={event => setClaimItemDrafts(current => ({ ...current, [String(claimId)]: { ...itemDraft, category: event.target.value } }))}><option value="deductible">Deductible</option><option value="repair">Repair</option><option value="cleaning">Cleaning</option><option value="noc">Non-operation charge</option></select></label>
              <label className="space-y-1 text-sm">Description<input data-testid={`input-claim-item-description-${claimId}`} className={textField} value={itemDraft.description} onChange={event => setClaimItemDrafts(current => ({ ...current, [String(claimId)]: { ...itemDraft, description: event.target.value } }))} /></label>
              <label className="space-y-1 text-sm">Amount (JPY)<input data-testid={`input-claim-item-amount-${claimId}`} type="number" min="1" step="1" className={textField} value={itemDraft.amount} onChange={event => setClaimItemDrafts(current => ({ ...current, [String(claimId)]: { ...itemDraft, amount: event.target.value } }))} /></label>
              <button type="button" data-testid={`button-add-claim-item-${claimId}`} disabled={action.isPending || !itemDraft.description.trim() || !Number.isInteger(Number(itemDraft.amount)) || Number(itemDraft.amount) <= 0} onClick={() => runAction(`/rental/exceptions/claims/${claimId}/items`, {
                category: itemDraft.category,
                description: itemDraft.description.trim(),
                amount: Number(itemDraft.amount),
              }, () => setClaimItemDrafts(current => ({ ...current, [String(claimId)]: { category: "repair", description: "", amount: "" } })))} className="min-h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50 md:col-span-3">Add charge item</button>
            </div>}
          </div>
        </article>;
      })}
      {claims.length === 0 && <p className="text-sm text-muted-foreground">No claims have been opened for this reservation.</p>}
    </section>}

    {scope === "partner" && <section className="space-y-3 rounded-xl border p-4">
      <div>
        <h3 className="text-lg font-semibold">Extension approvals</h3>
        <p className="text-sm text-muted-foreground">Approve the exact quote version before a customer can open checkout. A stale quote requires the customer to request a new quote.</p>
      </div>
      {partnerExtensionsQuery.isLoading ? <p role="status" className="text-sm text-muted-foreground">Loading extension quotes…</p>
        : partnerExtensionsQuery.isError ? <div role="alert" className="space-y-2 text-sm text-destructive"><p>{partnerExtensionsQuery.error instanceof Error ? partnerExtensionsQuery.error.message : "Could not load extension quotes."}</p><button type="button" data-testid="button-retry-partner-extensions" onClick={() => void partnerExtensionsQuery.refetch()} className="min-h-9 rounded-md border px-3">Retry</button></div>
          : !Array.isArray(partnerExtensionsQuery.data) ? <p role="alert" className="text-sm text-destructive">Extension quote response was invalid; no approval actions are available.</p>
            : partnerExtensionsQuery.data.length === 0 ? <p className="text-sm text-muted-foreground">No extension quotes are available for approval.</p>
              : partnerExtensionsQuery.data.map((quote: any) => {
                const quoteId = String(quote.quoteId);
                const validQuote = Number.isSafeInteger(quote.quoteId) && quote.quoteId > 0
                  && typeof quote.quoteVersion === "string" && quote.quoteVersion.length > 0
                  && ["pending", "approved", "stale"].includes(quote.approvalStatus)
                  && typeof quote.status === "string"
                  && typeof quote.expiresAt === "string" && Number.isFinite(Date.parse(quote.expiresAt))
                  && Number.isFinite(quote.additionalAmount);
                const livePending = validQuote && quote.approvalStatus === "pending"
                  && quote.status === "quoted" && Date.parse(quote.expiresAt) > Date.now();
                return <article key={quoteId} data-testid={`partner-extension-quote-${quoteId}`} className="space-y-2 rounded-md border p-3 text-sm">
                  {!validQuote ? <p role="alert" className="text-destructive">Extension quote details are incomplete; approval is disabled.</p> : <>
                    <p className="font-semibold">Extension quote #{quoteId} · {quote.approvalStatus}</p>
                    <p>Return: {quote.oldReturnAt ? new Date(quote.oldReturnAt).toLocaleString() : "—"} → {quote.newReturnAt ? new Date(quote.newReturnAt).toLocaleString() : "—"}</p>
                    <p>Additional amount: {money(quote.additionalAmount)}</p>
                    <p>Quote version: {quote.quoteVersion}</p>
                    <p>Expires {new Date(quote.expiresAt).toLocaleString()}</p>
                    {partnerExtensionRequoteRequired[quoteId] && <p role="alert" className="text-destructive">This quote changed or is stale (`requoteRequired`). Ask the customer to request a fresh extension quote.</p>}
                    {quote.approvalStatus === "approved" && <p role="status">Approved{quote.approvedAt ? ` at ${new Date(quote.approvedAt).toLocaleString()}` : ""}. Checkout still requires the customer’s consent.</p>}
                    {quote.approvalStatus === "stale" || (quote.approvalStatus === "pending" && !livePending) ? <p role="alert" className="text-amber-900">This extension quote is expired or no longer approvable. Ask the customer to request a fresh quote.</p> : null}
                    {livePending && !partnerExtensionRequoteRequired[quoteId] && <button type="button" data-testid={`button-approve-extension-${quoteId}`} disabled={action.isPending} onClick={() => runAction(`/partner/rental/exceptions/reservations/${reservationId}/extensions/${encodeURIComponent(quoteId)}/approve`, { quoteVersion: quote.quoteVersion }, result => {
                      const validApproval = Number(result?.quoteId) === Number(quote.quoteId)
                        && result?.quoteVersion === quote.quoteVersion && result?.approvalStatus === "approved"
                        && typeof result?.approvedAt === "string" && Number.isFinite(Date.parse(result.approvedAt))
                        && typeof result?.expiresAt === "string" && Number.isFinite(Date.parse(result.expiresAt))
                        && Date.parse(result.expiresAt) > Date.now();
                      if (!validApproval) {
                        setError("Approval response did not confirm this exact extension quote version.");
                        void partnerExtensionsQuery.refetch();
                        return;
                      }
                      setPartnerExtensionRequoteRequired(current => ({ ...current, [quoteId]: false }));
                    }, "POST", failure => {
                      if (failure.requoteRequired) setPartnerExtensionRequoteRequired(current => ({ ...current, [quoteId]: true }));
                      void partnerExtensionsQuery.refetch();
                    })} className="min-h-9 rounded-md bg-primary px-3 font-semibold text-primary-foreground disabled:opacity-50">{action.isPending ? "Approving…" : "Approve this quote version"}</button>}
                  </>}
                </article>;
              })}
      </section>}

    {scope === "partner" && <section className="space-y-3 rounded-xl border p-4">
      <h3 className="font-semibold">Resolve a consented cancellation</h3>
      <p className="text-sm text-muted-foreground">Use this only for a customer-accepted policy quote awaiting operator review. Refund amount must be a whole JPY amount and cannot exceed the verified payment balance; record the decision reason.</p>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm">Cancellation quote ID<input data-testid="input-cancellation-quote-id" type="number" min="1" step="1" className={textField} value={cancellationQuoteId} onChange={event => setCancellationQuoteId(event.target.value)} /></label>
        <label className="space-y-1 text-sm">Refund amount (JPY)<input data-testid="input-cancellation-refund-amount" type="number" min="0" step="1" className={textField} value={operatorRefundAmount} onChange={event => setOperatorRefundAmount(event.target.value)} /></label>
      </div>
      <label className="block space-y-1 text-sm">Decision note<textarea data-testid="input-cancellation-decision-note" className={textArea} value={operatorDecisionNote} onChange={event => setOperatorDecisionNote(event.target.value)} /></label>
      <button type="button" data-testid="button-resolve-cancellation" disabled={action.isPending || !Number.isInteger(Number(cancellationQuoteId)) || Number(cancellationQuoteId) <= 0 || operatorRefundAmount === "" || !Number.isInteger(Number(operatorRefundAmount)) || Number(operatorRefundAmount) < 0 || operatorDecisionNote.trim().length < 3} onClick={() => runAction(`/partner/rental/exceptions/reservations/${reservationId}/cancellation/resolve`, {
        quoteId: Number(cancellationQuoteId),
        refundAmount: Number(operatorRefundAmount),
        decisionNote: operatorDecisionNote.trim(),
      }, result => {
        setOperatorCancellationResolution(result ?? {});
        setCancellationQuoteId("");
        setOperatorRefundAmount("");
        setOperatorDecisionNote("");
      })} className="min-h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{action.isPending ? "Submitting…" : "Resolve cancellation"}</button>
      {operatorCancellationResolution && <p role="status" data-testid="status-cancellation-resolution" className="rounded-md bg-muted p-3 text-sm">
        {operatorCancellationResolution.refundStatus === "succeeded"
          ? `Cancellation refund confirmed: ${money(operatorCancellationResolution.refundAmount)}.`
          : operatorCancellationResolution.refundStatus === "not_required"
            ? "Cancellation resolved; no refund was due."
            : `Cancellation decision recorded; refund completion is not confirmed${operatorCancellationResolution.refundStatus ? ` (provider status: ${operatorCancellationResolution.refundStatus})` : ""}.`}
      </p>}
    </section>}

    {incidents.length > 0 && <section className="space-y-2">
      <h3 className="font-semibold">Incident reports</h3>
      {incidents.map((incident, index) => <article key={incident.id ?? index} data-testid={`incident-record-${incident.id ?? index}`} className="space-y-3 rounded-md border p-3 text-sm">
        <div>
          <p className="font-medium">{incident.category ?? "Incident"} · {incident.severity ?? "Severity unavailable"} · {incident.status ?? "Reported"}</p>
          {incident.occurredAt && <p className="mt-1 text-muted-foreground">{new Date(incident.occurredAt).toLocaleString()}</p>}
          <p className="mt-1">{incident.description ?? "Incident details unavailable"}</p>
          {incident.unsafeVehicle && <p className="mt-1 font-semibold text-destructive">Vehicle marked unsafe — platform clearance is required.</p>}
          {incident.customerUpdate && <p className="mt-2 rounded bg-muted p-2">Operator update: {incident.customerUpdate}</p>}
        </div>
        {scope !== "admin" && evidenceUploader(`incident-${incident.id}`, "incident", { incidentId: Number(incident.id) })}
        {scope === "partner" && incident.status !== "resolved" && <div className="space-y-2 border-t pt-3">
          <label className="block space-y-1">Customer update<textarea data-testid={`input-incident-update-${incident.id}`} className={textArea} value={claimResponses[`incident-${incident.id}`] ?? ""} onChange={event => setClaimResponses(current => ({ ...current, [`incident-${incident.id}`]: event.target.value }))} /></label>
          <button type="button" data-testid={`button-send-incident-update-${incident.id}`} disabled={action.isPending || !claimResponses[`incident-${incident.id}`]?.trim()} onClick={() => runAction(`/rental/exceptions/incidents/${incident.id}/customer-update`, { update: claimResponses[`incident-${incident.id}`].trim() }, () => setClaimResponses(current => ({ ...current, [`incident-${incident.id}`]: "" })))} className="min-h-9 rounded-md border px-3">Send customer update</button>
        </div>}
        {scope === "admin" && incident.status !== "resolved" && <div className="space-y-2 border-t pt-3">
          <label className="block space-y-1">Resolution<textarea data-testid={`input-incident-resolution-${incident.id}`} className={textArea} value={incidentResolutions[String(incident.id)] ?? ""} onChange={event => setIncidentResolutions(current => ({ ...current, [String(incident.id)]: event.target.value }))} /></label>
          <button type="button" data-testid={`button-resolve-incident-${incident.id}`} disabled={action.isPending || !incidentResolutions[String(incident.id)]?.trim()} onClick={() => runAction(`/admin/rental/exceptions/incidents/${incident.id}/resolve`, { resolution: incidentResolutions[String(incident.id)].trim() }, () => setIncidentResolutions(current => ({ ...current, [String(incident.id)]: "" })))} className="min-h-9 rounded-md bg-primary px-3 font-medium text-primary-foreground disabled:opacity-50">Resolve incident</button>
        </div>}
      </article>)}
    </section>}

    {scope === "admin" && claims.length > 0 && <section className="space-y-3 rounded-xl border p-4">
      <h3 className="text-lg font-semibold">Platform claim review</h3>
      <p className="text-sm text-muted-foreground">Approval is consideration only; this workflow does not charge a customer. The server checks invoice, insurer, handover, and claim-item evidence before approval.</p>
      {claims.map((claim, index) => {
        const claimId = Number(claim.id ?? claim.claimId);
        if (!Number.isInteger(claimId) || claimId < 1) return null;
        const decision = claimDecision[String(claimId)] ?? { notes: "", insurerOutcome: claim.insurerOutcome ?? "" };
        const decided = ["approved", "rejected", "closed"].includes(String(claim.status));
        return <article key={claimId} data-testid={`platform-claim-${claimId}`} className="space-y-3 rounded-lg border p-4 text-sm">
          <div className="flex flex-wrap justify-between gap-2"><p className="font-semibold">Claim #{claimId} · {claim.status ?? "submitted"}</p><strong>{money(claim.totalAmount)}</strong></div>
          <p>Invoice reference: {claim.invoiceReference || "Missing"}</p>
          <p>Insurer outcome: {claim.insurerOutcome || "Missing"}</p>
          <ul className="list-inside list-disc">{(claim.items ?? []).map((item: any) => <li key={item.id}>#{item.id} · {item.category} · {item.description} · {money(item.amount)} · {item.status}</li>)}</ul>
          {!decided && <>
            <label className="block space-y-1">Decision notes<textarea data-testid={`input-platform-claim-notes-${claimId}`} className={textArea} value={decision.notes} onChange={event => setClaimDecision(current => ({ ...current, [String(claimId)]: { ...decision, notes: event.target.value } }))} /></label>
            <label className="block space-y-1">Insurer outcome (optional)<textarea data-testid={`input-platform-claim-insurer-${claimId}`} className={textArea} value={decision.insurerOutcome} onChange={event => setClaimDecision(current => ({ ...current, [String(claimId)]: { ...decision, insurerOutcome: event.target.value } }))} /></label>
            <div className="flex flex-wrap gap-2">
              <button type="button" data-testid={`button-platform-approve-claim-${claimId}`} disabled={action.isPending || !decision.notes.trim()} onClick={() => runAction(`/admin/rental/exceptions/claims/${claimId}/decision`, { decision: "approve", notes: decision.notes.trim(), ...(decision.insurerOutcome.trim() ? { insurerOutcome: decision.insurerOutcome.trim() } : {}) })} className="min-h-10 rounded-md bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50">Approve claim</button>
              <button type="button" data-testid={`button-platform-reject-claim-${claimId}`} disabled={action.isPending || !decision.notes.trim()} onClick={() => runAction(`/admin/rental/exceptions/claims/${claimId}/decision`, { decision: "reject", notes: decision.notes.trim(), ...(decision.insurerOutcome.trim() ? { insurerOutcome: decision.insurerOutcome.trim() } : {}) })} className="min-h-10 rounded-md border px-4 disabled:opacity-50">Reject claim</button>
            </div>
          </>}
        </article>;
      })}
    </section>}

    {evidence.length > 0 && <section className="space-y-2 rounded-xl border p-4">
      <h3 className="font-semibold">Private evidence on file</h3>
      <ul className="space-y-2">{evidence.map((item: any, index: number) => <li key={item.token ?? index} data-testid={`exception-evidence-${item.token ?? index}`} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm">
        <span>{item.evidenceKind} · {item.contentType}{item.claimId ? ` · claim #${item.claimId}` : ""}{item.claimItemId ? ` · item #${item.claimItemId}` : ""}{item.incidentId ? ` · incident #${item.incidentId}` : ""}{item.uploadedAt ? ` · ${new Date(item.uploadedAt).toLocaleString()}` : ""}</span>
        {item.contentPath && <a data-testid={`link-exception-evidence-${item.token ?? index}`} className="font-medium underline" href={`/api${item.contentPath}`} target="_blank" rel="noreferrer">Open private evidence</a>}
      </li>)}</ul>
    </section>}

    {timeline.length > 0 && <section className="space-y-2">
      <h3 className="font-semibold">Request timeline</h3>
      <ol className="space-y-2">{timeline.map((entry, index) => <li key={entry.id ?? index} data-testid={`exception-timeline-entry-${entry.id ?? index}`} className="rounded-md border p-3 text-sm">
        <p className="font-medium">{entry.title ?? entry.eventType ?? entry.event ?? entry.type ?? entry.status ?? "Update"}</p>
        {(entry.createdAt ?? entry.occurredAt) && <p className="text-xs text-muted-foreground">{new Date(entry.createdAt ?? entry.occurredAt).toLocaleString()}</p>}
        {entry.description && <p className="mt-1">{entry.description}</p>}
        {entry.details && <pre className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{policyText(entry.details)}</pre>}
      </li>)}</ol>
    </section>}
  </section>;
}