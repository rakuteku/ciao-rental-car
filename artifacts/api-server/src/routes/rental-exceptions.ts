import { Router, type IRouter, type Request } from "express";
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  rentalAvailabilityBlocksTable,
  rentalClaimItemsTable,
  rentalClaimsTable,
  rentalDriversTable,
  rentalExceptionEvidenceTable,
  rentalExceptionEventsTable,
  rentalIncidentsTable,
  rentalInspectionPhotosTable,
  rentalInspectionsTable,
  rentalNotificationsTable,
  rentalOperatorStaffTable,
  rentalOperatorsTable,
  rentalReservationsTable,
  rentalVehiclesTable,
} from "@workspace/db";
import { requireAdminAuth } from "../middlewares/admin-auth";
import { isRentalMarketplaceEnabled } from "../middlewares/operator-auth";
import {
  createRentalDocumentToken,
  receiveRentalDocumentUpload,
  rentalDocumentObjectName,
  streamRentalDocument,
} from "../lib/rental-private-documents";
import { isAllowedRentalDocumentContentType } from "../lib/rental-private-document-policy.mjs";
import { authenticatePartner } from "./partner";
import { retryRentalNotification } from "../lib/rental-events";

const router: IRouter = Router();
router.use((_req, res, next) => {
  if (!isRentalMarketplaceEnabled()) {
    next("router");
    return;
  }
  next();
});

const idSchema = z.coerce.number().int().positive();
const IncidentSchema = z.object({
  category: z.string().trim().min(1).max(100),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  description: z.string().trim().min(1).max(5000),
  unsafeVehicle: z.boolean().default(false),
  occurredAt: z.string().datetime({ offset: true }).optional(),
  location: z.string().trim().max(500).optional(),
  peopleInvolved: z.array(z.object({
    role: z.string().trim().min(1).max(100),
    name: z.string().trim().max(200).optional(),
    contact: z.string().trim().max(300).optional(),
  }).strict()).max(20).default([]),
  policeReported: z.boolean().default(false),
  policeReference: z.string().trim().max(300).optional(),
  roadsideDetails: z.string().trim().max(3000).optional(),
  insurerReference: z.string().trim().max(300).optional(),
  towDetails: z.string().trim().max(3000).optional(),
  replacementVehicleDetails: z.string().trim().max(3000).optional(),
  downtimeStart: z.string().datetime({ offset: true }).optional(),
  downtimeEnd: z.string().datetime({ offset: true }).optional(),
  nextBookingImpact: z.string().trim().max(3000).optional(),
  customerUpdate: z.string().trim().max(3000).optional(),
}).strict().refine((data) => !(data.downtimeStart && data.downtimeEnd) ||
  Date.parse(data.downtimeEnd) >= Date.parse(data.downtimeStart), {
  message: "Downtime end must be after downtime start",
});
const ClaimSchema = z.object({
  incidentId: z.number().int().positive().optional(),
  currency: z.literal("jpy").default("jpy"),
  invoiceReference: z.string().trim().max(300).optional(),
  insurerOutcome: z.string().trim().max(3000).optional(),
}).strict();
const ClaimItemSchema = z.object({
  category: z.enum(["deductible", "repair", "cleaning", "noc"]).default("repair"),
  description: z.string().trim().min(1).max(1000),
  amount: z.number().int().positive().max(100_000_000),
}).strict();
const ClaimInfoSchema = z.object({
  invoiceReference: z.string().trim().max(300).nullable().optional(),
  insurerOutcome: z.string().trim().max(3000).nullable().optional(),
}).strict();
const CustomerResponseSchema = z.object({
  response: z.string().trim().min(1).max(5000),
  disputedItemIds: z.array(z.number().int().positive()).max(100).default([]),
}).strict();
const DecisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  notes: z.string().trim().min(1).max(5000),
  insurerOutcome: z.string().trim().max(3000).optional(),
}).strict();
const ResolveIncidentSchema = z.object({
  resolution: z.string().trim().min(1).max(5000),
}).strict();
const CustomerUpdateSchema = z.object({
  update: z.string().trim().min(1).max(3000),
}).strict();
const UploadSchema = z.object({
  evidenceKind: z.enum(["incident", "pickup", "return", "invoice", "insurer", "customer_response"]),
  contentType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  incidentId: z.number().int().positive().optional(),
  claimId: z.number().int().positive().optional(),
  claimItemId: z.number().int().positive().optional(),
  inspectionId: z.number().int().positive().optional(),
}).strict().refine((data) => ["pickup", "return"].includes(data.evidenceKind)
  ? Boolean(data.inspectionId)
  : data.evidenceKind === "incident"
    ? Boolean(data.incidentId)
    : Boolean(data.claimId), {
  message: "Evidence must be linked to an incident, claim, or pickup/return inspection",
});

type Actor = { type: "customer" | "partner" | "admin"; id: string; operatorId?: number };
type Reservation = typeof rentalReservationsTable.$inferSelect;

function validId(value: string | string[] | undefined): number | null {
  if (typeof value !== "string") return null;
  const valueNumber = Number(value);
  return Number.isSafeInteger(valueNumber) && valueNumber > 0 ? valueNumber : null;
}

