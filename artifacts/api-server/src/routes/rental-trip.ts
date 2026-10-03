import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  rentalDamagesTable,
  rentalDriverDocumentsTable,
  rentalDriversTable,
  rentalInspectionAccessTable,
  rentalInspectionPhotosTable,
  rentalInspectionsTable,
  rentalOperatorsTable,
  rentalAuditLogTable,
  rentalPaymentsTable,
  rentalOperatorStaffTable,
  rentalReservationDriversTable,
  rentalReservationsTable,
  rentalTripLedgerTable,
  rentalTripChargeApprovalsTable,
  rentalTripUploadsTable,
  rentalVehiclesTable,
} from "@workspace/db";
import { requireAdminAuth } from "../middlewares/admin-auth";
import { isRentalMarketplaceEnabled } from "../middlewares/operator-auth";
import { authenticatePartner, partnerIdentity } from "./partner";
import {
  createRentalDocumentToken,
  receiveRentalInspectionUpload,
  rentalInspectionObjectName,
  streamRentalInspectionEvidence,
  rentalDocumentObjectName,
  streamRentalDocument,
} from "../lib/rental-private-documents";
import { parseRentalPrivateReference } from "../lib/rental-private-document-policy.mjs";
import { calculateTripSettlement } from "../lib/rental-trip-settlement";

const router: IRouter = Router();
router.use((_req, res, next) => {
  if (!isRentalMarketplaceEnabled()) {
    // Leave unrelated rental routes mounted after this router available.
    next("router");
    return;
  }
  next();
});
const idSchema = z.coerce.number().int().positive();
const FuelSchema = z.enum(["Full", "3/4", "1/2", "1/4", "Empty"]);
const DamageSchema = z.object({
  location: z.string().trim().max(200).optional(),
  description: z.string().trim().min(1).max(2000),
}).strict();
const PickupSchema = z.object({
  drivers: z.array(z.object({
    driverId: z.number().int().positive(),
    originalsVerified: z.boolean(),
    licenseOriginalVerified: z.boolean().optional(),
    identityOriginalVerified: z.boolean().optional(),
    idpRequired: z.boolean().optional(),
    idpOriginalVerified: z.boolean().optional(),
  }).strict()).min(1).max(12),
  agreementAccepted: z.literal(true),
  signatureReference: z.string().trim().min(1).max(1000),
  vehicleIdentity: z.string().trim().min(1).max(300),
  actualAt: z.string().datetime({ offset: true }),
  location: z.string().trim().min(1).max(500),
  mileage: z.number().int().nonnegative(),
  fuelLevel: FuelSchema,
  equipment: z.array(z.string().trim().min(1).max(200)).min(1).max(100),
  exteriorPhotos: z.array(z.string().uuid()).min(1).max(20),
  interiorPhotos: z.array(z.string().uuid()).min(1).max(20),
  damageNotes: z.array(DamageSchema).max(100),
  notes: z.string().max(5000).optional(),
}).strict();
const ReturnSchema = z.object({
  actualAt: z.string().datetime({ offset: true }),
  location: z.string().trim().min(1).max(500),
  mileage: z.number().int().nonnegative(),
  fuelLevel: FuelSchema,
  equipment: z.array(z.string().trim().min(1).max(200)).min(1).max(100),
  exteriorPhotos: z.array(z.string().uuid()).min(1).max(20),
  interiorPhotos: z.array(z.string().uuid()).min(1).max(20),
  damageNotes: z.array(DamageSchema).max(100),
  notes: z.string().max(5000).optional(),
  additionalCharges: z.record(z.string().trim().min(1).max(100), z.coerce.number().int().nonnegative()).default({}),
}).strict();
const CloseSchema = z.object({
  approvedExtras: z.record(z.string().trim().min(1).max(100), z.coerce.number().int().nonnegative()).optional(),
  approvedRefund: z.coerce.number().int().nonnegative().optional(),
}).strict();
const ChargeAcknowledgeSchema = z.object({
  charges: z.array(z.object({
    code: z.string().trim().min(1).max(100),
    amount: z.number().int().positive(),
  }).strict()).min(1).max(30),
}).strict();
const PhotoRequestSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png"]),
}).strict();
const PartnerDocumentReviewSchema = z.object({
  status: z.enum(["approved", "rejected", "resubmit_required"]),
  operatorNotes: z.string().trim().max(5000).nullable().optional(),
}).strict();

function marketplace(reservation: typeof rentalReservationsTable.$inferSelect): boolean {
  return reservation.source === "marketplace_request";
}

async function getReservation(id: number) {
  const [reservation] = await db.select().from(rentalReservationsTable).where(and(
    eq(rentalReservationsTable.id, id),
    isNull(rentalReservationsTable.deletedAt),
  ));
  return reservation ?? null;
}

async function authorizedDrivers(reservationId: number) {
  let links = await db.select().from(rentalReservationDriversTable)
    .where(eq(rentalReservationDriversTable.reservationId, reservationId));
  if (!links.length) {
    const [reservation] = await db.select().from(rentalReservationsTable)
      .where(eq(rentalReservationsTable.id, reservationId));
    if (reservation?.primaryDriverId) {
      await db.insert(rentalReservationDriversTable).values({
        reservationId, driverId: reservation.primaryDriverId, isPrimary: true,
      }).onConflictDoNothing();
      links = await db.select().from(rentalReservationDriversTable)
        .where(eq(rentalReservationDriversTable.reservationId, reservationId));
    }
  }
  const allDrivers = links.length ? await db.select().from(rentalDriversTable)
    .where(inArray(rentalDriversTable.id, links.map((link) => link.driverId))) : [];
  const byId = new Map(allDrivers.map((driver) => [driver.id, driver]));
  return links.map((link) => ({ ...link, driver: byId.get(link.driverId) ?? null }));
}

