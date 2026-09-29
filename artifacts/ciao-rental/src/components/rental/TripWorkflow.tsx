import { useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, CheckCircle2, CircleAlert, ShieldCheck } from "lucide-react";
import { useRentalTripAction } from "@/hooks/use-rental-operations";

type Scope = "partner" | "admin";
type Driver = { id?: number; fullName?: string; originalsVerifiedAt?: string | null };
type Inspection = Record<string, any> | null;
type TripData = {
  reservation?: Record<string, any>;
  drivers?: Driver[];
  pickup?: Inspection;
  return?: Inspection;
  missingPickup?: string[];
  missingReturn?: string[];
  readiness?: { ready?: boolean; missing?: string[] };
  vehicle?: Record<string, any> | null;
  ledger?: Array<Record<string, any>>;
  provisionalCharges?: Array<Record<string, any>>;
  paymentSnapshot?: Record<string, any>;
};

const fuelLevels = ["Full", "3/4", "1/2", "1/4", "Empty"];
const money = (value: unknown) => `¥${Number(value || 0).toLocaleString()}`;
const labels: Record<string, string> = {
  paymentPaid: "Payment confirmed",
  authorizedDrivers: "Authorized drivers are listed",
  allDriverOriginalsVerified: "Original documents checked for every driver",
  agreementAccepted: "Rental agreement accepted",
  signatureReference: "Agreement reference recorded",
  vehicleIdentity: "Vehicle identity confirmed",
  actualAt: "Actual handover/return time recorded",
  location: "Handover/return location recorded",
  mileage: "Odometer recorded",
  fuelLevel: "Fuel level recorded",
  equipment: "Equipment checked",
  exteriorPhotos: "Exterior photos added",
  interiorPhotos: "Interior photos added",
};

function checklistLabel(item: string) {
  if (labels[item]) return labels[item];
  const driverRequirement = item.match(/^driver:(\d+):(.*)$/);
  if (!driverRequirement) return item;
  const driverName = driversLabelId(Number(driverRequirement[1]));
  const requirement: Record<string, string> = {
    originalLicense: "driver's license original not yet verified in person",
    originalIdentity: "identity original not yet verified in person",
    originalInternationalPermit: "required IDP original not yet verified",
    approvedDriversLicense: "driver's license document not yet approved",
    approvedIdentityDocument: "identity document not yet approved",
    approvedInternationalPermit: "required international permit document not yet approved",
  };
  return `${driverName}: ${requirement[driverRequirement[2]] ?? driverRequirement[2]}`;
}

function driversLabelId(id: number) {
  return `Driver #${id}`;
}

function splitItems(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

async function responseJson(response: Response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error || body?.message || `Request failed (${response.status})`);
  }
  return body;
}

async function uploadInspectionPhotos(scope: Scope, id: number, files: File[]) {
  const references: string[] = [];
  for (const file of files) {
    if (!["image/jpeg", "image/png"].includes(file.type)) throw new Error("Inspection photos must be JPEG or PNG.");
    if (file.size > 12 * 1024 * 1024) throw new Error("Each inspection photo must be 12 MB or smaller.");
    const upload = await responseJson(await fetch(`/api/${scope}/rental/reservations/${id}/inspection-photos/upload-request`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentType: file.type }),
    }));
    const uploaded = await fetch(upload.uploadPath, {
      method: upload.method,
      credentials: "include",
      headers: { "Content-Type": upload.contentType },
      body: file,
    });
    if (!uploaded.ok) {
      const body = await uploaded.json().catch(() => null);
      throw new Error(body?.error || body?.message || `Photo upload failed (${uploaded.status})`);
    }
    references.push(upload.reference);
  }
  return references;
}

function Checklist({ missing, title }: { missing: string[]; title: string }) {
  return <section className="space-y-3 rounded-lg border bg-slate-50 p-4" aria-label={title}>
    <h3 className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" />{title}</h3>
    <ul className="space-y-2 text-sm">
      {missing.length ? missing.map((item) => <li key={item} className="flex items-start gap-2 text-amber-800"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />{checklistLabel(item)}</li>)
        : <li className="flex items-center gap-2 text-emerald-800"><CheckCircle2 className="h-4 w-4" />No outstanding checklist items.</li>}
    </ul>
  </section>;
}