async function actorFor(req: Request, reservation?: Reservation): Promise<Actor | null> {
  const session = req.session as unknown as Record<string, unknown>;
  const admin = session.admin as { username?: string } | undefined;
  if (admin) return { type: "admin", id: admin.username ?? "admin" };
  const partner = session.partner as { operatorId?: number; staffId?: number } | undefined;
  if (partner?.operatorId && partner.staffId) {
    const [staff] = await db.select({ staff: rentalOperatorStaffTable, operator: rentalOperatorsTable })
      .from(rentalOperatorStaffTable)
      .innerJoin(rentalOperatorsTable, eq(rentalOperatorStaffTable.operatorId, rentalOperatorsTable.id))
      .where(and(
        eq(rentalOperatorStaffTable.id, partner.staffId),
        eq(rentalOperatorStaffTable.operatorId, partner.operatorId),
        eq(rentalOperatorStaffTable.active, true),
        eq(rentalOperatorStaffTable.status, "active"),
      ));
    if (staff && !staff.operator.isPlatform && !["suspended", "closed"].includes(staff.operator.status)) {
      if (!reservation || reservation.operatorId === staff.operator.id) {
        return { type: "partner", id: String(staff.staff.id), operatorId: staff.operator.id };
      }
    }
  }
  const email = typeof session.rentalCustomerEmail === "string" ? session.rentalCustomerEmail.trim().toLowerCase() : "";
  const bookingId = session.rentalCustomerBookingId;
  if (email && reservation && bookingId === reservation.id && reservation.primaryDriverId) {
    const [driver] = await db.select().from(rentalDriversTable).where(and(
      eq(rentalDriversTable.id, reservation.primaryDriverId),
      eq(rentalDriversTable.email, email),
    ));
    if (driver) return { type: "customer", id: email };
  }
  return null;
}

async function reservationFor(id: number): Promise<Reservation | null> {
  const [reservation] = await db.select().from(rentalReservationsTable).where(and(
    eq(rentalReservationsTable.id, id),
    isNull(rentalReservationsTable.deletedAt),
    eq(rentalReservationsTable.source, "marketplace_request"),
  ));
  return reservation ?? null;
}

async function event(input: {
  reservationId: number; actor: Actor; eventType: string; details?: Record<string, unknown>;
  incidentId?: number; claimId?: number; claimItemId?: number;
}) {
  const [created] = await db.insert(rentalExceptionEventsTable).values({
    reservationId: input.reservationId,
    incidentId: input.incidentId ?? null,
    claimId: input.claimId ?? null,
    claimItemId: input.claimItemId ?? null,
    actorType: input.actor.type,
    actorId: input.actor.id,
    eventType: input.eventType,
    details: input.details ?? {},
  }).returning();
  return created;
}

async function notify(reservation: Reservation, type: string, eventId: number, summary: string) {
  const recipients: Array<{ email: string | null; role: string }> = [];
  if (reservation.primaryDriverId) {
    const [driver] = await db.select().from(rentalDriversTable).where(eq(rentalDriversTable.id, reservation.primaryDriverId));
    recipients.push({ email: driver?.email ?? null, role: "customer" });
  }
  if (reservation.operatorId) {
    const [operator] = await db.select().from(rentalOperatorsTable).where(eq(rentalOperatorsTable.id, reservation.operatorId));
    recipients.push({ email: operator?.contactEmail ?? null, role: "operator" });
  }
  const [platform] = await db.select().from(rentalOperatorsTable).where(eq(rentalOperatorsTable.isPlatform, true)).limit(1);
  recipients.push({ email: platform?.contactEmail ?? null, role: "platform" });
  const queued = await Promise.all(recipients.map(async (recipient) => {
    const dedupeKey = `rental-exception-${eventId}-${recipient.role}`;
    const [inserted] = await db.insert(rentalNotificationsTable).values({
      email: recipient.email,
      eventType: "alert",
      channel: "smtp",
      dedupeKey,
      deliveryStatus: recipient.email ? "pending" : "unconfigured",
      lastError: recipient.email ? null : "Notification recipient email is not configured.",
      payload: {
        locale: "en",
        bookingId: reservation.id,
        rentalExceptionEventId: eventId,
        exceptionType: type,
        localeTemplates: {
          en: { subject: `Rental ${type.replaceAll("_", " ")} #${reservation.id}`, body: summary },
          ja: { subject: `レンタル予約 #${reservation.id} のお知らせ`, body: summary },
        },
      },
    }).onConflictDoNothing({ target: rentalNotificationsTable.dedupeKey }).returning({ id: rentalNotificationsTable.id });
    if (inserted) return inserted;
    const [existing] = await db.select({ id: rentalNotificationsTable.id }).from(rentalNotificationsTable)
      .where(eq(rentalNotificationsTable.dedupeKey, dedupeKey)).limit(1);
    return existing;
  }));
  await Promise.allSettled(queued.filter((item): item is { id: number } => Boolean(item))
    .map((notification) => retryRentalNotification(notification.id)));
}

function canManageClaims(actor: Actor): boolean {
  return actor.type === "partner" || actor.type === "admin";
}