async function readiness(reservation: typeof rentalReservationsTable.$inferSelect) {
  const drivers = await authorizedDrivers(reservation.id);
  const pickup = (await db.select().from(rentalInspectionsTable).where(and(
    eq(rentalInspectionsTable.reservationId, reservation.id),
    eq(rentalInspectionsTable.type, "pickup"),
  )))[0] ?? null;
  const returned = (await db.select().from(rentalInspectionsTable).where(and(
    eq(rentalInspectionsTable.reservationId, reservation.id),
    eq(rentalInspectionsTable.type, "return"),
  )))[0] ?? null;
  const pickupPhotos = pickup ? await db.select().from(rentalInspectionPhotosTable).where(eq(rentalInspectionPhotosTable.inspectionId, pickup.id)) : [];
  const returnPhotos = returned ? await db.select().from(rentalInspectionPhotosTable).where(eq(rentalInspectionPhotosTable.inspectionId, returned.id)) : [];
  const missingPickup: string[] = [];
  if (reservation.paymentStatus !== "paid") missingPickup.push("paymentPaid");
  if (!drivers.length) missingPickup.push("authorizedDrivers");
  for (const entry of drivers) {
    const driverId = entry.driverId;
    if (!entry.originalLicenseVerifiedAt) missingPickup.push(`driver:${driverId}:originalLicense`);
    if (!entry.originalIdentityVerifiedAt) missingPickup.push(`driver:${driverId}:originalIdentity`);
    const idpRequired = entry.originalsEvidence?.idpRequired === "true";
    if (idpRequired && !entry.originalInternationalPermitVerifiedAt) {
      missingPickup.push(`driver:${driverId}:originalInternationalPermit`);
    }
  }
  if (!pickup?.agreementAccepted) missingPickup.push("agreementAccepted");
  if (!pickup?.signatureReference) missingPickup.push("signatureReference");
  if (!pickup?.vehicleIdentity) missingPickup.push("vehicleIdentity");
  if (!pickup?.actualAt) missingPickup.push("actualAt");
  if (!pickup?.location) missingPickup.push("location");
  if (pickup?.mileage == null) missingPickup.push("mileage");
  if (!pickup?.fuelLevel) missingPickup.push("fuelLevel");
  if (!pickup?.equipment?.length) missingPickup.push("equipment");
  if (!pickupPhotos.some((photo) => photo.type === "exterior")) missingPickup.push("exteriorPhotos");
  if (!pickupPhotos.some((photo) => photo.type === "interior")) missingPickup.push("interiorPhotos");
  const missingReturn: string[] = [];
  if (!returned?.actualAt) missingReturn.push("actualAt");
  if (!returned?.location) missingReturn.push("location");
  if (returned?.mileage == null) missingReturn.push("mileage");
  if (!returned?.fuelLevel) missingReturn.push("fuelLevel");
  if (!returned?.equipment?.length) missingReturn.push("equipment");
  if (!returnPhotos.some((photo) => photo.type === "exterior")) missingReturn.push("exteriorPhotos");
  if (!returnPhotos.some((photo) => photo.type === "interior")) missingReturn.push("interiorPhotos");
  return { drivers, pickup, returned, missingPickup, missingReturn };
}

function serializeInspection(inspection: typeof rentalInspectionsTable.$inferSelect | null, photos: Array<typeof rentalInspectionPhotosTable.$inferSelect>, damages: Array<typeof rentalDamagesTable.$inferSelect>, reservationId: number) {
  if (!inspection) return null;
  return {
    ...inspection,
    actualAt: inspection.actualAt?.toISOString() ?? null,
    completedAt: inspection.completedAt?.toISOString() ?? null,
    retentionUntil: inspection.retentionUntil?.toISOString() ?? null,
    photos: photos.map((photo) => ({
      type: photo.type,
      caption: photo.caption,
      contentPath: photo.storageKey ? `/api/rental/inspection-evidence/${reservationId}/${photo.storageKey}` : null,
    })),
    damageNotes: damages.map(({ location, description }) => ({ location, description })),
  };
}

async function tripData(reservation: typeof rentalReservationsTable.$inferSelect, actor: { type: string; id: string }) {
  const state = await readiness(reservation);
  const [vehicle] = await db.select().from(rentalVehiclesTable).where(eq(rentalVehiclesTable.id, reservation.vehicleId));
  const [operator] = reservation.operatorId ? await db.select().from(rentalOperatorsTable).where(eq(rentalOperatorsTable.id, reservation.operatorId)) : [];
  const documents = await db.select().from(rentalDriverDocumentsTable)
    .where(eq(rentalDriverDocumentsTable.reservationId, reservation.id));
  const publicDocumentMetadata = documents.map((document) => {
    const hasPrivateFile = !!parseRentalPrivateReference(document.fileUrl);
    return {
      id: document.id,
      driverId: document.driverId,
      docType: document.docType,
      status: document.status,
      expiryDate: document.expiryDate,
      operatorNotes: document.adminNotes,
      createdAt: document.createdAt.toISOString(),
      reviewedAt: document.reviewedAt?.toISOString() ?? null,
      fileAvailable: hasPrivateFile,
      contentPath: hasPrivateFile
        ? `/api/${actor.type === "admin" ? "admin" : "partner"}/rental/reservations/${reservation.id}/driver-documents/${document.id}/content`
        : null,
    };
  });
  const inspections = [state.pickup, state.returned].filter((item): item is NonNullable<typeof item> => !!item);
  if (inspections.length) {
    await db.insert(rentalInspectionAccessTable).values(inspections.map((inspection) => ({
      inspectionId: inspection.id,
      actorType: actor.type,
      actorId: actor.id,
    })));
  }
  const pickupPhotos = state.pickup ? await db.select().from(rentalInspectionPhotosTable).where(eq(rentalInspectionPhotosTable.inspectionId, state.pickup.id)) : [];
  const returnPhotos = state.returned ? await db.select().from(rentalInspectionPhotosTable).where(eq(rentalInspectionPhotosTable.inspectionId, state.returned.id)) : [];
  const pickupDamage = state.pickup ? await db.select().from(rentalDamagesTable).where(eq(rentalDamagesTable.inspectionId, state.pickup.id)) : [];
  const returnDamage = state.returned ? await db.select().from(rentalDamagesTable).where(eq(rentalDamagesTable.inspectionId, state.returned.id)) : [];
  const ledger = await db.select().from(rentalTripLedgerTable)
    .where(eq(rentalTripLedgerTable.reservationId, reservation.id)).orderBy(rentalTripLedgerTable.createdAt);
  const [payment] = await db.select().from(rentalPaymentsTable)
    .where(eq(rentalPaymentsTable.reservationId, reservation.id));
  const provisionalRows = (state.returned?.discrepancies ?? []).filter((item) => item.kind === "provisional_charge");
  const approvals = await db.select().from(rentalTripChargeApprovalsTable)
    .where(eq(rentalTripChargeApprovalsTable.reservationId, reservation.id));
  const approvalByCode = new Map(approvals.map((approval) => [approval.code, approval]));
  const provisionalCharges = provisionalRows.map((item) => ({
    ...item,
    customerAcknowledged: typeof item.code === "string" && approvalByCode.has(item.code),
  }));
  return {
    reservation: {
      id: reservation.id,
      status: reservation.status,
      paymentStatus: reservation.paymentStatus,
      pickupAt: reservation.pickupAt.toISOString(),
      returnAt: reservation.returnAt.toISOString(),
      pickupLocation: reservation.pickupLocation,
      returnLocation: reservation.returnLocation,
      finalTotal: reservation.finalTotal,
      outstanding: reservation.outstanding,
      currency: "jpy",
    },
    drivers: state.drivers.map(({ driver, originalsVerifiedAt }) => ({
      id: driver?.id,
      fullName: driver?.fullName,
      originalsVerifiedAt: originalsVerifiedAt?.toISOString() ?? null,
      documents: publicDocumentMetadata.filter((document) => document.driverId === driver?.id),
    })),
    documents: publicDocumentMetadata,
    pickup: serializeInspection(state.pickup, pickupPhotos, pickupDamage, reservation.id),
    return: serializeInspection(state.returned, returnPhotos, returnDamage, reservation.id),
    missingPickup: state.missingPickup,
    missingReturn: state.missingReturn,
    ledger,
    paymentSnapshot: payment ? {
      amount: payment.amount,
      refundedAmount: payment.refundedAmount,
      commissionAmount: payment.commissionAmount,
      operatorShareAmount: payment.operatorShareAmount,
      commissionBasisPoints: payment.commissionBasisPoints,
      paidAmount: reservation.paidAmount,
    } : null,
    provisionalCharges,
    operatorContact: operator ? { name: operator.name, email: operator.contactEmail, phone: operator.contactPhone } : null,
    readiness: { ready: state.missingPickup.length === 0, missing: state.missingPickup },
    vehicle: vehicle ? { id: vehicle.id, make: vehicle.brand, model: vehicle.model, registration: vehicle.plate } : null,
  };
}