function EvidenceFields({ location, setLocation, equipment, setEquipment, exterior, setExterior, interior, setInterior, id }: {
  location: string; setLocation: (value: string) => void;
  equipment: string; setEquipment: (value: string) => void;
  exterior: File[]; setExterior: (files: File[]) => void;
  interior: File[]; setInterior: (files: File[]) => void;
  id: number;
}) {
  return <>
    <label className="block space-y-1.5 text-sm font-medium">Actual location
      <input data-testid={`input-trip-location-${id}`} className="h-11 w-full rounded-md border px-3" required maxLength={500} value={location} onChange={(event) => setLocation(event.target.value)} />
    </label>
    <label className="block space-y-1.5 text-sm font-medium">Equipment checked <span className="font-normal text-slate-500">(comma separated)</span>
      <input data-testid={`input-trip-equipment-${id}`} className="h-11 w-full rounded-md border px-3" required placeholder="Keys, child seat, charging cable…" value={equipment} onChange={(event) => setEquipment(event.target.value)} />
    </label>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block space-y-1.5 text-sm font-medium">Private exterior photos
        <input data-testid={`input-trip-exterior-${id}`} className="block w-full text-sm" type="file" accept="image/jpeg,image/png" multiple required onChange={(event) => setExterior(Array.from(event.target.files ?? []))} />
        <span className="block text-xs font-normal text-slate-500">JPEG or PNG, up to 12 MB each. Uploaded to private evidence storage.</span>
        {exterior.length > 0 && <span className="block text-xs font-normal text-slate-600">{exterior.length} photo(s) selected</span>}
      </label>
      <label className="block space-y-1.5 text-sm font-medium">Private interior photos
        <input data-testid={`input-trip-interior-${id}`} className="block w-full text-sm" type="file" accept="image/jpeg,image/png" multiple required onChange={(event) => setInterior(Array.from(event.target.files ?? []))} />
        <span className="block text-xs font-normal text-slate-500">JPEG or PNG, up to 12 MB each. No public URLs accepted.</span>
        {interior.length > 0 && <span className="block text-xs font-normal text-slate-600">{interior.length} photo(s) selected</span>}
      </label>
    </div>
  </>;
}