router.get("/rental/exceptions/reservations/:id", async (req, res): Promise<void> => {
  const id = validId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid reservation ID" }); return; }
  const reservation = await reservationFor(id);
  const actor = reservation ? await actorFor(req, reservation) : null;
  if (!reservation || !actor) { res.status(404).json({ error: "Reservation not found" }); return; }
  const [incidents, claims, timeline, evidence] = await Promise.all([
    db.select().from(rentalIncidentsTable).where(eq(rentalIncidentsTable.reservationId, id)).orderBy(desc(rentalIncidentsTable.createdAt)),
    db.select().from(rentalClaimsTable).where(eq(rentalClaimsTable.reservationId, id)).orderBy(desc(rentalClaimsTable.createdAt)),
    db.select().from(rentalExceptionEventsTable).where(eq(rentalExceptionEventsTable.reservationId, id)).orderBy(desc(rentalExceptionEventsTable.createdAt)),
    db.select({
      token: rentalExceptionEvidenceTable.token,
      evidenceKind: rentalExceptionEvidenceTable.evidenceKind,
      incidentId: rentalExceptionEvidenceTable.incidentId,
      claimId: rentalExceptionEvidenceTable.claimId,
      claimItemId: rentalExceptionEvidenceTable.claimItemId,
      inspectionId: rentalExceptionEvidenceTable.inspectionId,
      contentType: rentalExceptionEvidenceTable.contentType,
      uploadedAt: rentalExceptionEvidenceTable.uploadedAt,
    }).from(rentalExceptionEvidenceTable).where(eq(rentalExceptionEvidenceTable.reservationId, id)),
  ]);
  const claimIds = claims.map((claim) => claim.id);
  const allItems = await Promise.all(claimIds.map((claimId) =>
    db.select().from(rentalClaimItemsTable).where(eq(rentalClaimItemsTable.claimId, claimId))));
  res.json({
    incidents,
    claims: claims.map((claim, index) => ({ ...claim, items: allItems[index] ?? [] })),
    timeline,
    evidence: evidence.filter((record) => record.uploadedAt).map((record) => ({
      ...record,
      contentPath: `/rental/exceptions/evidence/${record.token}`,
    })),
    providerCharging: "not_configured",
  });
});

async function createIncident(req: Request, res: import("express").Response): Promise<void> {
  const reservationId = validId(req.params.id);
  const parsed = IncidentSchema.safeParse(req.body);
  if (!reservationId || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "Invalid reservation ID" : parsed.error.message }); return;
  }
  const reservation = await reservationFor(reservationId);
  const actor = reservation ? await actorFor(req, reservation) : null;
  if (!reservation || !actor) { res.status(404).json({ error: "Reservation not found" }); return; }
  if (actor.type === "admin") { res.status(403).json({ error: "Platform users cannot report operator/customer incidents" }); return; }
  if (!reservation.operatorId) { res.status(404).json({ error: "Reservation not found" }); return; }
  const [vehicleBeforeReport] = await db.select().from(rentalVehiclesTable).where(eq(rentalVehiclesTable.id, reservation.vehicleId));
  const vehicleReservations = await db.select({ id: rentalReservationsTable.id })
    .from(rentalReservationsTable).where(eq(rentalReservationsTable.vehicleId, reservation.vehicleId));
  const existingUnsafe = vehicleReservations.length ? await db.select().from(rentalIncidentsTable).where(and(
    inArray(rentalIncidentsTable.reservationId, vehicleReservations.map((row) => row.id)),
    eq(rentalIncidentsTable.unsafeVehicle, true),
    eq(rentalIncidentsTable.status, "open"),
  )) : [];
  const originalOperationalStatus = existingUnsafe
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]?.priorOperationalStatus
    ?? vehicleBeforeReport?.operationalStatus
    ?? null;
  const [incident] = await db.insert(rentalIncidentsTable).values({
    reservationId, operatorId: reservation.operatorId,
    category: parsed.data.category, severity: parsed.data.severity,
    description: parsed.data.description, unsafeVehicle: parsed.data.unsafeVehicle,
    priorOperationalStatus: parsed.data.unsafeVehicle ? originalOperationalStatus : null,
    location: parsed.data.location ?? null,
    peopleInvolved: parsed.data.peopleInvolved,
    policeReported: parsed.data.policeReported,
    policeReference: parsed.data.policeReference ?? null,
    roadsideDetails: parsed.data.roadsideDetails ?? null,
    insurerReference: parsed.data.insurerReference ?? null,
    towDetails: parsed.data.towDetails ?? null,
    replacementVehicleDetails: parsed.data.replacementVehicleDetails ?? null,
    downtimeStart: parsed.data.downtimeStart ? new Date(parsed.data.downtimeStart) : null,
    downtimeEnd: parsed.data.downtimeEnd ? new Date(parsed.data.downtimeEnd) : null,
    nextBookingImpact: parsed.data.nextBookingImpact ?? null,
    customerUpdate: parsed.data.customerUpdate ?? null,
    reportedByType: actor.type, reportedById: actor.id,
    occurredAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : null,
  }).returning();
  const createdEvent = await event({
    reservationId, actor, incidentId: incident.id, eventType: "incident_reported",
    details: {
      category: incident.category,
      severity: incident.severity,
      unsafeVehicle: incident.unsafeVehicle,
      location: incident.location,
      peopleInvolved: incident.peopleInvolved,
      policeReported: incident.policeReported,
      policeReference: incident.policeReference,
      roadsideDetails: incident.roadsideDetails,
      insurerReference: incident.insurerReference,
      towDetails: incident.towDetails,
      replacementVehicleDetails: incident.replacementVehicleDetails,
      downtimeStart: incident.downtimeStart?.toISOString() ?? null,
      downtimeEnd: incident.downtimeEnd?.toISOString() ?? null,
      nextBookingImpact: incident.nextBookingImpact,
      customerUpdate: incident.customerUpdate,
    },
  });
  if (incident.unsafeVehicle) {
    const vehicle = vehicleBeforeReport;
    if (vehicle) {
      await db.update(rentalVehiclesTable).set({ operationalStatus: "maintenance", updatedAt: new Date() })
        .where(eq(rentalVehiclesTable.id, vehicle.id));
      await db.insert(rentalAvailabilityBlocksTable).values({
        vehicleId: vehicle.id,
        startAt: new Date(),
        endAt: new Date("9999-12-31T23:59:59.999Z"),
        reason: "maintenance",
        notes: `Unsafe vehicle incident #${incident.id}; platform clearance required`,
        createdBy: `rental-incident:${incident.id}`,
      });
      await event({
        reservationId, actor, incidentId: incident.id, eventType: "vehicle_safety_hold_applied",
        details: { vehicleId: vehicle.id },
      });
    }
  }
  await notify(
    reservation,
    "incident_reported",
    createdEvent.id,
    incident.customerUpdate || `Incident #${incident.id} was reported.`,
  );
  res.status(201).json({ incident });
}