export async function getCustomerTripData(reservation: typeof rentalReservationsTable.$inferSelect, email: string) {
  const [customer] = reservation.primaryDriverId
    ? await db.select().from(rentalDriversTable).where(and(
      eq(rentalDriversTable.id, reservation.primaryDriverId),
      eq(rentalDriversTable.email, email),
    ))
    : [];
  if (!customer || !marketplace(reservation)) return null;
  const trip = await tripData(reservation, { type: "customer", id: email });
  return {
    pickup: trip.pickup,
    return: trip.return,
    ledger: trip.ledger
      .filter((entry) => !entry.entryType.endsWith("platform_commission") && !entry.entryType.endsWith("operator_share"))
      .map(({ savedTerms: _savedTerms, operatorId: _operatorId, ...entry }) => entry),
    provisionalCharges: trip.provisionalCharges,
    operatorContact: trip.operatorContact,
  };
}

router.post("/rental/my-bookings/:id/charges/acknowledge", async (req, res): Promise<void> => {
  const id = idSchema.safeParse(req.params.id);
  const parsed = ChargeAcknowledgeSchema.safeParse(req.body);
  const session = req.session as unknown as Record<string, unknown>;
  const email = typeof session.rentalCustomerEmail === "string" ? session.rentalCustomerEmail.trim().toLowerCase() : "";
  if (!id.success || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "Invalid reservation ID" : parsed.error.message });
    return;
  }
  if (!email || (session.rentalCustomerBookingId != null && session.rentalCustomerBookingId !== id.data)) {
    res.status(401).json({ error: "Please look up this booking first" });
    return;
  }
  try {
    await db.transaction(async (tx) => {
      const [reservation] = await tx.select().from(rentalReservationsTable).where(and(
        eq(rentalReservationsTable.id, id.data),
        isNull(rentalReservationsTable.deletedAt),
      )).for("update");
      if (!reservation || !marketplace(reservation) || reservation.status !== "return_completed") {
        throw new Error("This booking is not accepting customer charge acknowledgements");
      }
      const [driver] = reservation.primaryDriverId ? await tx.select().from(rentalDriversTable).where(and(
        eq(rentalDriversTable.id, reservation.primaryDriverId),
        eq(rentalDriversTable.email, email),
      )) : [];
      if (!driver) throw new Error("Booking not found");
      const [returned] = await tx.select().from(rentalInspectionsTable).where(and(
        eq(rentalInspectionsTable.reservationId, id.data),
        eq(rentalInspectionsTable.type, "return"),
      ));
      const provisional = new Map<string, number>();
      for (const item of returned?.discrepancies ?? []) {
        if (item.kind === "provisional_charge" && typeof item.code === "string" && typeof item.amount === "number") {
          provisional.set(item.code, item.amount);
        }
      }
      const prior = await tx.select().from(rentalTripChargeApprovalsTable)
        .where(eq(rentalTripChargeApprovalsTable.reservationId, id.data));
      const priorByCode = new Map(prior.map((approval) => [approval.code, approval]));
      for (const charge of parsed.data.charges) {
        if (provisional.get(charge.code) !== charge.amount || charge.amount <= 0) {
          throw new Error(`Charge ${charge.code} does not match the provisional return claim`);
        }
        const existing = priorByCode.get(charge.code);
        if (existing && (existing.amount !== charge.amount || existing.customerDriverId !== driver.id)) {
          throw new Error(`Charge ${charge.code} was previously acknowledged with different terms`);
        }
        if (!existing) {
          await tx.insert(rentalTripChargeApprovalsTable).values({
            reservationId: id.data,
            customerDriverId: driver.id,
            code: charge.code,
            amount: charge.amount,
          });
        }
      }
    });
    const approvals = await db.select().from(rentalTripChargeApprovalsTable)
      .where(eq(rentalTripChargeApprovalsTable.reservationId, id.data));
    res.json({ acknowledged: approvals.map(({ code, amount, acknowledgedAt }) => ({
      code, amount, acknowledgedAt: acknowledgedAt.toISOString(),
    })) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Charge acknowledgement could not be saved";
    res.status(message === "Booking not found" ? 404 : 409).json({ error: message });
  }
});

async function assertUploadedPhotos(reservationId: number, tokens: string[]) {
  const uniqueTokens = [...new Set(tokens)];
  if (uniqueTokens.length !== tokens.length) throw new Error("Duplicate inspection photo references are not allowed");
  if (!uniqueTokens.length) return;
  const rows = await db.select().from(rentalTripUploadsTable).where(and(
    eq(rentalTripUploadsTable.reservationId, reservationId),
    inArray(rentalTripUploadsTable.token, uniqueTokens),
  ));
  if (rows.length !== uniqueTokens.length || rows.some((row) => !row.uploadedAt || row.expiresAt <= new Date())) {
    throw new Error("Every photo must be uploaded privately before inspection submission");
  }
}

async function insertInspectionPhotos(tx: Pick<typeof db, "insert" | "delete">, inspectionId: number, exterior: string[], interior: string[], retentionUntil: Date) {
  const all = [
    ...exterior.map((token) => ({ token, type: "exterior" as const })),
    ...interior.map((token) => ({ token, type: "interior" as const })),
  ];
  if (all.length) {
    await tx.insert(rentalInspectionPhotosTable).values(all.map(({ token, type }) => ({
      inspectionId,
      type,
      url: "private",
      storageKey: token,
      retentionUntil,
    })));
    await tx.delete(rentalTripUploadsTable).where(inArray(rentalTripUploadsTable.token, all.map((photo) => photo.token)));
  }
}

function retentionDeadline() {
  const days = Number.parseInt(process.env.RENTAL_INSPECTION_EVIDENCE_RETENTION_DAYS ?? "365", 10);
  const safeDays = Number.isFinite(days) && days >= 1 && days <= 3650 ? days : 365;
  return new Date(Date.now() + safeDays * 86_400_000);
}

router.get("/partner/rental/reservations", authenticatePartner, async (req, res): Promise<void> => {
  const current = partnerIdentity(req);
  const reservations = await db.select().from(rentalReservationsTable).where(and(
    eq(rentalReservationsTable.operatorId, current.operatorId),
    eq(rentalReservationsTable.source, "marketplace_request"),
    isNull(rentalReservationsTable.deletedAt),
  )).orderBy(desc(rentalReservationsTable.pickupAt));
  const summaries = await Promise.all(reservations.map(async (reservation) => {
    const state = await readiness(reservation);
    return {
      reservation: {
        id: reservation.id, status: reservation.status, paymentStatus: reservation.paymentStatus,
        pickupAt: reservation.pickupAt.toISOString(), returnAt: reservation.returnAt.toISOString(),
        pickupLocation: reservation.pickupLocation, returnLocation: reservation.returnLocation,
      },
      readiness: { ready: state.missingPickup.length === 0, missing: state.missingPickup },
      drivers: state.drivers.map(({ driver, originalsVerifiedAt }) => ({
        id: driver?.id, fullName: driver?.fullName, originalsVerifiedAt: originalsVerifiedAt?.toISOString() ?? null,
      })),
      pickup: state.pickup ? { completedAt: state.pickup.completedAt?.toISOString() ?? null, mileage: state.pickup.mileage } : null,
      return: state.returned ? { completedAt: state.returned.completedAt?.toISOString() ?? null, mileage: state.returned.mileage } : null,
    };
  }));
  res.set("Cache-Control", "private, no-store");
  res.json(summaries);
});