export function TripWorkflow({ id, scope, trip, mode, onDone }: {
  id: number; scope: Scope; trip: TripData; mode: "pickup" | "return" | "close"; onDone?: () => void;
}) {
  const queryClient = useQueryClient();
  const action = useRentalTripAction(scope);
  const drivers = trip.drivers ?? [];
  const missing = mode === "pickup" ? trip.readiness?.missing ?? trip.missingPickup ?? [] : trip.missingReturn ?? [];
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [signatureReference, setSignatureReference] = useState("");
  const [vehicleIdentityConfirmed, setVehicleIdentityConfirmed] = useState(false);
  const [driverChecks, setDriverChecks] = useState<Record<number, { license: boolean; identity: boolean; idp: boolean; idpRequired: boolean }>>({});
  const [odometer, setOdometer] = useState("");
  const [fuelLevel, setFuelLevel] = useState("Full");
  const [location, setLocation] = useState(mode === "pickup" ? trip.reservation?.pickupLocation ?? "" : trip.reservation?.returnLocation ?? "");
  const [equipment, setEquipment] = useState("");
  const [exterior, setExterior] = useState<File[]>([]);
  const [interior, setInterior] = useState<File[]>([]);
  const [damageLocation, setDamageLocation] = useState("");
  const [damageDescription, setDamageDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [charges, setCharges] = useState<Array<{ key: number; code: string; amount: string; description: string }>>([]);
  const [nextChargeKey, setNextChargeKey] = useState(1);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<Record<string, any> | null>(null);
  const [selectedExtras, setSelectedExtras] = useState<Record<string, boolean>>(() =>
    Object.fromEntries((trip.provisionalCharges ?? []).filter((item) => item.customerAcknowledged).map((item) => [String(item.code), true])),
  );
  const [approvedRefundInput, setApprovedRefundInput] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [closeConfirmed, setCloseConfirmed] = useState(false);
  const submitInspection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const equipmentItems = splitItems(equipment);
    if (!equipmentItems.length || equipmentItems.length > 100 || equipmentItems.some((item) => item.length > 200)) { setError("Record 1–100 equipment items, each no longer than 200 characters."); return; }
    if (!exterior.length || !interior.length) { setError("Add at least one exterior and one interior photo."); return; }
    if (exterior.length > 20 || interior.length > 20) { setError("Add no more than 20 exterior and 20 interior photos."); return; }
    if (mode === "pickup") {
      if (missing.includes("paymentPaid")) {
        setError("Payment is not confirmed as paid. Pickup cannot proceed until the payment ledger/status confirms payment.");
        return;
      }
      if (!agreementAccepted || !signatureReference.trim() || signatureReference.trim().length > 1000 || !vehicleIdentityConfirmed) {
        setError("Confirm the agreement, record its reference, and confirm vehicle identity.");
        return;
      }
      if (!drivers.length || drivers.some((driver) => {
        const check = driverChecks[Number(driver.id)];
        return !check?.license || !check?.identity || (check.idpRequired && !check.idp);
      })) {
        setError("Verify original license and identity documents in person for every authorized driver.");
        return;
      }
    }
    if (!odometer || !Number.isSafeInteger(Number(odometer)) || Number(odometer) < 0) {
      setError("Enter a valid non-negative whole-number odometer reading.");
      return;
    }
    if (damageDescription.trim() === "" && damageLocation.trim()) { setError("Describe the damage or clear its location."); return; }
    if (mode === "return" && charges.some((charge) => {
      const hasChargeContent = Boolean(charge.code.trim() || charge.amount || charge.description.trim());
      if (!hasChargeContent) return false;
      const amount = Number(charge.amount);
      return !charge.code.trim() || !charge.amount || !Number.isSafeInteger(amount) || amount < 0 || (amount > 0 && !charge.description.trim());
    })) {
      setError("Each provisional charge needs a code and whole-number amount. Amounts above zero require a description.");
      return;
    }
    if (mode === "return" && new Set(charges.filter((charge) => Number(charge.amount) > 0).map((charge) => charge.code.trim())).size !== charges.filter((charge) => Number(charge.amount) > 0).length) {
      setError("Each provisional charge must use a unique code.");
      return;
    }
    try {
      const photos = await uploadInspectionPhotos(scope, id, [...exterior, ...interior]);
      const exteriorPhotos = photos.slice(0, exterior.length);
      const interiorPhotos = photos.slice(exterior.length);
      const damageNotes = [
        ...(damageDescription.trim() ? [{ location: damageLocation.trim() || undefined, description: damageDescription.trim() }] : []),
        ...(mode === "return" ? charges.filter((charge) => charge.description.trim()).map((charge) => ({ location: charge.code.trim() || "Provisional charge", description: charge.description.trim() })) : []),
      ];
      const common = {
        actualAt: new Date().toISOString(),
        location: location.trim(),
        mileage: Number(odometer),
        fuelLevel,
        equipment: equipmentItems,
        exteriorPhotos,
        interiorPhotos,
        damageNotes,
        notes: notes.trim() || undefined,
      };
      const data = mode === "pickup" ? {
        ...common,
        agreementAccepted: true,
        signatureReference: signatureReference.trim(),
        vehicleIdentity: `${trip.vehicle?.registration ?? ""} ${trip.vehicle?.make ?? ""} ${trip.vehicle?.model ?? ""}`.trim() || "Vehicle identity checked in person",
        drivers: drivers.map((driver) => {
          const check = driverChecks[Number(driver.id)];
          return {
            driverId: Number(driver.id),
            originalsVerified: Boolean(check?.license && check?.identity && (!check?.idpRequired || check?.idp)),
            licenseOriginalVerified: Boolean(check?.license),
            identityOriginalVerified: Boolean(check?.identity),
            idpRequired: Boolean(check?.idpRequired),
            ...(check?.idpRequired ? { idpOriginalVerified: Boolean(check.idp) } : {}),
          };
        }),
      } : {
        ...common,
        additionalCharges: Object.fromEntries(charges.filter((charge) => charge.code.trim() && Number(charge.amount) > 0).map((charge) => [charge.code.trim(), Number(charge.amount)])),
      };
      await action.mutateAsync({ id, action: mode, data });
      await queryClient.invalidateQueries({ queryKey: [scope, "rental", "reservations"] });
      await queryClient.invalidateQueries({ queryKey: [scope, "reservations"] });
      onDone?.();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not complete the inspection.");
    }
  };

  const reservation = trip.reservation ?? {};
  const paymentSnapshot = trip.paymentSnapshot ?? reservation.paymentSnapshot;
  const hasPaymentSnapshot = paymentSnapshot != null && typeof paymentSnapshot === "object";
  const baseTotal = Number(hasPaymentSnapshot ? paymentSnapshot.amount : reservation.finalTotal);
  const baseTotalAvailable = Number.isSafeInteger(baseTotal) && baseTotal >= 0;
  const outstandingValue = reservation.outstanding == null ? Number.NaN : Number(reservation.outstanding);
  const paidValue = hasPaymentSnapshot
    ? Number(paymentSnapshot.paidAmount)
    : reservation.paidAmount == null
      ? Number.isFinite(outstandingValue) && baseTotalAvailable ? Math.max(0, baseTotal - outstandingValue) : Number.NaN
      : Number(reservation.paidAmount);
  const paidAvailable = Number.isSafeInteger(paidValue) && paidValue >= 0;
  const previousRefunds = hasPaymentSnapshot
    ? Number(paymentSnapshot.refundedAmount)
    : reservation.refundAmount == null
      ? (trip.ledger ?? []).filter((entry) => entry.entryType === "approved_refund" || entry.entryType === "refund").reduce((total, entry) => total + Math.abs(Number(entry.amount) || 0), 0)
      : Math.max(0, Number(reservation.refundAmount) || 0);
  const previousRefundsAvailable = Number.isSafeInteger(previousRefunds) && previousRefunds >= 0;
  const projectionIsEstimate = !hasPaymentSnapshot || !baseTotalAvailable || !paidAvailable || !previousRefundsAvailable;
  const maximumRefund = paidAvailable && baseTotalAvailable
    && previousRefundsAvailable
    ? Math.max(0, Math.min(baseTotal, paidValue) - previousRefunds)
    : null;
  const refundAmount = approvedRefundInput === "" ? 0 : Number(approvedRefundInput);
  const acknowledgedExtras = (trip.provisionalCharges ?? []).filter((item) => item.customerAcknowledged && selectedExtras[String(item.code)]);
  const approvedExtraTotal = acknowledgedExtras.reduce((total, item) => total + Math.max(0, Number(item.amount) || 0), 0);
  const projectedTotal = Math.max(0, (baseTotalAvailable ? baseTotal : 0) + approvedExtraTotal -
    (previousRefundsAvailable ? previousRefunds : 0) -
    (Number.isSafeInteger(refundAmount) && refundAmount > 0 ? refundAmount : 0));
  const projectedOutstanding = paidAvailable && previousRefundsAvailable
    ? Math.max(0, projectedTotal - (paidValue - previousRefunds))
    : null;
  const persistedClosed = trip.reservation?.status === "closed" || receipt?.reservation?.status === "closed";

  const requestClose = () => {
    setError("");
    if (!Number.isSafeInteger(refundAmount) || refundAmount < 0) {
      setError("Approved refund must be a non-negative whole JPY amount.");
      return;
    }
    if (maximumRefund != null && refundAmount > maximumRefund) {
      setError(`Approved refund cannot exceed the available paid amount of ${money(maximumRefund)}.`);
      return;
    }
    if (!baseTotalAvailable) {
      setError("The saved booking total is unavailable, so the close projection cannot be verified. Refresh the trip details.");
      return;
    }
    setConfirmClose(true);
    setCloseConfirmed(false);
  };

  const closeTrip = async () => {
    setError("");
    if (!closeConfirmed) {
      setError("Confirm the close action before submitting.");
      return;
    }
    try {
      const result = await action.mutateAsync({
        id,
        action: "close",
        data: {
          approvedExtras: Object.fromEntries(acknowledgedExtras.map((item) => [String(item.code), Number(item.amount)])),
          approvedRefund: refundAmount,
        },
      });
      setReceipt(result as Record<string, any>);
      setConfirmClose(false);
      setCloseConfirmed(false);
      await queryClient.invalidateQueries({ queryKey: [scope, "reservations"] });
      await queryClient.invalidateQueries({ queryKey: [scope, "reservations", id, "trip"] });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not close this trip.");
    }
  };

  const completed = mode === "pickup" ? trip.pickup : trip.return;
  if (mode === "close") {
    const ledger = trip.reservation?.status === "closed"
      ? trip.ledger ?? []
      : receipt?.reservation?.status === "closed"
        ? receipt.ledger ?? []
        : trip.ledger ?? [];
    const commission = (ledger as Array<Record<string, any>>).find((entry) => entry.entryType === "platform_commission");
    const operatorShare = (ledger as Array<Record<string, any>>).find((entry) => entry.entryType === "operator_share");
    const savedSnapshot = paymentSnapshot ?? {};
    return <div className="space-y-6">
      <h2 className="text-xl font-semibold">{persistedClosed ? "Closed trip receipt" : "Review trip close"}</h2>
      {persistedClosed ? <p role="status" className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">This receipt shows persisted trip ledger entries. It is not a proposal or a payment confirmation unless an entry status explicitly confirms paid or collected.</p>
        : <p className="text-sm text-slate-600">Choose acknowledged extras and an optional refund. {projectionIsEstimate ? hasPaymentSnapshot ? "The payment snapshot is incomplete, so this projection is an estimate." : "This is an estimate from reservation fields because no payment snapshot was supplied." : "The projection uses the saved payment snapshot."} Closing writes approved amounts to the trip ledger and does not collect or disburse money.</p>}
      {trip.provisionalCharges?.length ? <section className="rounded-lg border border-amber-300 bg-amber-50 p-4">
        <h3 className="font-semibold">Provisional return charges — not collected</h3>
        <p className="mt-1 text-sm">Only charges acknowledged by the customer can be selected for approval. Unselected or unacknowledged claims are not included as approved extras.</p>
        <ul className="mt-3 space-y-3 text-sm">{trip.provisionalCharges.map((item, index) => {
          const code = String(item.code ?? `charge-${index}`);
          return <li key={code} className="flex flex-wrap items-center justify-between gap-3 border-t border-amber-200 pt-3">
            <label className="flex items-start gap-2">
              {!persistedClosed && <input data-testid={`check-approved-extra-${id}-${code}`} type="checkbox" disabled={!item.customerAcknowledged} checked={Boolean(selectedExtras[code])} onChange={(event) => setSelectedExtras((current) => ({ ...current, [code]: event.target.checked }))} />}
              <span>{item.code ?? "Charge"} · {item.status ?? "provisional"} · {item.customerAcknowledged ? "customer acknowledgment recorded" : "awaiting customer acknowledgment"}</span>
            </label>
            <strong>{money(item.amount)}</strong>
          </li>;
        })}</ul>
      </section> : <p className="text-sm text-slate-600">No provisional charges were reported.</p>}
      {!persistedClosed && reservation.status === "return_completed" && <section className="space-y-4 rounded-lg border p-4">
        <h3 className="font-semibold">Approval and settlement projection</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between gap-3"><span>{hasPaymentSnapshot ? "Saved payment amount" : "Estimated saved booking total"}</span><span>{baseTotalAvailable ? money(baseTotal) : "Unavailable"}</span></div>
          {previousRefunds > 0 && <div className="flex justify-between gap-3"><span>Previously processed refunds</span><span>−{money(previousRefunds)}</span></div>}
          {acknowledgedExtras.map((item) => <div key={String(item.code)} className="flex justify-between gap-3"><span>Approved extra · {item.code}</span><span>+{money(item.amount)}</span></div>)}
          {acknowledgedExtras.length === 0 && <p className="text-xs text-slate-500">No acknowledged extras selected.</p>}
          <div className="flex justify-between gap-3">
            <label htmlFor={`input-approved-refund-${id}`}>Approved refund amount (JPY)</label>
            <input id={`input-approved-refund-${id}`} data-testid={`input-approved-refund-${id}`} className="h-10 w-40 rounded-md border px-3 text-right" type="number" min="0" step="1" max={maximumRefund ?? undefined} value={approvedRefundInput} onChange={(event) => setApprovedRefundInput(event.target.value)} />
          </div>
          <div className="flex justify-between gap-3"><span>Refund in projection</span><span>−{money(Number.isSafeInteger(refundAmount) && refundAmount > 0 ? refundAmount : 0)}</span></div>
          {maximumRefund != null ? <p className="text-xs text-slate-500">Available refund limit: {money(maximumRefund)} based on {hasPaymentSnapshot ? "the saved payment snapshot" : "the available reservation estimate"} less previously processed refunds.</p>
            : <p className="text-xs text-amber-800">Paid amount or processed refunds are unavailable; the server will validate the refund against its saved payment record.</p>}
          <div className="flex justify-between border-t pt-2 font-semibold"><span>Projected final total</span><span>{money(projectedTotal)}</span></div>
          <div className="flex justify-between gap-3"><span>Extras pending collection</span><span>{money(approvedExtraTotal)}</span></div>
          <div className="flex justify-between gap-3"><span>Refund pending payment</span><span>{money(Number.isSafeInteger(refundAmount) && refundAmount > 0 ? refundAmount : 0)}</span></div>
          <div className="flex justify-between gap-3 border-t pt-2"><span>Projected net outstanding balance</span><span>{projectedOutstanding == null ? "Payment balance unavailable" : money(projectedOutstanding)}</span></div>
          <p className="text-xs text-slate-500">Projection only. This action does not collect the pending amount or issue the refund.</p>
        </div>
        {(commission || operatorShare || savedSnapshot.commissionAmount != null || savedSnapshot.operatorShareAmount != null || savedSnapshot.commissionBasisPoints != null) ? <div className="border-t pt-3 text-sm">
          <h4 className="font-medium">Saved commission and operator share</h4>
          {commission && <p className="flex justify-between"><span>Platform commission · ledger</span><span>{money(commission.amount)}</span></p>}
          {!commission && savedSnapshot.commissionAmount != null && <p className="flex justify-between"><span>Platform commission · saved snapshot</span><span>{money(savedSnapshot.commissionAmount)}</span></p>}
          {operatorShare && <p className="flex justify-between"><span>Operator share · ledger</span><span>{money(operatorShare.amount)}</span></p>}
          {!operatorShare && savedSnapshot.operatorShareAmount != null && <p className="flex justify-between"><span>Operator share · saved snapshot</span><span>{money(savedSnapshot.operatorShareAmount)}</span></p>}
          {savedSnapshot.commissionBasisPoints != null && <p className="flex justify-between"><span>Saved commission rate</span><span>{Number(savedSnapshot.commissionBasisPoints) / 100}%</span></p>}
        </div> : <p className="border-t pt-3 text-xs text-slate-500">Saved commission/share breakdown is not present in this trip response and is not estimated.</p>}
      </section>}
      <Ledger ledger={ledger} />
      {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {!persistedClosed && reservation.status === "return_completed" && !confirmClose && <button data-testid={`button-review-close-trip-${id}`} type="button" disabled={action.isPending} onClick={requestClose} className="min-h-11 rounded-md bg-slate-900 px-5 font-semibold text-white disabled:opacity-50">Review close and receipt</button>}
      {!persistedClosed && confirmClose && <section className="space-y-3 rounded-lg border border-amber-400 bg-amber-50 p-4">
        <h3 className="font-semibold">Confirm trip close</h3>
        <p className="text-sm">You are recording a projected final total of {money(projectedTotal)} including {money(approvedExtraTotal)} in customer-acknowledged extras and {money(refundAmount)} approved refund. No funds are collected or disbursed by this action.</p>
        <label className="flex items-start gap-2 text-sm"><input data-testid={`check-confirm-trip-close-${id}`} className="mt-1" type="checkbox" checked={closeConfirmed} onChange={(event) => setCloseConfirmed(event.target.checked)} />I reviewed these approved amounts and confirm closing the trip.</label>
        <div className="flex flex-wrap gap-2">
          <button data-testid={`button-confirm-trip-close-${id}`} type="button" disabled={!closeConfirmed || action.isPending} onClick={() => void closeTrip()} className="min-h-10 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-50">{action.isPending ? "Closing…" : "Confirm and close trip"}</button>
          <button data-testid={`button-cancel-trip-close-${id}`} type="button" disabled={action.isPending} onClick={() => { setConfirmClose(false); setCloseConfirmed(false); }} className="min-h-10 rounded-md border bg-white px-4 text-sm font-medium disabled:opacity-50">Back to review</button>
        </div>
      </section>}
      {!persistedClosed && reservation.status !== "return_completed" && <p className="text-sm text-amber-800">A completed return inspection is required before the trip can be closed.</p>}
    </div>;
  }

  return <form onSubmit={submitInspection} className="space-y-6">
    <div>
      <h2 className="text-xl font-semibold">{mode === "pickup" ? "Customer pickup" : "Vehicle return"}</h2>
      <p className="mt-1 text-sm text-slate-600">Reservation #{id} · {trip.vehicle?.make} {trip.vehicle?.model} {trip.vehicle?.registration ? `· ${trip.vehicle.registration}` : ""}</p>
    </div>
    {mode === "pickup" && <Checklist missing={missing} title="Pickup readiness checklist" />}
    {mode === "pickup" && <section className="space-y-4 rounded-lg border p-4">
      <h3 className="font-semibold">Authorized driver documents</h3>
      <p className="text-sm text-slate-600">Inspect each driver’s actual original documents in person. Check the uploaded record against the original. This records your verification; it does not replace the physical check.</p>
      {!drivers.length && <p className="text-sm text-amber-800">No authorized drivers are available. Refresh or contact support before handover.</p>}
      {drivers.map((driver) => {
        const driverId = Number(driver.id);
        const check = driverChecks[driverId] ?? { license: false, identity: false, idp: false, idpRequired: false };
        return <div key={driver.id} className="space-y-3 border-t pt-3">
          <p className="font-medium">{driver.fullName || `Driver ${driverId}`}</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <label className="flex items-center gap-2"><input data-testid={`check-license-${driverId}`} type="checkbox" checked={check.license} onChange={(event) => setDriverChecks((old) => ({ ...old, [driverId]: { ...check, license: event.target.checked } }))} />Original driver’s license checked</label>
            <label className="flex items-center gap-2"><input data-testid={`check-identity-${driverId}`} type="checkbox" checked={check.identity} onChange={(event) => setDriverChecks((old) => ({ ...old, [driverId]: { ...check, identity: event.target.checked } }))} />Original identity document checked</label>
            <label className="flex items-center gap-2"><input data-testid={`check-idp-required-${driverId}`} type="checkbox" checked={check.idpRequired} onChange={(event) => setDriverChecks((old) => ({ ...old, [driverId]: { ...check, idpRequired: event.target.checked } }))} />IDP is required for this driver</label>
            {check.idpRequired && <label className="flex items-center gap-2"><input data-testid={`check-idp-${driverId}`} type="checkbox" checked={check.idp} onChange={(event) => setDriverChecks((old) => ({ ...old, [driverId]: { ...check, idp: event.target.checked } }))} />Original IDP checked</label>}
          </div>
        </div>;
      })}
    </section>}
    {mode === "pickup" && <section className="space-y-3 rounded-lg border p-4">
      <h3 className="font-semibold">Rental agreement and vehicle identity</h3>
      <label className="flex items-start gap-2 text-sm"><input data-testid={`check-agreement-${id}`} className="mt-1" type="checkbox" checked={agreementAccepted} onChange={(event) => setAgreementAccepted(event.target.checked)} />Customer accepted the rental agreement in person.</label>
      <label className="block space-y-1.5 text-sm font-medium">Agreement/signature reference
      <input data-testid={`input-agreement-reference-${id}`} className="h-11 w-full rounded-md border px-3" required maxLength={1000} value={signatureReference} onChange={(event) => setSignatureReference(event.target.value)} placeholder="Document or signed agreement reference" />
      </label>
      <label className="flex items-start gap-2 text-sm"><input data-testid={`check-vehicle-identity-${id}`} className="mt-1" type="checkbox" checked={vehicleIdentityConfirmed} onChange={(event) => setVehicleIdentityConfirmed(event.target.checked)} />Vehicle identity and registration match the reservation.</label>
    </section>}
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block space-y-1.5 text-sm font-medium">{mode === "pickup" ? "Pickup odometer" : "Return odometer"}
        <input data-testid={`input-odometer-${id}`} className="h-11 w-full rounded-md border px-3" type="number" min="0" step="1" required value={odometer} onChange={(event) => setOdometer(event.target.value)} />
      </label>
      <label className="block space-y-1.5 text-sm font-medium">Fuel level
        <select data-testid={`select-fuel-${id}`} className="h-11 w-full rounded-md border bg-white px-3" value={fuelLevel} onChange={(event) => setFuelLevel(event.target.value)}>{fuelLevels.map((level) => <option key={level} value={level}>{level}</option>)}</select>
      </label>
    </div>
    <EvidenceFields {...{ id, location, setLocation, equipment, setEquipment, exterior, setExterior, interior, setInterior }} />
    {mode === "return" && <>
      <Checklist missing={missing} title="Return inspection checklist" />
      <section className="space-y-3 rounded-lg border p-4">
        <h3 className="font-semibold">Discrepancy and provisional charges</h3>
        <p className="text-sm text-slate-600">Record condition differences from pickup. Any amount entered is provisional, is not collected here, and must be reviewed before final settlement.</p>
        {charges.map((charge, index) => <div key={charge.key} className="space-y-3 rounded-md border p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm font-medium">Charge code<input data-testid={`input-charge-code-${id}-${index}`} className="h-11 w-full rounded-md border px-3" maxLength={100} value={charge.code} onChange={(event) => setCharges((current) => current.map((item) => item.key === charge.key ? { ...item, code: event.target.value } : item))} placeholder="e.g. fuel, cleaning, damage" /></label>
            <label className="space-y-1.5 text-sm font-medium">Provisional amount (JPY)<input data-testid={`input-charge-amount-${id}-${index}`} className="h-11 w-full rounded-md border px-3" type="number" min="0" step="1" value={charge.amount} onChange={(event) => setCharges((current) => current.map((item) => item.key === charge.key ? { ...item, amount: event.target.value } : item))} /></label>
          </div>
          <label className="block space-y-1.5 text-sm font-medium">Discrepancy / charge description
            <textarea data-testid={`input-charge-description-${id}-${index}`} className="min-h-20 w-full rounded-md border px-3 py-2" maxLength={2000} value={charge.description} onChange={(event) => setCharges((current) => current.map((item) => item.key === charge.key ? { ...item, description: event.target.value } : item))} placeholder="Describe condition differences or the reason for a provisional amount" />
          </label>
          {charges.length > 1 && <button data-testid={`button-remove-charge-${id}-${index}`} type="button" className="text-sm text-red-700 underline" onClick={() => setCharges((current) => current.filter((item) => item.key !== charge.key))}>Remove charge</button>}
        </div>)}
        <button data-testid={`button-add-charge-${id}`} type="button" className="min-h-10 rounded-md border px-4 text-sm font-medium" onClick={() => { setCharges((current) => [...current, { key: nextChargeKey, code: "", amount: "", description: "" }]); setNextChargeKey((key) => key + 1); }}>Add provisional charge</button>
        <label className="block space-y-1.5 text-sm font-medium">Damage location, if applicable<input data-testid={`input-damage-location-${id}`} className="h-11 w-full rounded-md border px-3" maxLength={200} value={damageLocation} onChange={(event) => setDamageLocation(event.target.value)} /></label>
      </section>
    </>}
    <label className="block space-y-1.5 text-sm font-medium">Damage / discrepancy notes
      <textarea data-testid={`input-damage-description-${id}`} className="min-h-20 w-full rounded-md border px-3 py-2" maxLength={2000} value={damageDescription} onChange={(event) => setDamageDescription(event.target.value)} placeholder={mode === "pickup" ? "Document pre-existing damage, or leave blank" : "Document new damage or other discrepancies, or leave blank"} />
    </label>
    <label className="block space-y-1.5 text-sm font-medium">Staff notes (optional)
      <textarea data-testid={`input-trip-notes-${id}`} className="min-h-20 w-full rounded-md border px-3 py-2" maxLength={5000} value={notes} onChange={(event) => setNotes(event.target.value)} />
    </label>
    {error && <p data-testid={`status-trip-error-${id}`} role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <button data-testid={`button-submit-${mode}-${id}`} type="submit" disabled={action.isPending} className="min-h-12 w-full rounded-md bg-slate-900 px-5 text-base font-semibold text-white disabled:opacity-50">
      {action.isPending ? "Uploading private evidence and saving…" : mode === "pickup" ? "Complete pickup inspection" : "Complete return inspection"}
    </button>
    {completed && <p role="status" className="text-sm text-emerald-800">Inspection already recorded at {completed.completedAt ? new Date(completed.completedAt).toLocaleString() : "—"}.</p>}
  </form>;
}

export function TripRecordSummary({ trip }: { trip: TripData }) {
  const inspections: Array<[string, Inspection | undefined]> = [["Pickup", trip.pickup], ["Return", trip.return]];
  return <div className="space-y-5">
    {inspections.map(([title, inspection]) => <section key={title} className="rounded-lg border p-4">
      <h3 className="font-semibold">{title}</h3>
      {inspection ? <dl className="mt-2 grid gap-x-5 gap-y-1 text-sm sm:grid-cols-2">
        <dt className="text-slate-500">Recorded</dt><dd>{inspection.completedAt ? new Date(inspection.completedAt).toLocaleString() : "—"}</dd>
        <dt className="text-slate-500">Odometer</dt><dd>{inspection.mileage ?? "—"}</dd>
        <dt className="text-slate-500">Fuel</dt><dd>{inspection.fuelLevel ?? "—"}</dd>
        <dt className="text-slate-500">Location</dt><dd>{inspection.location ?? "—"}</dd>
        {inspection.photos?.map((photo: Record<string, any>, index: number) => <a key={`${photo.type}-${index}`} className="text-amber-800 underline" href={photo.contentPath} target="_blank" rel="noreferrer">{photo.type} evidence</a>)}
      </dl> : <p className="mt-2 text-sm text-slate-500">Not recorded yet.</p>}
    </section>)}
  </div>;
}

export function Ledger({ ledger = [] }: { ledger?: Array<Record<string, any>> }) {
  if (!ledger.length) return <p className="text-sm text-slate-600">No trip ledger entries yet.</p>;
  return <section className="rounded-lg border">
    <h3 className="border-b p-4 font-semibold">Trip ledger</h3>
    <ul className="divide-y">
      {ledger.map((entry, index) => <li key={entry.id ?? `${entry.entryType}-${index}`} className="flex flex-wrap justify-between gap-2 p-4 text-sm">
        <span>{entry.description ?? entry.entryType ?? "Ledger entry"} <span className="text-slate-500">· {entry.status ?? "recorded"}</span></span>
        <strong>{money(entry.amount)}</strong>
      </li>)}
    </ul>
    <p className="px-4 pb-4 text-xs text-slate-500">Entries are ledger records. A charge is not represented as collected unless the ledger explicitly confirms paid or collected status.</p>
  </section>;
}

export function TripPageFrame({ id, children, href }: { id: number; children: ReactNode; href: string }) {
  return <main className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
    <Link href={href} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-950"><ArrowLeft className="h-4 w-4" />Back to reservation #{id}</Link>
    {children}
  </main>;
}