router.post("/rental/exceptions/reservations/:id/incidents", createIncident);
router.post("/rental/exceptions/operator/reservations/:id/incidents", authenticatePartner, createIncident);

router.post("/rental/exceptions/incidents/:incidentId/customer-update", async (req, res): Promise<void> => {
  const incidentId = validId(req.params.incidentId);
  const parsed = CustomerUpdateSchema.safeParse(req.body);
  if (!incidentId || !parsed.success) { res.status(400).json({ error: parsed.success ? "Invalid incident ID" : parsed.error.message }); return; }
  const [incident] = await db.select().from(rentalIncidentsTable).where(eq(rentalIncidentsTable.id, incidentId));
  const reservation = incident ? await reservationFor(incident.reservationId) : null;
  const actor = reservation ? await actorFor(req, reservation) : null;
  if (!incident || !reservation || !actor || actor.type === "customer") {
    res.status(404).json({ error: "Incident not found" }); return;
  }
  if (actor.type === "partner" && actor.operatorId !== incident.operatorId) {
    res.status(404).json({ error: "Incident not found" }); return;
  }
  if (incident.status === "resolved") { res.status(409).json({ error: "Resolved incidents cannot be updated" }); return; }
  const [updated] = await db.update(rentalIncidentsTable).set({
    customerUpdate: parsed.data.update,
    updatedAt: new Date(),
  }).where(eq(rentalIncidentsTable.id, incidentId)).returning();
  const createdEvent = await event({
    reservationId: reservation.id, actor, incidentId, eventType: "customer_update",
    details: { update: parsed.data.update },
  });
  await notify(reservation, "incident_customer_update", createdEvent.id, parsed.data.update);
  res.json({ incident: updated });
});

router.post("/rental/exceptions/reservations/:id/claims", async (req, res): Promise<void> => {
  const reservationId = validId(req.params.id);
  const parsed = ClaimSchema.safeParse(req.body);
  if (!reservationId || !parsed.success) { res.status(400).json({ error: parsed.success ? "Invalid reservation ID" : parsed.error.message }); return; }
  const reservation = await reservationFor(reservationId);
  const actor = reservation ? await actorFor(req, reservation) : null;
  if (!reservation || !actor || !canManageClaims(actor) || actor.type === "partner" && actor.operatorId !== reservation.operatorId) {
    res.status(404).json({ error: "Reservation not found" }); return;
  }
  if (!reservation.operatorId) { res.status(404).json({ error: "Reservation not found" }); return; }
  if (parsed.data.incidentId) {
    const [incident] = await db.select().from(rentalIncidentsTable).where(and(
      eq(rentalIncidentsTable.id, parsed.data.incidentId),
      eq(rentalIncidentsTable.reservationId, reservationId),
    ));
    if (!incident) { res.status(404).json({ error: "Incident not found" }); return; }
  }
  const [claim] = await db.insert(rentalClaimsTable).values({
    reservationId, operatorId: reservation.operatorId ?? 0,
    incidentId: parsed.data.incidentId ?? null,
    currency: "jpy",
    invoiceReference: parsed.data.invoiceReference ?? null,
    insurerOutcome: parsed.data.insurerOutcome ?? null,
  }).returning();
  const createdEvent = await event({
    reservationId, actor, claimId: claim.id, eventType: "claim_created",
    details: { incidentId: claim.incidentId, currency: claim.currency },
  });
  await notify(reservation, "claim_created", createdEvent.id, `Claim #${claim.id} was opened for evidence review.`);
  res.status(201).json({ claim });
});