async function partnerReservation(req: Parameters<Parameters<typeof router.get>[1]>[0], res: Parameters<Parameters<typeof router.get>[1]>[1]) {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) { res.status(400).json({ error: "Invalid reservation ID" }); return null; }
  const reservation = await getReservation(id.data);
  if (!reservation || !marketplace(reservation) || reservation.operatorId !== partnerIdentity(req).operatorId) {
    res.status(404).json({ error: "Reservation not found" }); return null;
  }
  return reservation;
}

function partnerCanManageTrip(req: Parameters<Parameters<typeof router.get>[1]>[0], res: Parameters<Parameters<typeof router.get>[1]>[1]): boolean {
  if (["owner", "manager", "operations"].includes(partnerIdentity(req).role)) return true;
  res.status(403).json({ error: "This staff role is read-only for rental handover and settlement" });
  return false;
}

router.get("/partner/rental/reservations/:id/trip", authenticatePartner, async (req, res): Promise<void> => {
  const reservation = await partnerReservation(req, res);
  if (!reservation) return;
  res.set("Cache-Control", "private, no-store");
  res.json(await tripData(reservation, { type: "partner", id: String(partnerIdentity(req).staffId) }));
});

router.get("/partner/rental/reservations/:id/driver-documents/:documentId/content", authenticatePartner, async (req, res): Promise<void> => {
  const reservation = await partnerReservation(req, res);
  const documentId = idSchema.safeParse(req.params.documentId);
  if (!reservation || !documentId.success) {
    if (!documentId.success) res.status(404).json({ error: "Document not found" });
    return;
  }
  const current = partnerIdentity(req);
  const [document] = await db.select().from(rentalDriverDocumentsTable).where(and(
    eq(rentalDriverDocumentsTable.id, documentId.data),
    eq(rentalDriverDocumentsTable.reservationId, reservation.id),
    eq(rentalDriverDocumentsTable.operatorId, current.operatorId),
  ));
  if (!document) { res.status(404).json({ error: "Document not found" }); return; }
  const links = await authorizedDrivers(reservation.id);
  if (!links.some((link) => link.driverId === document.driverId)) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  const token = parseRentalPrivateReference(document.fileUrl);
  if (!token) { res.status(404).json({ error: "Document not found" }); return; }
  await db.insert(rentalAuditLogTable).values({
    adminUser: `partner:${current.staffId}`,
    action: "partner_driver_document_access",
    recordType: "document",
    recordId: document.id,
    newValue: { reservationId: reservation.id, operatorId: current.operatorId },
  });
  res.set("Cache-Control", "private, no-store, max-age=0");
  try {
    await streamRentalDocument(rentalDocumentObjectName(reservation.id, token), res);
  } catch (error) {
    req.log.warn({ err: error, action: "partner_driver_document_stream_failed", reservationId: reservation.id, documentId: document.id });
    if (!res.headersSent) res.status(404).json({ error: "Document not found" });
    else res.destroy(error instanceof Error ? error : undefined);
  }
});

router.post("/partner/rental/reservations/:id/driver-documents/:documentId/review", authenticatePartner, async (req, res): Promise<void> => {
  const reservationId = idSchema.safeParse(req.params.id);
  const documentId = idSchema.safeParse(req.params.documentId);
  const parsed = PartnerDocumentReviewSchema.safeParse(req.body);
  if (!reservationId.success || !documentId.success || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "Invalid reservation or document ID" : parsed.error.message });
    return;
  }
  if (!partnerCanManageTrip(req, res)) return;
  const current = partnerIdentity(req);
  try {
    const document = await db.transaction(async (tx) => {
      const [reservation] = await tx.select().from(rentalReservationsTable)
        .where(eq(rentalReservationsTable.id, reservationId.data)).for("update");
      if (!reservation || !marketplace(reservation) || reservation.operatorId !== current.operatorId) return null;
      const [previous] = await tx.select().from(rentalDriverDocumentsTable).where(and(
        eq(rentalDriverDocumentsTable.id, documentId.data),
        eq(rentalDriverDocumentsTable.reservationId, reservation.id),
        eq(rentalDriverDocumentsTable.operatorId, current.operatorId),
      ));
      if (!previous || !["submitted", "under_review", "resubmit_required", "rejected"].includes(previous.status)) return null;
      const [updated] = await tx.update(rentalDriverDocumentsTable).set({
        status: parsed.data.status,
        ...(parsed.data.operatorNotes !== undefined ? { adminNotes: parsed.data.operatorNotes } : {}),
        reviewedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(rentalDriverDocumentsTable.id, previous.id)).returning();
      await tx.insert(rentalAuditLogTable).values({
        adminUser: `partner:${current.staffId}`,
        action: `partner_driver_document_${parsed.data.status}`,
        recordType: "document",
        recordId: previous.id,
        previousValue: { status: previous.status },
        newValue: { status: updated.status, reservationId: reservation.id, operatorId: current.operatorId },
      });
      return updated;
    });
    if (!document) { res.status(404).json({ error: "Document not found or is not reviewable" }); return; }
    res.json({
      id: document.id,
      driverId: document.driverId,
      docType: document.docType,
      status: document.status,
      expiryDate: document.expiryDate,
      operatorNotes: document.adminNotes,
      createdAt: document.createdAt.toISOString(),
      reviewedAt: document.reviewedAt?.toISOString() ?? null,
      fileAvailable: !!parseRentalPrivateReference(document.fileUrl),
      contentPath: parseRentalPrivateReference(document.fileUrl)
        ? `/api/partner/rental/reservations/${reservationId.data}/driver-documents/${document.id}/content`
        : null,
    });
  } catch (error) {
    req.log.error({ err: error, action: "partner_driver_document_review_failed", reservationId: reservationId.data, documentId: documentId.data });
    res.status(500).json({ error: "Document review could not be saved" });
  }
});

router.get("/admin/rental/reservations/:id/trip", requireAdminAuth, async (req, res): Promise<void> => {
  const id = idSchema.safeParse(req.params.id);
  const reservation = id.success ? await getReservation(id.data) : null;
  if (!reservation || !marketplace(reservation)) { res.status(404).json({ error: "Reservation not found" }); return; }
  const session = req.session as unknown as { admin?: { username?: string } };
  res.set("Cache-Control", "private, no-store");
  res.json(await tripData(reservation, { type: "admin", id: session.admin?.username ?? "admin" }));
});

