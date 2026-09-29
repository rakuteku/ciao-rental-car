import { useState } from "react";
import { useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { usePartnerReservationTrip } from "@/hooks/use-rental-operations";
import { TripPageFrame, TripRecordSummary, TripWorkflow } from "@/components/rental/TripWorkflow";
import { partnerRequest } from "./shared";

function DriverDocumentReview({ id, trip }: { id: number; trip: Record<string, any> }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");
  const drivers = Array.isArray(trip.drivers) ? trip.drivers : [];
  const documents = Array.isArray(trip.documents)
    ? trip.documents
    : drivers.flatMap((driver: Record<string, any>) => (Array.isArray(driver.documents) ? driver.documents : []).map((doc: Record<string, any>) => ({ ...doc, driverName: driver.fullName, driverId: driver.id })));

  const review = async (documentId: number, status: "approved" | "rejected" | "resubmit_required") => {
    setBusy(documentId);
    setError("");
    try {
      await partnerRequest(`/api/partner/rental/reservations/${id}/driver-documents/${documentId}/review`, {
        method: "POST",
        body: JSON.stringify({ status, operatorNotes: notes[documentId]?.trim() || undefined }),
      });
      await queryClient.invalidateQueries({ queryKey: ["partner", "rental", "reservations", id, "trip"] });
      await queryClient.invalidateQueries({ queryKey: ["partner", "rental", "reservations"] });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not update document review.");
    } finally {
      setBusy(null);
    }
  };

  return <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
    <div>
      <h2 className="text-lg font-semibold">Driver document review</h2>
      <p className="mt-1 text-sm text-slate-600">Review private uploads separately for every authorized driver. Approval confirms the uploaded document only; staff must still inspect originals in person before pickup.</p>
    </div>
    {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {!documents.length ? <p className="rounded-lg border border-dashed p-4 text-sm text-slate-600">No driver documents are attached to the trip response yet. Ask each authorized driver to submit a private document from their booking page, then refresh.</p>
      : <div className="space-y-3">{documents.map((doc: Record<string, any>, index: number) => {
        const documentId = Number(doc.id);
        const driverName = doc.driverName ?? drivers.find((driver: Record<string, any>) => Number(driver.id) === Number(doc.driverId))?.fullName ?? `Driver #${doc.driverId ?? "—"}`;
        return <article key={doc.id ?? index} data-testid={`card-driver-document-${doc.id ?? index}`} className="rounded-lg border p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold">{driverName} · {String(doc.docType ?? "Document").replaceAll("_", " ")}</p>
              <p className="mt-1 text-xs text-slate-600">Review status: <strong>{doc.status ?? "submitted"}</strong>{doc.createdAt ? ` · Submitted ${new Date(doc.createdAt).toLocaleString()}` : ""}</p>
            </div>
            <a data-testid={`link-private-driver-document-${doc.id ?? index}`} className="text-sm font-medium text-amber-800 underline" href={`/api/partner/rental/reservations/${id}/driver-documents/${documentId}/content`} target="_blank" rel="noreferrer">Open private document</a>
          </div>
          <label className="mt-3 block space-y-1 text-sm font-medium">Review note
            <textarea data-testid={`input-driver-document-note-${documentId}`} className="min-h-16 w-full rounded-md border px-3 py-2" value={notes[documentId] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [documentId]: event.target.value }))} placeholder="Optional note for the customer" />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button data-testid={`button-approve-driver-document-${documentId}`} type="button" disabled={!documentId || busy === documentId || doc.status === "approved"} onClick={() => void review(documentId, "approved")} className="min-h-10 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white disabled:opacity-50">{busy === documentId ? "Saving…" : "Approve"}</button>
            <button data-testid={`button-resubmit-driver-document-${documentId}`} type="button" disabled={!documentId || busy === documentId} onClick={() => void review(documentId, "resubmit_required")} className="min-h-10 rounded-md border px-4 text-sm font-medium disabled:opacity-50">Request replacement</button>
            <button data-testid={`button-reject-driver-document-${documentId}`} type="button" disabled={!documentId || busy === documentId} onClick={() => void review(documentId, "rejected")} className="min-h-10 rounded-md border border-red-300 px-4 text-sm font-medium text-red-800 disabled:opacity-50">Reject</button>
          </div>
        </article>;
      })}</div>}
  </section>;
}

export function PartnerReservationTripPage() {
  const params = useParams();
  const id = Number(params.id);
  const query = usePartnerReservationTrip(id);
  if (!Number.isInteger(id) || id < 1) return <main className="p-8">Invalid reservation ID.</main>;
  if (query.isLoading) return <main role="status" className="p-8">Loading trip details…</main>;
  if (query.isError || !query.data) return <main role="alert" className="p-8 text-red-800">{query.error instanceof Error ? query.error.message : "Reservation not found or unavailable to this operator."}</main>;

  const trip = query.data as any;
  const reservation = trip.reservation ?? {};
  const mode: "pickup" | "return" | "close" = reservation.status === "return_completed" || reservation.status === "closed"
    ? "close"
    : trip.pickup && !trip.return ? "return" : "pickup";
  return <TripPageFrame id={id} href="/partner/reservations">
    <header className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-amber-700">Partner trip record</p>
          <h1 data-testid={`text-trip-reservation-${id}`} className="mt-2 font-serif text-2xl font-bold">Reservation #{id}</h1>
          <p className="mt-1 text-sm text-slate-600">{reservation.status} · {reservation.paymentStatus ? `Payment: ${reservation.paymentStatus}` : "Payment status unavailable"}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${trip.readiness?.ready ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
          {trip.readiness?.ready ? "Pickup ready" : `${(trip.readiness?.missing ?? []).length} pickup item(s) outstanding`}
        </span>
      </div>
      <dl className="mt-4 grid gap-4 border-t pt-4 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-500">Vehicle</dt><dd className="font-medium">{[trip.vehicle?.make, trip.vehicle?.model, trip.vehicle?.registration].filter(Boolean).join(" · ") || "Vehicle details unavailable"}</dd></div>
        <div><dt className="text-slate-500">Driver(s)</dt><dd className="font-medium">{(trip.drivers ?? []).map((driver: any) => driver.fullName).filter(Boolean).join(", ") || "No driver details"}</dd></div>
        <div><dt className="text-slate-500">Pickup</dt><dd>{reservation.pickupAt ? new Date(reservation.pickupAt).toLocaleString() : "—"} · {reservation.pickupLocation ?? "—"}</dd></div>
        <div><dt className="text-slate-500">Return</dt><dd>{reservation.returnAt ? new Date(reservation.returnAt).toLocaleString() : "—"} · {reservation.returnLocation ?? "—"}</dd></div>
      </dl>
    </header>
    <DriverDocumentReview id={id} trip={trip} />
    <section className="space-y-5 rounded-xl border bg-white p-5 shadow-sm">
      {mode === "pickup" && <TripWorkflow id={id} scope="partner" trip={trip} mode="pickup" />}
      {mode === "return" && <TripWorkflow id={id} scope="partner" trip={trip} mode="return" />}
      {mode === "close" && <TripWorkflow id={id} scope="partner" trip={trip} mode="close" />}
    </section>
    <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Inspection history</h2>
      <TripRecordSummary trip={trip} />
    </section>
  </TripPageFrame>;
}