router.post("/rental/exceptions/claims/:claimId/items", async (req, res): Promise<void> => {
  const claimId = validId(req.params.claimId);
  const parsed = ClaimItemSchema.safeParse(req.body);
  if (!claimId) { res.status(404).json({ error: "Claim not found" }); return; }
  const [claim] = await db.select().from(rentalClaimsTable).where(eq(rentalClaimsTable.id, claimId));
  const reservation = claim ? await reservationFor(claim.reservationId) : null;
  const actor = reservation ? await actorFor(req, reservation) : null;
  if (!claim || !reservation || !actor || !canManageClaims(actor) || actor.type === "partner" && claim.operatorId !== actor.operatorId) {
    res.status(404).json({ error: "Claim not found" }); return;
  }
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (claim.status !== "draft" && claim.status !== "submitted") {
    res.status(409).json({ error: "Claim is no longer editable" }); return;
  }
  const existingItems = await db.select().from(rentalClaimItemsTable).where(eq(rentalClaimItemsTable.claimId, claimId));
  const existingTotal = existingItems.reduce((sum, row) => sum + row.amount, 0);
  if (existingItems.length >= 100 || existingTotal + parsed.data.amount > 2_000_000_000) {
    res.status(409).json({ error: "Claim item count or total exceeds the supported limit" }); return;
  }
  const [item] = await db.insert(rentalClaimItemsTable).values({
    claimId, category: parsed.data.category, description: parsed.data.description, amount: parsed.data.amount,
  }).returning();
  const items = await db.select().from(rentalClaimItemsTable).where(eq(rentalClaimItemsTable.claimId, claimId));
  const totalAmount = items.reduce((sum, row) => sum + row.amount, 0);
  await db.update(rentalClaimsTable).set({
    totalAmount, status: "submitted", submittedAt: claim.submittedAt ?? new Date(), updatedAt: new Date(),
  }).where(eq(rentalClaimsTable.id, claimId));
  const createdEvent = await event({
    reservationId: reservation.id, actor, claimId, claimItemId: item.id, eventType: "claim_item_submitted",
    details: {
      category: item.category,
      amount: item.amount,
      currency: "jpy",
      chargeBlockedPendingPlatformApproval: true,
    },
  });
  await notify(reservation, "claim_item_submitted", createdEvent.id, `Claim #${claimId} includes a new item for JPY ${item.amount}.`);
  res.status(201).json({ item, totalAmount, status: "submitted", chargeStatus: "blocked_pending_platform_approval" });
});

router.patch("/rental/exceptions/claims/:claimId/details", async (req, res): Promise<void> => {
  const claimId = validId(req.params.claimId);
  const parsed = ClaimInfoSchema.safeParse(req.body);
  if (!claimId) { res.status(404).json({ error: "Claim not found" }); return; }
  const [claim] = await db.select().from(rentalClaimsTable).where(eq(rentalClaimsTable.id, claimId));
  const reservation = claim ? await reservationFor(claim.reservationId) : null;
  const actor = reservation ? await actorFor(req, reservation) : null;
  if (!claim || !reservation || !actor || !canManageClaims(actor) || actor.type === "partner" && claim.operatorId !== actor.operatorId) {
    res.status(404).json({ error: "Claim not found" }); return;
  }
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updates: Partial<typeof rentalClaimsTable.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.invoiceReference !== undefined) updates.invoiceReference = parsed.data.invoiceReference;
  if (parsed.data.insurerOutcome !== undefined) updates.insurerOutcome = parsed.data.insurerOutcome;
  const [updated] = await db.update(rentalClaimsTable).set(updates).where(eq(rentalClaimsTable.id, claimId)).returning();
  const createdEvent = await event({
    reservationId: reservation.id, actor, claimId, eventType: "claim_invoice_insurer_updated",
    details: {
      invoiceReference: parsed.data.invoiceReference,
      insurerOutcome: parsed.data.insurerOutcome,
    },
  });
  await notify(reservation, "claim_details_updated", createdEvent.id, `Claim #${claimId} invoice or insurer details changed.`);
  res.json({ claim: updated });
});

router.post("/rental/exceptions/claims/:claimId/customer-response", async (req, res): Promise<void> => {
  const claimId = validId(req.params.claimId);
  const parsed = CustomerResponseSchema.safeParse(req.body);
  if (!claimId) { res.status(404).json({ error: "Claim not found" }); return; }
  const [claim] = await db.select().from(rentalClaimsTable).where(eq(rentalClaimsTable.id, claimId));
  const reservation = claim ? await reservationFor(claim.reservationId) : null;
  const actor = reservation ? await actorFor(req, reservation) : null;
  if (!claim || !reservation || !actor || actor.type !== "customer") { res.status(404).json({ error: "Claim not found" }); return; }
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!["submitted", "disputed"].includes(claim.status)) { res.status(409).json({ error: "Claim is not awaiting a customer response" }); return; }
  const items = await db.select().from(rentalClaimItemsTable).where(eq(rentalClaimItemsTable.claimId, claimId));
  if (parsed.data.disputedItemIds.some((itemId) => !items.some((item) => item.id === itemId))) {
    res.status(400).json({ error: "A disputed item does not belong to this claim" }); return;
  }
  if (parsed.data.disputedItemIds.length) {
    for (const itemId of parsed.data.disputedItemIds) {
      await db.update(rentalClaimItemsTable).set({ status: "disputed" }).where(and(
        eq(rentalClaimItemsTable.id, itemId), eq(rentalClaimItemsTable.claimId, claimId),
      ));
    }
  }
  const [updated] = await db.update(rentalClaimsTable).set({
    customerResponse: parsed.data.response,
    customerRespondedAt: new Date(),
    status: "disputed",
    updatedAt: new Date(),
  }).where(eq(rentalClaimsTable.id, claimId)).returning();
  const createdEvent = await event({
    reservationId: reservation.id, actor, claimId, eventType: "customer_disputed_claim",
    details: {
      response: parsed.data.response,
      disputedItemIds: parsed.data.disputedItemIds,
      extraChargesBlocked: true,
    },
  });
  await notify(reservation, "customer_disputed_claim", createdEvent.id, `Customer responded to and disputed claim #${claimId}.`);
  res.json({ claim: updated, items: await db.select().from(rentalClaimItemsTable).where(eq(rentalClaimItemsTable.claimId, claimId)), chargeStatus: "blocked_pending_platform_approval" });
});