async function createPickup(reservationId: number, payload: z.infer<typeof PickupSchema>, actorId: string) {
  await assertUploadedPhotos(reservationId, [...payload.exteriorPhotos, ...payload.interiorPhotos]);
  return db.transaction(async (tx) => {
    const [reservation] = await tx.select().from(rentalReservationsTable)
      .where(eq(rentalReservationsTable.id, reservationId)).for("update");
    if (!reservation || !marketplace(reservation)) throw new Error("Reservation not found");
    if (reservation.paymentStatus !== "paid") throw new Error("Payment must be paid before pickup");
    if (!["confirmed", "awaiting_pickup", "vehicle_dispatched"].includes(reservation.status)) {
      throw new Error(`Pickup is not allowed from ${reservation.status}`);
    }
    const [existing] = await tx.select().from(rentalInspectionsTable).where(and(
      eq(rentalInspectionsTable.reservationId, reservationId),
      eq(rentalInspectionsTable.type, "pickup"),
    ));
    if (existing) throw new Error("Pickup inspection is immutable and already completed");
    const links = await tx.select().from(rentalReservationDriversTable)
      .where(eq(rentalReservationDriversTable.reservationId, reservationId));
    if (!links.length || links.length !== payload.drivers.length ||
        links.some((link) => !payload.drivers.some((driver) => driver.driverId === link.driverId))) {
      throw new Error("Original document checklist must cover every authorized driver exactly once");
    }
    const verification = new Map<number, {
      license: boolean; identity: boolean; idpRequired: boolean; idp: boolean;
    }>();
    for (const driver of payload.drivers) {
      if (!driver.originalsVerified) throw new Error(`driver:${driver.driverId}:originalsNotVerified`);
      const license = driver.licenseOriginalVerified ?? driver.originalsVerified;
      const identity = driver.identityOriginalVerified ?? driver.originalsVerified;
      const idpRequired = driver.idpRequired ?? false;
      const idp = driver.idpOriginalVerified ?? driver.originalsVerified;
      if (!license) throw new Error(`driver:${driver.driverId}:originalLicense`);
      if (!identity) throw new Error(`driver:${driver.driverId}:originalIdentity`);
      if (idpRequired && !idp) throw new Error(`driver:${driver.driverId}:originalInternationalPermit`);
      verification.set(driver.driverId, { license, identity, idpRequired, idp });
    }
    const now = new Date();
    for (const driver of payload.drivers) {
      const checked = verification.get(driver.driverId)!;
      await tx.update(rentalReservationDriversTable).set({
        originalsVerifiedAt: checked.license && checked.identity && (!checked.idpRequired || checked.idp) ? now : null,
        originalsVerifiedBy: actorId,
        originalLicenseVerifiedAt: checked.license ? now : null,
        originalIdentityVerifiedAt: checked.identity ? now : null,
        originalInternationalPermitVerifiedAt: checked.idpRequired && checked.idp ? now : null,
        originalsEvidence: {
          license: checked.license ? "verified_in_person" : "not_verified",
          identity: checked.identity ? "verified_in_person" : "not_verified",
          internationalPermit: checked.idpRequired ? checked.idp ? "verified_in_person" : "not_verified" : "not_required",
          idpRequired: String(checked.idpRequired),
        },
      }).where(and(
        eq(rentalReservationDriversTable.reservationId, reservationId),
        eq(rentalReservationDriversTable.driverId, driver.driverId),
      ));
    }
    const retentionUntil = retentionDeadline();
    const [inspection] = await tx.insert(rentalInspectionsTable).values({
      reservationId, type: "pickup", mileage: payload.mileage, fuelLevel: payload.fuelLevel,
      notes: payload.notes ?? null, agreementAccepted: true, signatureReference: payload.signatureReference,
      vehicleIdentity: payload.vehicleIdentity, actualAt: new Date(payload.actualAt), location: payload.location,
      equipment: payload.equipment, completedAt: now, completedBy: actorId, retentionUntil,
    }).returning();
    await insertInspectionPhotos(tx, inspection.id, payload.exteriorPhotos, payload.interiorPhotos, retentionUntil);
    if (payload.damageNotes.length) await tx.insert(rentalDamagesTable).values(payload.damageNotes.map((damage) => ({
      inspectionId: inspection.id,
      description: damage.description,
      location: damage.location ?? null,
    })));
    await tx.update(rentalReservationsTable).set({ status: "in_rental", updatedAt: now })
      .where(eq(rentalReservationsTable.id, reservationId));
    await tx.update(rentalVehiclesTable).set({ operationalStatus: "in_use", updatedAt: now })
      .where(eq(rentalVehiclesTable.id, reservation.vehicleId));
    return inspection;
  });
}