router.post("/rental/exceptions/reservations/:id/evidence/upload-request", async (req, res): Promise<void> => {
  const reservationId = validId(req.params.id);
  const parsed = UploadSchema.safeParse(req.body);
  if (!reservationId || !parsed.success) { res.status(400).json({ error: parsed.success ? "Invalid reservation ID" : parsed.error.message }); return; }
  if (!isAllowedRentalDocumentContentType(parsed.data.contentType)) { res.status(415).json({ error: "Unsupported evidence content type" }); return; }
  const reservation = await reservationFor(reservationId);
  const actor = reservation ? await actorFor(req, reservation) : null;
  if (!reservation || !actor || actor.type === "admin") { res.status(404).json({ error: "Reservation not found" }); return; }
  if (!reservation.operatorId) { res.status(404).json({ error: "Reservation not found" }); return; }
  if (parsed.data.evidenceKind === "incident" && !parsed.data.incidentId) {
    res.status(400).json({ error: "Incident evidence must be linked to an incident" }); return;
  }
  if (["invoice", "insurer"].includes(parsed.data.evidenceKind) && !parsed.data.claimId) {
    res.status(400).json({ error: "Invoice and insurer evidence must be linked to a claim" }); return;
  }
  if (parsed.data.evidenceKind === "customer_response" && !parsed.data.claimId) {
    res.status(400).json({ error: "Customer response evidence must be linked to a claim" }); return;
  }
  if (actor.type === "partner" && actor.operatorId !== reservation.operatorId) { res.status(404).json({ error: "Reservation not found" }); return; }
  if (actor.type === "customer" && !["pickup", "return", "incident", "customer_response"].includes(parsed.data.evidenceKind)) {
    res.status(403).json({ error: "Customers may attach evidence to a reported incident or handover" }); return;
  }
  if (parsed.data.incidentId) {
    const [incident] = await db.select().from(rentalIncidentsTable).where(and(
      eq(rentalIncidentsTable.id, parsed.data.incidentId), eq(rentalIncidentsTable.reservationId, reservationId),
    ));
    if (!incident) { res.status(404).json({ error: "Incident not found" }); return; }
  }
  if (parsed.data.claimId) {
    const [claim] = await db.select().from(rentalClaimsTable).where(and(
      eq(rentalClaimsTable.id, parsed.data.claimId), eq(rentalClaimsTable.reservationId, reservationId),
    ));
    if (!claim || actor.type === "customer" && parsed.data.evidenceKind !== "customer_response") {
      res.status(404).json({ error: "Claim not found" }); return;
    }
  }
  if (parsed.data.claimItemId) {
    const [item] = await db.select().from(rentalClaimItemsTable).where(eq(rentalClaimItemsTable.id, parsed.data.claimItemId));
    if (!item || !parsed.data.claimId || item.claimId !== parsed.data.claimId) {
      res.status(404).json({ error: "Claim item not found" }); return;
    }
  }
  if (parsed.data.inspectionId) {
    const expectedType = parsed.data.evidenceKind === "pickup" ? "pickup" : "return";
    const [inspection] = await db.select().from(rentalInspectionsTable).where(and(
      eq(rentalInspectionsTable.id, parsed.data.inspectionId),
      eq(rentalInspectionsTable.reservationId, reservationId),
      eq(rentalInspectionsTable.type, expectedType),
    ));
    if (!inspection) { res.status(404).json({ error: "Matching pickup or return inspection not found" }); return; }
  }
  const token = createRentalDocumentToken();
  await db.insert(rentalExceptionEvidenceTable).values({
    token, reservationId, operatorId: reservation.operatorId ?? 0,
    incidentId: parsed.data.incidentId ?? null,
    claimId: parsed.data.claimId ?? null,
    claimItemId: parsed.data.claimItemId ?? null,
    inspectionId: parsed.data.inspectionId ?? null,
    evidenceKind: parsed.data.evidenceKind,
    contentType: parsed.data.contentType,
    expiresAt: new Date(Date.now() + 60 * 60_000),
  });
  res.status(201).json({
    reference: token,
    uploadPath: `/rental/exceptions/reservations/${reservationId}/evidence/${token}/content`,
    method: "PUT",
    contentType: parsed.data.contentType,
    maxBytes: 10 * 1024 * 1024,
  });
});

router.put("/rental/exceptions/reservations/:id/evidence/:token/content", async (req, res): Promise<void> => {
  const reservationId = validId(req.params.id);
  const token = z.string().uuid().safeParse(req.params.token);
  if (!reservationId || !token.success) { res.status(404).json({ error: "Upload request not found" }); return; }
  const reservation = await reservationFor(reservationId);
  const actor = reservation ? await actorFor(req, reservation) : null;
  const [evidence] = await db.select().from(rentalExceptionEvidenceTable).where(and(
    eq(rentalExceptionEvidenceTable.token, token.data),
    eq(rentalExceptionEvidenceTable.reservationId, reservationId),
  ));
  if (!reservation || !actor || !evidence || evidence.uploadedAt || evidence.expiresAt <= new Date()) {
    res.status(404).json({ error: "Upload request expired or not found" }); return;
  }
  if (actor.type === "partner" && actor.operatorId !== reservation.operatorId) { res.status(404).json({ error: "Upload request not found" }); return; }
  const contentType = req.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  const contentLength = Number(req.get("content-length") ?? 0);
  if (!contentType || contentType !== evidence.contentType) { res.status(415).json({ error: "Content type does not match upload request" }); return; }
  if (contentLength > 10 * 1024 * 1024) { res.status(413).json({ error: "Evidence exceeds the 10 MB limit" }); return; }
  try {
    await receiveRentalDocumentUpload(rentalDocumentObjectName(reservationId, token.data), req, contentType);
    await db.update(rentalExceptionEvidenceTable).set({ uploadedAt: new Date() })
      .where(eq(rentalExceptionEvidenceTable.token, token.data));
    const createdEvent = await event({
      reservationId,
      actor,
      incidentId: evidence.incidentId ?? undefined,
      claimId: evidence.claimId ?? undefined,
      claimItemId: evidence.claimItemId ?? undefined,
      eventType: "private_evidence_uploaded",
      details: { evidenceKind: evidence.evidenceKind, contentType: evidence.contentType },
    });
    await notify(reservation, "private_evidence_uploaded", createdEvent.id, "New private rental evidence was uploaded.");
    res.status(204).end();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Private evidence storage unavailable";
    res.status(message.includes("exceeds") ? 413 : 503).json({ error: message });
  }
});

router.get("/rental/exceptions/evidence/:token", async (req, res): Promise<void> => {
  const token = z.string().uuid().safeParse(req.params.token);
  if (!token.success) { res.status(404).json({ error: "Evidence not found" }); return; }
  const [evidence] = await db.select().from(rentalExceptionEvidenceTable).where(eq(rentalExceptionEvidenceTable.token, token.data));
  const reservation = evidence ? await reservationFor(evidence.reservationId) : null;
  const actor = reservation ? await actorFor(req, reservation) : null;
  if (!evidence?.uploadedAt || !reservation || !actor || actor.type === "partner" && actor.operatorId !== reservation.operatorId) {
    res.status(404).json({ error: "Evidence not found" }); return;
  }
  try {
    await streamRentalDocument(rentalDocumentObjectName(reservation.id, token.data), res);
  } catch {
    if (!res.headersSent) res.status(404).json({ error: "Evidence not found" });
    else res.destroy();
  }
});

router.post("/admin/rental/exceptions/claims/:claimId/decision", requireAdminAuth, async (req, res): Promise<void> => {
  const claimId = validId(req.params.claimId);
  const parsed = DecisionSchema.safeParse(req.body);
  if (!claimId || !parsed.success) { res.status(400).json({ error: parsed.success ? "Invalid claim ID" : parsed.error.message }); return; }
  const [claim] = await db.select().from(rentalClaimsTable).where(eq(rentalClaimsTable.id, claimId));
  const reservation = claim ? await reservationFor(claim.reservationId) : null;
  if (!claim || !reservation) { res.status(404).json({ error: "Claim not found" }); return; }
  if (["approved", "rejected", "closed"].includes(claim.status)) { res.status(409).json({ error: "Claim has already been decided" }); return; }
  const session = req.session as unknown as { admin?: { username?: string } };
  const actor: Actor = { type: "admin", id: session.admin?.username ?? "admin" };
  const accepted = parsed.data.decision === "approve";
  const items = await db.select().from(rentalClaimItemsTable).where(eq(rentalClaimItemsTable.claimId, claimId));
  if (accepted) {
    if (!items.length) { res.status(409).json({ error: "A claim requires itemized charges before approval" }); return; }
    const effectiveInsurerOutcome = parsed.data.insurerOutcome ?? claim.insurerOutcome;
    if (!claim.invoiceReference?.trim()) {
      res.status(409).json({ error: "An invoice reference is required before claim approval" }); return;
    }
    if (!effectiveInsurerOutcome?.trim()) {
      res.status(409).json({ error: "Record an insurer outcome (or mark it not applicable) before claim approval" }); return;
    }
    const [invoiceEvidence] = await db.select({ token: rentalExceptionEvidenceTable.token })
      .from(rentalExceptionEvidenceTable).where(and(
        eq(rentalExceptionEvidenceTable.claimId, claimId),
        eq(rentalExceptionEvidenceTable.evidenceKind, "invoice"),
        isNotNull(rentalExceptionEvidenceTable.uploadedAt),
      )).limit(1);
    if (!invoiceEvidence) {
      res.status(409).json({ error: "Upload private invoice evidence before claim approval" }); return;
    }
    const handovers = await db.select().from(rentalInspectionsTable)
      .where(eq(rentalInspectionsTable.reservationId, reservation.id));
    const missingHandovers: string[] = [];
    for (const kind of ["pickup", "return"] as const) {
      const handover = handovers.find((inspection) => inspection.type === kind);
      const [privatePhoto] = handover ? await db.select({ id: rentalInspectionPhotosTable.id })
        .from(rentalInspectionPhotosTable).where(and(
          eq(rentalInspectionPhotosTable.inspectionId, handover.id),
          isNotNull(rentalInspectionPhotosTable.storageKey),
        )).limit(1) : [];
      const [uploadedExceptionEvidence] = await db.select({ token: rentalExceptionEvidenceTable.token })
        .from(rentalExceptionEvidenceTable).where(and(
          eq(rentalExceptionEvidenceTable.reservationId, reservation.id),
          eq(rentalExceptionEvidenceTable.evidenceKind, kind),
          isNotNull(rentalExceptionEvidenceTable.uploadedAt),
        )).limit(1);
      if (!privatePhoto && !uploadedExceptionEvidence) missingHandovers.push(kind);
    }
    if (missingHandovers.length) {
      res.status(409).json({ error: "Uploaded private pickup and return evidence is required before claim approval", missingHandovers });
      return;
    }
    const claimEvidence = await db.select({
      claimItemId: rentalExceptionEvidenceTable.claimItemId,
      uploadedAt: rentalExceptionEvidenceTable.uploadedAt,
    }).from(rentalExceptionEvidenceTable).where(and(
      eq(rentalExceptionEvidenceTable.claimId, claimId),
    ));
    const evidencedItemIds = new Set(claimEvidence
      .filter((record) => record.uploadedAt !== null && record.claimItemId !== null)
      .map((record) => record.claimItemId!));
    const missingEvidenceItemIds = items.filter((item) => !evidencedItemIds.has(item.id)).map((item) => item.id);
    if (missingEvidenceItemIds.length) {
      res.status(409).json({
        error: "Each claim item needs uploaded private evidence before platform approval",
        missingEvidenceItemIds,
      }); return;
    }
  }
  for (const item of items) {
    await db.update(rentalClaimItemsTable).set({ status: accepted ? "approved" : "rejected" })
      .where(eq(rentalClaimItemsTable.id, item.id));
  }
  const [updated] = await db.update(rentalClaimsTable).set({
    status: accepted ? "approved" : "rejected",
    decision: parsed.data.notes,
    decidedBy: actor.id,
    decidedAt: new Date(),
    insurerOutcome: parsed.data.insurerOutcome ?? claim.insurerOutcome,
    // Approval authorizes consideration only. No provider charge is initiated here.
    providerChargeStatus: "not_configured",
    updatedAt: new Date(),
  }).where(eq(rentalClaimsTable.id, claimId)).returning();
  const createdEvent = await event({
    reservationId: reservation.id, actor, claimId, eventType: accepted ? "platform_approved_claim" : "platform_rejected_claim",
    details: {
      decision: parsed.data.notes,
      insurerOutcome: parsed.data.insurerOutcome ?? claim.insurerOutcome,
      itemIds: items.map((item) => item.id),
      providerChargeStatus: "not_configured",
    },
  });
  await notify(reservation, "claim_platform_decision", createdEvent.id, `Platform ${accepted ? "approved" : "rejected"} claim #${claimId}.`);
  res.json({ claim: updated, items: await db.select().from(rentalClaimItemsTable).where(eq(rentalClaimItemsTable.claimId, claimId)), chargeStatus: "not_configured" });
});