router.post("/partner/rental/reservations/:id/pickup", authenticatePartner, async (req, res): Promise<void> => {
  const reservation = await partnerReservation(req, res);
  if (!reservation) return;
  if (!partnerCanManageTrip(req, res)) return;
  const parsed = PickupSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const inspection = await createPickup(reservation.id, parsed.data, String(partnerIdentity(req).staffId));
    const latest = await getReservation(reservation.id);
    res.status(201).json({ inspection, reservation: latest, ...(latest ? await readiness(latest).then((state) => ({ missingPickup: state.missingPickup })) : {}) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pickup could not be completed";
    res.status(message.includes("not found") ? 404 : 409).json({ error: message });
  }
});

router.post("/admin/rental/reservations/:id/pickup", requireAdminAuth, async (req, res, next): Promise<void> => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) { res.status(400).json({ error: "Invalid reservation ID" }); return; }
  const existingReservation = await getReservation(id.data);
  if (!existingReservation) { res.status(404).json({ error: "Reservation not found" }); return; }
  if (!marketplace(existingReservation)) { next(); return; }
  const parsed = PickupSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const actor = (req.session as unknown as { admin?: { username?: string } }).admin?.username ?? "admin";
  try {
    const inspection = await createPickup(id.data, parsed.data, actor);
    res.status(201).json({ inspection, reservation: await getReservation(id.data) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pickup could not be completed";
    res.status(message.includes("not found") ? 404 : 409).json({ error: message });
  }
});

async function createReturn(reservationId: number, payload: z.infer<typeof ReturnSchema>, actorId: string) {
  await assertUploadedPhotos(reservationId, [...payload.exteriorPhotos, ...payload.interiorPhotos]);
  return db.transaction(async (tx) => {
    const [reservation] = await tx.select().from(rentalReservationsTable)
      .where(eq(rentalReservationsTable.id, reservationId)).for("update");
    if (!reservation || !marketplace(reservation)) throw new Error("Reservation not found");
    if (!["in_rental", "overdue", "return_initiated"].includes(reservation.status)) {
      throw new Error(`Return is not allowed from ${reservation.status}`);
    }
    const [pickup] = await tx.select().from(rentalInspectionsTable).where(and(
      eq(rentalInspectionsTable.reservationId, reservationId), eq(rentalInspectionsTable.type, "pickup"),
    ));
    if (!pickup) throw new Error("A completed pickup inspection is required before return");
    const [existing] = await tx.select().from(rentalInspectionsTable).where(and(
      eq(rentalInspectionsTable.reservationId, reservationId), eq(rentalInspectionsTable.type, "return"),
    ));
    if (existing) throw new Error("Return inspection is immutable and already completed");
    const now = new Date();
    const retentionUntil = retentionDeadline();
    const pickupEquipment = pickup.equipment ?? [];
    const discrepancies: Array<Record<string, unknown>> = [];
    const returnedEquipment = new Set(payload.equipment);
    for (const equipment of pickupEquipment) {
      if (!returnedEquipment.has(equipment)) {
        discrepancies.push({
          kind: "condition_difference",
          category: "equipment",
          description: `Equipment missing at return: ${equipment}`,
        });
      }
    }
    for (const equipment of payload.equipment) {
      if (!pickupEquipment.includes(equipment)) {
        discrepancies.push({
          kind: "condition_difference",
          category: "equipment",
          description: `Equipment recorded at return but not pickup: ${equipment}`,
        });
      }
    }
    const pickupDamage = await tx.select().from(rentalDamagesTable).where(eq(rentalDamagesTable.inspectionId, pickup.id));
    const normalizedDamage = (location: string | null | undefined, description: string) =>
      `${(location ?? "").trim().toLowerCase()}|${description.trim().toLowerCase()}`;
    const pickupDamageSet = new Set(pickupDamage.map((damage) => normalizedDamage(damage.location, damage.description)));
    for (const damage of payload.damageNotes) {
      if (!pickupDamageSet.has(normalizedDamage(damage.location, damage.description))) {
        discrepancies.push({
          kind: "condition_difference",
          category: "damage",
          location: damage.location ?? null,
          description: damage.description,
        });
      }
    }
    const [inspection] = await tx.insert(rentalInspectionsTable).values({
      reservationId, type: "return", mileage: payload.mileage, fuelLevel: payload.fuelLevel,
      notes: payload.notes ?? null, actualAt: new Date(payload.actualAt), location: payload.location,
      equipment: payload.equipment,
      discrepancies: [
        ...discrepancies,
        ...Object.entries(payload.additionalCharges).filter(([, amount]) => amount > 0)
          .map(([code, amount]) => ({ kind: "provisional_charge", code, amount, status: "provisional" })),
      ],
      completedAt: now, completedBy: actorId, retentionUntil,
    }).returning();
    await insertInspectionPhotos(tx, inspection.id, payload.exteriorPhotos, payload.interiorPhotos, retentionUntil);
    if (payload.damageNotes.length) await tx.insert(rentalDamagesTable).values(payload.damageNotes.map((damage) => ({
      inspectionId: inspection.id,
      description: damage.description,
      location: damage.location ?? null,
    })));
    await tx.update(rentalReservationsTable).set({ status: "return_completed", updatedAt: now })
      .where(eq(rentalReservationsTable.id, reservationId));
    await tx.update(rentalVehiclesTable).set({ operationalStatus: "cleaning", updatedAt: now })
      .where(eq(rentalVehiclesTable.id, reservation.vehicleId));
    return inspection;
  });
}

router.post("/partner/rental/reservations/:id/return", authenticatePartner, async (req, res): Promise<void> => {
  const reservation = await partnerReservation(req, res);
  if (!reservation) return;
  if (!partnerCanManageTrip(req, res)) return;
  const parsed = ReturnSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const inspection = await createReturn(reservation.id, parsed.data, String(partnerIdentity(req).staffId));
    res.status(201).json({ inspection, reservation: await getReservation(reservation.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Return could not be completed";
    res.status(message.includes("not found") ? 404 : 409).json({ error: message });
  }
});

router.post("/admin/rental/reservations/:id/return", requireAdminAuth, async (req, res, next): Promise<void> => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) { res.status(400).json({ error: "Invalid reservation ID" }); return; }
  const reservation = await getReservation(id.data);
  if (!reservation) { res.status(404).json({ error: "Reservation not found" }); return; }
  if (!marketplace(reservation)) { next(); return; }
  const parsed = ReturnSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const actor = (req.session as unknown as { admin?: { username?: string } }).admin?.username ?? "admin";
    const inspection = await createReturn(id.data, parsed.data, actor);
    res.status(201).json({ inspection, reservation: await getReservation(id.data) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Return could not be completed";
    res.status(message.includes("not found") ? 404 : 409).json({ error: message });
  }
});

async function closeTrip(reservationId: number, payload: z.infer<typeof CloseSchema>, actorId: string) {
  return db.transaction(async (tx) => {
    const [reservation] = await tx.select().from(rentalReservationsTable)
      .where(eq(rentalReservationsTable.id, reservationId)).for("update");
    if (!reservation || !marketplace(reservation)) throw new Error("Reservation not found");
    if (reservation.status !== "return_completed") throw new Error("A completed return inspection is required before close");
    const [returned] = await tx.select().from(rentalInspectionsTable).where(and(
      eq(rentalInspectionsTable.reservationId, reservationId), eq(rentalInspectionsTable.type, "return"),
    ));
    if (!returned) throw new Error("A completed return inspection is required before close");
    const provisional = new Map<string, number>();
    for (const item of returned.discrepancies ?? []) {
      if (item.kind === "provisional_charge" && typeof item.code === "string" && typeof item.amount === "number") {
        provisional.set(item.code, item.amount);
      }
    }
    const approved = payload.approvedExtras ?? {};
    for (const [code, amount] of Object.entries(approved)) {
      if (amount > (provisional.get(code) ?? 0)) throw new Error(`Approved extra ${code} exceeds the provisional claim`);
    }
    const approvals = await tx.select().from(rentalTripChargeApprovalsTable)
      .where(eq(rentalTripChargeApprovalsTable.reservationId, reservationId));
    const acknowledged = new Map(approvals.map((approval) => [approval.code, approval.amount]));
    for (const [code, amount] of Object.entries(approved)) {
      if (amount > 0 && acknowledged.get(code) !== amount) {
        throw new Error(`Extra ${code} remains provisional until the customer acknowledges the exact amount`);
      }
    }
    const acknowledgedExtras = Object.fromEntries(Object.entries(approved).filter(([, amount]) => amount > 0));
    const refund = payload.approvedRefund ?? 0;
    const snapshot = reservation.marketplaceOfferSnapshot ?? {};
    const [payment] = await tx.select().from(rentalPaymentsTable)
      .where(eq(rentalPaymentsTable.reservationId, reservationId));
    if (!payment || !["paid", "partially_refunded"].includes(payment.status)) {
      throw new Error("Paid marketplace payment snapshot is required before close");
    }
    const operatorId = reservation.operatorId;
    if (operatorId == null) throw new Error("Marketplace operator is missing");
    const savedTotal = payment.amount;
    const savedCommission = payment.commissionAmount;
    const savedShare = payment.operatorShareAmount;
    const processedRefund = Math.min(payment.refundedAmount, payment.amount);
    if (refund > Math.max(0, Math.min(savedTotal, reservation.paidAmount) - processedRefund)) {
      throw new Error("Approved refund exceeds the amount paid");
    }
    const settlement = calculateTripSettlement({
      baseTotal: Math.round(savedTotal),
      baseCommission: savedCommission,
      baseOperatorShare: savedShare,
      commissionBasisPoints: payment.commissionBasisPoints,
      approvedExtras: acknowledgedExtras,
      processedRefund,
      approvedRefund: refund,
    });
    const terms = {
      offerSnapshot: snapshot,
      paymentSnapshot: payment ? {
        amount: payment.amount, commissionAmount: payment.commissionAmount,
        commissionBasisPoints: payment.commissionBasisPoints,
        commissionPolicyVersion: payment.commissionPolicyVersion,
        operatorShareAmount: payment.operatorShareAmount,
      } : {},
      settlement,
    };
    const entries = [
      { entryType: "booking_total", amount: settlement.baseTotal, description: "Saved booking total", status: "paid" },
      { entryType: "platform_commission", amount: settlement.baseCommission, description: "Platform commission from saved payment snapshot", status: "paid" },
      { entryType: "operator_share", amount: settlement.baseOperatorShare, description: "Operator share from saved payment snapshot", status: "paid" },
      ...settlement.extras.flatMap(({ code, amount, commission, operatorShare }) => [
        { entryType: "approved_extra", amount, description: `Acknowledged extra: ${code}`, status: "pending_collection" },
        { entryType: "extra_platform_commission", amount: commission, description: `Platform commission adjustment for extra: ${code}`, status: "pending_collection" },
        { entryType: "extra_operator_share", amount: operatorShare, description: `Operator share adjustment for extra: ${code}`, status: "pending_collection" },
      ]),
      ...(settlement.processedRefund > 0 ? [
        { entryType: "processed_refund", amount: -settlement.processedRefund, description: "Previously processed refund", status: "paid" },
        { entryType: "processed_refund_platform_commission", amount: -settlement.processedRefundCommission, description: "Commission reversal for processed refund", status: "paid" },
        { entryType: "processed_refund_operator_share", amount: -settlement.processedRefundOperatorShare, description: "Operator share reversal for processed refund", status: "paid" },
      ] : []),
      ...(settlement.refund > 0 ? [
        { entryType: "approved_refund", amount: -settlement.refund, description: "Approved refund", status: "pending_payment" },
        { entryType: "refund_platform_commission", amount: -settlement.refundCommission, description: "Commission reversal for approved refund", status: "pending_payment" },
        { entryType: "refund_operator_share", amount: -settlement.refundOperatorShare, description: "Operator share reversal for approved refund", status: "pending_payment" },
      ] : []),
    ];
    await tx.insert(rentalTripLedgerTable).values(entries.map((entry) => ({
      reservationId, operatorId, ...entry, currency: payment.currency,
      savedTerms: terms,
    })));
    const finalTotal = settlement.finalTotal;
    const [closed] = await tx.update(rentalReservationsTable).set({
      status: "closed", finalTotal,
      outstanding: Math.max(0, finalTotal - (reservation.paidAmount - processedRefund)),
      updatedAt: new Date(),
    }).where(eq(rentalReservationsTable.id, reservationId)).returning();
    void actorId;
    return closed;
  });
}

async function closeResponse(req: Parameters<Parameters<typeof router.post>[1]>[0], res: Parameters<Parameters<typeof router.post>[1]>[1], id: number, payload: z.infer<typeof CloseSchema>, actorId: string) {
  try {
    const reservation = await closeTrip(id, payload, actorId);
    const ledger = await db.select().from(rentalTripLedgerTable).where(eq(rentalTripLedgerTable.reservationId, id)).orderBy(rentalTripLedgerTable.createdAt);
    const paidBase = ledger.filter((entry) => entry.status === "paid");
    const extraEntries = ledger.filter((entry) => entry.entryType === "approved_extra");
    const refundEntries = ledger.filter((entry) => entry.entryType === "approved_refund");
    const commission = ledger.filter((entry) => entry.entryType.endsWith("platform_commission"))
      .reduce((sum, entry) => sum + entry.amount, 0);
    const operatorShare = ledger.filter((entry) => entry.entryType.endsWith("operator_share"))
      .reduce((sum, entry) => sum + entry.amount, 0);
    const baseTotal = paidBase.find((entry) => entry.entryType === "booking_total")?.amount ?? 0;
    const finalTotal = baseTotal +
      extraEntries.reduce((sum, entry) => sum + entry.amount, 0) +
      refundEntries.reduce((sum, entry) => sum + entry.amount, 0) +
      ledger.filter((entry) => entry.entryType === "processed_refund").reduce((sum, entry) => sum + entry.amount, 0);
    res.json({
      reservation,
      ledger,
      reconciliation: {
        finalTotal,
        platformCommission: commission,
        operatorShare,
        sharesReconcile: commission + operatorShare === finalTotal,
        pendingCollection: extraEntries.reduce((sum, entry) => sum + entry.amount, 0),
        pendingPayment: Math.abs(refundEntries.reduce((sum, entry) => sum + entry.amount, 0)),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Trip could not be closed";
    res.status(message.includes("not found") ? 404 : 409).json({ error: message });
  }
}

router.post("/partner/rental/reservations/:id/close", authenticatePartner, async (req, res): Promise<void> => {
  const reservation = await partnerReservation(req, res);
  if (!reservation) return;
  if (!partnerCanManageTrip(req, res)) return;
  const parsed = CloseSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  await closeResponse(req, res, reservation.id, parsed.data, String(partnerIdentity(req).staffId));
});
router.post("/admin/rental/reservations/:id/close", requireAdminAuth, async (req, res): Promise<void> => {
  const id = idSchema.safeParse(req.params.id);
  const parsed = CloseSchema.safeParse(req.body ?? {});
  if (!id.success || !parsed.success) { res.status(400).json({ error: parsed.success ? "Invalid reservation ID" : parsed.error.message }); return; }
  const reservation = await getReservation(id.data);
  if (!reservation || !marketplace(reservation)) { res.status(404).json({ error: "Reservation not found" }); return; }
  await closeResponse(req, res, id.data, parsed.data, (req.session as unknown as { admin?: { username?: string } }).admin?.username ?? "admin");
});

router.post("/partner/rental/reservations/:id/inspection-photos/upload-request", authenticatePartner, async (req, res): Promise<void> => {
  const reservation = await partnerReservation(req, res);
  const parsed = PhotoRequestSchema.safeParse(req.body);
  if (!reservation) return;
  if (!partnerCanManageTrip(req, res)) return;
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const token = createRentalDocumentToken();
  await db.insert(rentalTripUploadsTable).values({
    token, reservationId: reservation.id, operatorId: reservation.operatorId ?? 0,
    contentType: parsed.data.contentType, expiresAt: new Date(Date.now() + 60 * 60_000),
  });
  res.status(201).json({
    reference: token,
    uploadPath: `/api/partner/rental/reservations/${reservation.id}/inspection-photos/${token}/content`,
    method: "PUT", contentType: parsed.data.contentType, maxBytes: 12 * 1024 * 1024,
  });
});
router.post("/admin/rental/reservations/:id/inspection-photos/upload-request", requireAdminAuth, async (req, res): Promise<void> => {
  const id = idSchema.safeParse(req.params.id);
  const parsed = PhotoRequestSchema.safeParse(req.body);
  if (!id.success || !parsed.success) { res.status(400).json({ error: parsed.success ? "Invalid reservation ID" : parsed.error.message }); return; }
  const reservation = await getReservation(id.data);
  if (!reservation || !marketplace(reservation) || reservation.operatorId == null) {
    res.status(404).json({ error: "Reservation not found" }); return;
  }
  const token = createRentalDocumentToken();
  await db.insert(rentalTripUploadsTable).values({
    token, reservationId: reservation.id, operatorId: reservation.operatorId,
    contentType: parsed.data.contentType, expiresAt: new Date(Date.now() + 60 * 60_000),
  });
  res.status(201).json({
    reference: token,
    uploadPath: `/api/admin/rental/reservations/${reservation.id}/inspection-photos/${token}/content`,
    method: "PUT", contentType: parsed.data.contentType, maxBytes: 12 * 1024 * 1024,
  });
});
router.put("/partner/rental/reservations/:id/inspection-photos/:token/content", authenticatePartner, async (req, res): Promise<void> => {
  const reservation = await partnerReservation(req, res);
  if (!reservation) return;
  if (!partnerCanManageTrip(req, res)) return;
  const token = z.string().uuid().safeParse(req.params.token);
  const uploadToken = token.success ? token.data : null;
  const [upload] = token.success ? await db.select().from(rentalTripUploadsTable).where(and(
    eq(rentalTripUploadsTable.token, uploadToken!), eq(rentalTripUploadsTable.reservationId, reservation.id),
    eq(rentalTripUploadsTable.operatorId, reservation.operatorId ?? 0),
  )) : [];
  if (!upload || !uploadToken || upload.uploadedAt || upload.expiresAt <= new Date()) { res.status(404).json({ error: "Upload request expired or not found" }); return; }
  const contentType = req.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  const contentLength = Number(req.get("content-length") ?? 0);
  if (!contentType || contentType !== upload.contentType) { res.status(415).json({ error: "Content type does not match upload request" }); return; }
  if (contentLength > 12 * 1024 * 1024) { res.status(413).json({ error: "Inspection photo exceeds the 12 MB limit" }); return; }
  try {
    await receiveRentalInspectionUpload(rentalInspectionObjectName(reservation.id, uploadToken), req, contentType);
    await db.update(rentalTripUploadsTable).set({ uploadedAt: new Date() }).where(eq(rentalTripUploadsTable.token, uploadToken));
    res.status(204).end();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Private evidence storage unavailable";
    res.status(message.includes("exceeds") ? 413 : 503).json({ error: message });
  }
});
router.put("/admin/rental/reservations/:id/inspection-photos/:token/content", requireAdminAuth, async (req, res): Promise<void> => {
  const id = idSchema.safeParse(req.params.id);
  const token = z.string().uuid().safeParse(req.params.token);
  if (!id.success || !token.success) { res.status(404).json({ error: "Upload request not found" }); return; }
  const reservation = await getReservation(id.data);
  if (!reservation || !marketplace(reservation) || reservation.operatorId == null) { res.status(404).json({ error: "Upload request not found" }); return; }
  const [upload] = await db.select().from(rentalTripUploadsTable).where(and(
    eq(rentalTripUploadsTable.token, token.data),
    eq(rentalTripUploadsTable.reservationId, reservation.id),
    eq(rentalTripUploadsTable.operatorId, reservation.operatorId),
  ));
  if (!upload || upload.uploadedAt || upload.expiresAt <= new Date()) { res.status(404).json({ error: "Upload request expired or not found" }); return; }
  const contentType = req.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  const contentLength = Number(req.get("content-length") ?? 0);
  if (!contentType || contentType !== upload.contentType) { res.status(415).json({ error: "Content type does not match upload request" }); return; }
  if (contentLength > 12 * 1024 * 1024) { res.status(413).json({ error: "Inspection photo exceeds the 12 MB limit" }); return; }
  try {
    await receiveRentalInspectionUpload(rentalInspectionObjectName(reservation.id, token.data), req, contentType);
    await db.update(rentalTripUploadsTable).set({ uploadedAt: new Date() }).where(eq(rentalTripUploadsTable.token, token.data));
    res.status(204).end();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Private evidence storage unavailable";
    res.status(message.includes("exceeds") ? 413 : 503).json({ error: message });
  }
});

router.get("/rental/inspection-evidence/:reservationId/:token", async (req, res): Promise<void> => {
  const id = idSchema.safeParse(req.params.reservationId);
  const token = z.string().uuid().safeParse(req.params.token);
  if (!id.success || !token.success) { res.status(404).json({ error: "Evidence not found" }); return; }
  const photos = await db.select({ photo: rentalInspectionPhotosTable, inspection: rentalInspectionsTable })
    .from(rentalInspectionPhotosTable).innerJoin(rentalInspectionsTable, eq(rentalInspectionPhotosTable.inspectionId, rentalInspectionsTable.id))
    .where(and(eq(rentalInspectionPhotosTable.storageKey, token.data), eq(rentalInspectionsTable.reservationId, id.data)));
  const photo = photos[0];
  const reservation = await getReservation(id.data);
  if (!photo || !reservation || !marketplace(reservation)) { res.status(404).json({ error: "Evidence not found" }); return; }
  const session = req.session as unknown as Record<string, unknown>;
  const partner = session.partner as { operatorId?: number; staffId?: number } | undefined;
  const admin = session.admin as { username?: string } | undefined;
  const customerEmail = typeof session.rentalCustomerEmail === "string" ? session.rentalCustomerEmail : "";
  const [partnerStaff] = partner?.operatorId === reservation.operatorId && partner.staffId
    ? await db.select({ staff: rentalOperatorStaffTable, operator: rentalOperatorsTable })
      .from(rentalOperatorStaffTable)
      .innerJoin(rentalOperatorsTable, eq(rentalOperatorStaffTable.operatorId, rentalOperatorsTable.id))
      .where(and(
        eq(rentalOperatorStaffTable.id, partner.staffId),
        eq(rentalOperatorStaffTable.operatorId, partner.operatorId),
        eq(rentalOperatorStaffTable.active, true),
        eq(rentalOperatorStaffTable.status, "active"),
      ))
    : [];
  const allowedPartner = !!partnerStaff && !partnerStaff.operator.isPlatform &&
    !["suspended", "closed"].includes(partnerStaff.operator.status);
  const allowedAdmin = !!admin;
  const allowedCustomer = !!customerEmail &&
    (session.rentalCustomerBookingId == null || session.rentalCustomerBookingId === id.data) &&
    !!reservation.primaryDriverId && (await db.select().from(rentalDriversTable).where(and(
      eq(rentalDriversTable.id, reservation.primaryDriverId), eq(rentalDriversTable.email, customerEmail),
    ))).length > 0;
  if (!allowedPartner && !allowedAdmin && !allowedCustomer) { res.status(404).json({ error: "Evidence not found" }); return; }
  await db.insert(rentalInspectionAccessTable).values({
    inspectionId: photo.inspection.id,
    actorType: allowedAdmin ? "admin" : allowedPartner ? "partner" : "customer",
    actorId: allowedAdmin ? admin?.username ?? "admin" : allowedPartner ? String(partner?.staffId) : customerEmail,
  });
  try {
    await streamRentalInspectionEvidence(rentalInspectionObjectName(id.data, token.data), res);
  } catch {
    if (!res.headersSent) res.status(404).json({ error: "Evidence not found" });
    else res.destroy();
  }
});

export default router;