router.post("/admin/rental/exceptions/incidents/:incidentId/resolve", requireAdminAuth, async (req, res): Promise<void> => {
  const incidentId = validId(req.params.incidentId);
  const parsed = ResolveIncidentSchema.safeParse(req.body);
  if (!incidentId || !parsed.success) { res.status(400).json({ error: parsed.success ? "Invalid incident ID" : parsed.error.message }); return; }
  const [incident] = await db.select().from(rentalIncidentsTable).where(eq(rentalIncidentsTable.id, incidentId));
  const reservation = incident ? await reservationFor(incident.reservationId) : null;
  if (!incident || !reservation) { res.status(404).json({ error: "Incident not found" }); return; }
  const session = req.session as unknown as { admin?: { username?: string } };
  const actor: Actor = { type: "admin", id: session.admin?.username ?? "admin" };
  const [updated] = await db.update(rentalIncidentsTable).set({
    status: "resolved", resolvedAt: new Date(), updatedAt: new Date(),
  }).where(eq(rentalIncidentsTable.id, incidentId)).returning();
  if (incident.unsafeVehicle) {
    // Each unsafe report owns its own block. Release this report's block even
    // if another open incident still keeps the vehicle out of service.
    await db.delete(rentalAvailabilityBlocksTable).where(eq(
      rentalAvailabilityBlocksTable.createdBy,
      `rental-incident:${incidentId}`,
    ));
    const vehicleReservations = await db.select({ id: rentalReservationsTable.id })
      .from(rentalReservationsTable).where(eq(rentalReservationsTable.vehicleId, reservation.vehicleId));
    const activeUnsafe = vehicleReservations.length ? await db.select().from(rentalIncidentsTable).where(and(
      inArray(rentalIncidentsTable.reservationId, vehicleReservations.map((row) => row.id)),
      eq(rentalIncidentsTable.unsafeVehicle, true),
      eq(rentalIncidentsTable.status, "open"),
    )) : [];
    if (!activeUnsafe.length) {
      await db.update(rentalVehiclesTable).set({
        operationalStatus: incident.priorOperationalStatus ?? "available",
        updatedAt: new Date(),
      })
        .where(eq(rentalVehiclesTable.id, reservation.vehicleId));
    }
  }
  const createdEvent = await event({
    reservationId: reservation.id, actor, incidentId, eventType: "platform_resolved_incident",
    details: { resolution: parsed.data.resolution },
  });
  await notify(reservation, "incident_resolved", createdEvent.id, `Incident #${incidentId} was resolved by the platform.`);
  res.json({ incident: updated });
});

export default router;