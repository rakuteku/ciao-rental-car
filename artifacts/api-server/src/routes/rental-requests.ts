import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request as ExpressRequest, type Response as ExpressResponse } from "express";
import { createHash } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  db,
  rentalDriversTable,
  rentalMarketplaceRequestsTable,
  rentalNotificationsTable,
  rentalOperatorsTable,
  rentalReservationAddonsTable,
  rentalReservationDriversTable,
  rentalReservationHoldsTable,
  rentalReservationsTable,
  rentalVehiclesTable,
} from "@workspace/db";
import { z } from "zod/v4";
import { calculatePrice } from "../lib/rental-pricing";
import { marketplacePolicy } from "../lib/marketplace-policy";
import { isMarketplaceEnabled, isRentalRequestExpired, mayAcceptAlternateOffer } from "../lib/rental-request-policy.mjs";
import { requireAdminAuth } from "../middlewares/admin-auth";
import { queueRentalNotification, retryRentalNotification, type RentalNotificationEvent } from "../lib/rental-events";
import { authenticatePartner, partnerIdentity } from "./partner";
import { isVehicleAvailable, isVehicleServiceable, visibleVehicleIds } from "./rental-vehicles";

const router: IRouter = Router();
const marketplaceEnabled = () => isMarketplaceEnabled(process.env.RENTAL_MARKETPLACE_ENABLED);
const AttributionSchema = z.object({
  firstTouch: z.record(z.string(), z.unknown()).optional(),
  lastTouch: z.record(z.string(), z.unknown()).optional(),
  utmSource: z.string().max(500).optional(),
  utmMedium: z.string().max(500).optional(),
  utmCampaign: z.string().max(500).optional(),
  landingUrl: z.string().max(2000).optional(),
  referralCode: z.string().max(200).optional(),
  hotelCode: z.string().max(200).optional(),
}).strict();
const DriverSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(1).max(80),
  romanizedName: z.string().max(200).optional(),
  dateOfBirth: z.string().date().optional(),
  nationality: z.string().max(100).optional(),
  residenceCountry: z.string().max(100).optional(),
  address: z.string().max(1000).optional(),
  emergencyContact: z.string().max(500).optional(),
  flightNumber: z.string().max(100).optional(),
  accommodation: z.string().max(500).optional(),
}).strict();
const AddonsSchema = z.array(z.object({
  addonId: z.coerce.number().int().positive(),
  qty: z.coerce.number().int().min(1).max(20).default(1),
}).strict()).max(20);
const OfferDateSchema = z.string().datetime({ offset: true });
const LeadSchema = z.object({
  vehicleId: z.coerce.number().int().positive(),
  pickupAt: OfferDateSchema,
  returnAt: OfferDateSchema,
  pickupLocation: z.string().trim().min(1).max(300),
  returnLocation: z.string().trim().min(1).max(300),
  driver: DriverSchema,
  additionalDrivers: z.array(z.object({
    fullName: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(254),
    phone: z.string().trim().min(1).max(80),
  }).strict()).max(10).optional(),
  travelNotes: z.string().max(5000).optional(),
  marketingConsent: z.boolean(),
  locale: z.enum(["en", "ja"]).optional(),
  attribution: AttributionSchema.optional(),
  addons: AddonsSchema.optional(),
  totalPrice: z.number().finite().nonnegative().optional(),
  reason: z.string().trim().min(1).max(2000),
}).strict();
const CreateRequestSchema = z.object({
  holdId: z.coerce.number().int().positive(),
  vehicleId: z.coerce.number().int().positive(),
  pickupLocation: z.string().trim().min(1).max(300),
  returnLocation: z.string().trim().min(1).max(300),
  driver: DriverSchema,
  additionalDrivers: z.array(z.object({
    fullName: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(254),
    phone: z.string().trim().min(1).max(80),
  }).strict()).max(10).optional(),
  travelNotes: z.string().max(5000).optional(),
  marketingConsent: z.boolean(),
  locale: z.enum(["en", "ja"]).optional(),
  attribution: AttributionSchema.optional(),
  addons: AddonsSchema.optional(),
}).strict();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Internal server error";
}

function requestLocale(req: ExpressRequest): "en" | "ja" {
  return req.body?.locale === "ja" || (req.body?.locale !== "en" && req.get("accept-language")?.toLowerCase().startsWith("ja")) ? "ja" : "en";
}

function notifyRequest(req: ExpressRequest, input: {
  email?: string | null;
  eventType: RentalNotificationEvent;
  bookingId: number;
  locale?: "en" | "ja";
  extra?: Record<string, unknown>;
}) {
  void queueRentalNotification({ ...input, locale: input.locale ?? requestLocale(req) }).catch((error) => {
    req.log.error({ err: error, action: "rental_notification_enqueue_failed", eventType: input.eventType, bookingId: input.bookingId });
  });
}

function policySnapshot(policy: Awaited<ReturnType<typeof marketplacePolicy>>, vehicleDisclosures: unknown) {
  const canonical = Object.fromEntries(Object.entries(policy.values).sort(([left], [right]) => left.localeCompare(right)));
  const policyVersion = `sha256:${createHash("sha256").update(JSON.stringify(canonical)).digest("hex")}`;
  const commissionVersion = `sha256:${createHash("sha256")
    .update(JSON.stringify({ marketplaceCommissionPercent: policy.values.marketplaceCommissionPercent ?? null }))
    .digest("hex")}`;
  return {
    marketplace: policy.values,
    vehicle: vehicleDisclosures && typeof vehicleDisclosures === "object" ? vehicleDisclosures : {},
    missingMarketplaceTerms: policy.missing,
    version: { policyVersion, commissionVersion, capturedAt: new Date().toISOString() },
  };
}

type RentalRequestTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function lockVehicleIds(tx: RentalRequestTransaction, vehicleIds: number[]) {
  for (const vehicleId of [...new Set(vehicleIds)].sort((left, right) => left - right)) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${vehicleId})`);
  }
}

async function eligibleVehicleForOffer(
  tx: RentalRequestTransaction,
  vehicleId: number,
  operatorId?: number,
) {
  const [vehicle] = await tx.select().from(rentalVehiclesTable).where(and(
    eq(rentalVehiclesTable.id, vehicleId),
    isNull(rentalVehiclesTable.deletedAt),
    eq(rentalVehiclesTable.status, "published"),
  )).for("update");
  if (!vehicle || vehicle.operatorId == null || (operatorId != null && vehicle.operatorId !== operatorId)) {
    throw Object.assign(new Error("Vehicle is not an eligible vehicle for this operator"), { status: 404 });
  }
  const [operator] = await tx.select().from(rentalOperatorsTable).where(eq(rentalOperatorsTable.id, vehicle.operatorId));
  if (!operator || operator.status !== "active" || operator.verificationStatus !== "approved") {
    throw Object.assign(new Error("Vehicle is not eligible for marketplace offers"), { status: 409 });
  }
  const visibleIds = await visibleVehicleIds();
  if (!visibleIds.includes(vehicle.id)) {
    throw Object.assign(new Error("Vehicle is not eligible for marketplace offers"), { status: 409 });
  }
  return { vehicle, operator };
}

async function expireRequestIfDue(id: number) {
  const now = new Date();
  const [request] = await db.select().from(rentalMarketplaceRequestsTable)
    .where(eq(rentalMarketplaceRequestsTable.id, id));
  if (!request) return null;
  if (isRentalRequestExpired(request.status, request.respondBy, request.paymentDeadline, now)) {
    const [expired] = await db.update(rentalMarketplaceRequestsTable).set({
      status: "expired",
      updatedAt: now,
    }).where(and(
      eq(rentalMarketplaceRequestsTable.id, id),
      eq(rentalMarketplaceRequestsTable.status, request.status),
    )).returning();
    if (expired) await db.update(rentalReservationHoldsTable).set({ releasedAt: now })
      .where(and(
        sql`${rentalReservationHoldsTable.id} IN (${request.holdId}, ${request.offerHoldId ?? request.holdId})`,
        isNull(rentalReservationHoldsTable.releasedAt),
      ));
    if (expired?.reservationId) await db.update(rentalReservationsTable).set({
      status: "cancelled",
      updatedAt: now,
    }).where(and(
      eq(rentalReservationsTable.id, expired.reservationId),
      eq(rentalReservationsTable.status, "pending_payment"),
    ));
    return expired ?? request;
  }
  return request;
}

function serializeRequest(request: typeof rentalMarketplaceRequestsTable.$inferSelect) {
  return {
    id: request.id,
    vehicleId: request.vehicleId,
    status: request.status,
    offer: request.currentOffer,
    originalOffer: request.initialOffer,
    acceptedOffer: request.acceptedOffer,
    respondBy: request.respondBy.toISOString(),
    paymentDeadline: request.paymentDeadline?.toISOString() ?? null,
    declinedReason: request.declinedReason,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}

router.post("/rental/requests", async (req, res): Promise<void> => {
  if (!marketplaceEnabled()) return void res.status(404).json({ error: "Rental marketplace is disabled" });
  const parsed = CreateRequestSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: parsed.error.message });
  const data = parsed.data;
  const [hold] = await db.select().from(rentalReservationHoldsTable).where(and(
    eq(rentalReservationHoldsTable.id, data.holdId),
    eq(rentalReservationHoldsTable.sessionToken, req.sessionID),
    eq(rentalReservationHoldsTable.vehicleId, data.vehicleId),
    isNull(rentalReservationHoldsTable.releasedAt),
  ));
  if (!hold || hold.heldUntil <= new Date()) return void res.status(409).json({ error: "Hold is invalid or expired" });
  const pickup = hold.pickupAt;
  const returnAt = hold.returnAt;
  if (returnAt <= pickup) {
    return void res.status(400).json({ error: "Hold must contain exact pickup and return instants" });
  }
  const [vehicle] = await db.select().from(rentalVehiclesTable).where(and(
    eq(rentalVehiclesTable.id, data.vehicleId),
    isNull(rentalVehiclesTable.deletedAt),
    eq(rentalVehiclesTable.status, "published"),
  ));
  if (!vehicle || vehicle.operatorId == null) return void res.status(404).json({ error: "Vehicle not found" });
  if (!isVehicleServiceable(vehicle, data.pickupLocation, data.returnLocation)) {
    return void res.status(409).json({ error: "Vehicle cannot serve the requested pickup or return location" });
  }
  const visibleIds = await visibleVehicleIds();
  if (!visibleIds.includes(vehicle.id)) return void res.status(404).json({ error: "Vehicle not found" });
  const [operator] = await db.select().from(rentalOperatorsTable).where(eq(rentalOperatorsTable.id, vehicle.operatorId));
  if (!operator || operator.status !== "active" || operator.verificationStatus !== "approved") {
    return void res.status(404).json({ error: "Vehicle not found" });
  }

  const policy = await marketplacePolicy();
  const responseHours = Number(policy.values.marketplaceResponsePeriodHours);
  if (!Number.isFinite(responseHours) || responseHours <= 0) {
    return void res.status(503).json({ error: "Marketplace response deadline is not configured" });
  }
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${vehicle.id})`);
      const [lockedHold] = await tx.select().from(rentalReservationHoldsTable).where(and(
        eq(rentalReservationHoldsTable.id, hold.id),
        eq(rentalReservationHoldsTable.sessionToken, req.sessionID),
        isNull(rentalReservationHoldsTable.releasedAt),
      ));
      if (!lockedHold || lockedHold.heldUntil <= new Date()) {
        throw Object.assign(new Error("Hold is invalid or expired"), { status: 409 });
      }
      const [existingRequest] = await tx.select({ id: rentalMarketplaceRequestsTable.id })
        .from(rentalMarketplaceRequestsTable)
        .where(eq(rentalMarketplaceRequestsTable.holdId, hold.id));
      if (existingRequest) throw Object.assign(new Error("A marketplace request already exists for this hold"), { status: 409 });
      if (!await isVehicleAvailable(vehicle.id, pickup, returnAt, hold.id, undefined, tx)) {
        throw Object.assign(new Error("Vehicle is no longer available"), { status: 409 });
      }
      const pricing = await calculatePrice({
        vehicleId: vehicle.id,
        pickupAt: pickup,
        returnAt,
        addons: data.addons,
        pickupLocation: data.pickupLocation,
        returnLocation: data.returnLocation,
      }, tx);
      const now = new Date();
      const respondBy = new Date(now.getTime() + responseHours * 3_600_000);
      const offer = {
        vehicleId: vehicle.id,
        operatorId: operator.id,
        pricing,
        totalPrice: pricing.finalTotal,
        currency: pricing.currency,
        policy: policySnapshot(policy, vehicle.disclosures),
        pickupAt: pickup.toISOString(),
        returnAt: returnAt.toISOString(),
        pickupLocation: data.pickupLocation,
        returnLocation: data.returnLocation,
      };
      const token = randomUUID();
      const [request] = await tx.insert(rentalMarketplaceRequestsTable).values({
        operatorId: operator.id,
        vehicleId: vehicle.id,
        holdId: hold.id,
        status: "requested",
        customerAccessToken: token,
        driver: data.driver,
        additionalDrivers: data.additionalDrivers ?? [],
        addons: data.addons ?? [],
        travelNotes: data.travelNotes ?? null,
        marketingConsent: data.marketingConsent,
        locale: requestLocale(req),
        attribution: data.attribution ?? null,
        initialOffer: offer,
        currentOffer: offer,
        offerHistory: [{ type: "customer_request", at: now.toISOString(), offer }],
        requestedAt: now,
        respondBy,
      }).returning();
      await tx.update(rentalReservationHoldsTable).set({ heldUntil: respondBy }).where(eq(rentalReservationHoldsTable.id, hold.id));
      return { request, token };
    });
    notifyRequest(req, {
      email: typeof (result.request.driver as Record<string, unknown>).email === "string"
        ? String((result.request.driver as Record<string, unknown>).email) : null,
      eventType: "request",
      bookingId: result.request.id,
      extra: { respondBy: result.request.respondBy.toISOString() },
    });
    notifyRequest(req, {
      email: operator.contactEmail,
      eventType: "alert",
      bookingId: result.request.id,
      extra: { message: `A new rental request requires a response by ${result.request.respondBy.toISOString()}.` },
    });
    res.status(201).json({
      ...serializeRequest(result.request),
      customerAccessToken: result.token,
    });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    res.status(status).json({ error: errorMessage(error) });
  }
});

router.get("/rental/requests/:id", async (req, res): Promise<void> => {
  if (!marketplaceEnabled()) return void res.status(404).json({ error: "Rental marketplace is disabled" });
  const id = Number(req.params.id);
  const accessCode = typeof req.query.accessCode === "string" ? req.query.accessCode : "";
  if (!Number.isSafeInteger(id) || id < 1 || !accessCode) return void res.status(400).json({ error: "Request ID and accessCode are required" });
  const request = await expireRequestIfDue(id);
  if (!request || request.customerAccessToken !== accessCode) return void res.status(404).json({ error: "Request not found" });
  const [paymentEmail] = await db.select({
    deliveryStatus: rentalNotificationsTable.deliveryStatus,
  }).from(rentalNotificationsTable).where(and(
    eq(rentalNotificationsTable.eventType, "acceptance"),
    sql`${rentalNotificationsTable.payload}->>'bookingId' = ${String(id)}`,
    eq(rentalNotificationsTable.email, String((request.driver as Record<string, unknown>).email ?? "")),
  )).orderBy(desc(rentalNotificationsTable.createdAt)).limit(1);
  res.set("Cache-Control", "no-store");
  res.json({ ...serializeRequest(request), paymentEmailStatus: paymentEmail?.deliveryStatus ?? "pending" });
});

async function createPaymentReservation(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  request: typeof rentalMarketplaceRequestsTable.$inferSelect,
  offer: Record<string, unknown>,
  paymentDeadline: Date,
  acceptedBy: "customer" | "partner",
) {
  const inventoryHoldId = request.offerHoldId ?? request.holdId;
  if (Number(offer.vehicleId) !== request.vehicleId) throw new Error("Accepted offer vehicle does not match its inventory reservation");
  const driver = request.driver as Record<string, unknown>;
  const [createdDriver] = await tx.insert(rentalDriversTable).values({
    fullName: String(driver.fullName),
    email: String(driver.email),
    phone: String(driver.phone),
    romanizedName: typeof driver.romanizedName === "string" ? driver.romanizedName : null,
    dob: typeof driver.dateOfBirth === "string" ? driver.dateOfBirth : null,
    nationality: typeof driver.nationality === "string" ? driver.nationality : null,
    country: typeof driver.residenceCountry === "string" ? driver.residenceCountry : null,
    address: typeof driver.address === "string" ? driver.address : null,
    emergencyContact: typeof driver.emergencyContact === "string" ? driver.emergencyContact : null,
    flightNumber: typeof driver.flightNumber === "string" ? driver.flightNumber : null,
    accommodation: typeof driver.accommodation === "string" ? driver.accommodation : null,
  }).returning();
  const pricing = offer.pricing as Record<string, unknown>;
  const totalPrice = Number(offer.totalPrice);
  if (!Number.isFinite(totalPrice) || totalPrice < 0) throw new Error("Offer price is invalid");
  const addonRows = Array.isArray(pricing.addons) ? pricing.addons as Array<Record<string, unknown>> : [];
  const [reservation] = await tx.insert(rentalReservationsTable).values({
    operatorId: request.operatorId,
    vehicleId: request.vehicleId,
    primaryDriverId: createdDriver.id,
    pickupAt: new Date(String(offer.pickupAt)),
    returnAt: new Date(String(offer.returnAt)),
    pickupLocation: String(offer.pickupLocation),
    returnLocation: String(offer.returnLocation),
    status: "pending_payment",
    paymentStatus: "pending",
    subtotal: Number(pricing.subtotal) || 0,
    addonsTotal: Number(pricing.addonsTotal) || 0,
    deliveryFee: (Number(pricing.deliveryFee) || 0) + (Number(pricing.airportPickupFee) || 0) + (Number(pricing.airportDropoffFee) || 0),
    discount: Number(pricing.discount) || 0,
    tax: Number(pricing.tax) || 0,
    securityDeposit: Number(pricing.securityDeposit) || 0,
    outstanding: totalPrice,
    finalTotal: totalPrice,
    source: "marketplace_request",
    customerAccessToken: request.customerAccessToken,
    attribution: request.attribution,
    marketingConsent: request.marketingConsent,
    marketplaceOfferSnapshot: offer,
  }).returning();
  const extraDrivers = request.additionalDrivers ?? [];
  const linkedDrivers = [{ id: createdDriver.id, isPrimary: true }];
  for (const additional of extraDrivers) {
    const [driver] = await tx.insert(rentalDriversTable).values({
      fullName: String(additional.fullName),
      email: String(additional.email),
      phone: String(additional.phone),
    }).returning({ id: rentalDriversTable.id });
    linkedDrivers.push({ id: driver.id, isPrimary: false });
  }
  if (linkedDrivers.length) {
    await tx.insert(rentalReservationDriversTable).values(linkedDrivers.map((driver) => ({
      reservationId: reservation.id,
      driverId: driver.id,
      isPrimary: driver.isPrimary,
    })));
  }
  if (addonRows.length) await tx.insert(rentalReservationAddonsTable).values(addonRows.map((addon) => ({
    reservationId: reservation.id,
    addonId: Number(addon.addonId),
    qty: Number(addon.qty),
    unitPrice: Number(addon.unitPrice),
    totalPrice: Number(addon.totalPrice),
  })));
  await tx.update(rentalReservationHoldsTable).set({
    releasedAt: new Date(),
    reservationId: reservation.id,
  }).where(eq(rentalReservationHoldsTable.id, inventoryHoldId));
  await tx.update(rentalMarketplaceRequestsTable).set({
    status: "awaiting_payment",
    reservationId: reservation.id,
    acceptedOffer: offer,
    offerHistory: [...request.offerHistory, {
      type: "offer_accepted",
      acceptedBy,
      acceptedAt: new Date().toISOString(),
      offerSnapshot: offer,
    }],
    paymentDeadline,
    updatedAt: new Date(),
  }).where(eq(rentalMarketplaceRequestsTable.id, request.id));
  return reservation;
}

router.post("/rental/requests/:id/accept-offer", async (req, res): Promise<void> => {
  if (!marketplaceEnabled()) return void res.status(404).json({ error: "Rental marketplace is disabled" });
  const id = Number(req.params.id);
  const accessCode = typeof req.query.accessCode === "string" ? req.query.accessCode : "";
  if (!Number.isSafeInteger(id) || id < 1 || !accessCode) return void res.status(400).json({ error: "Request ID and accessCode are required" });
  const existing = await expireRequestIfDue(id);
  if (!existing || existing.customerAccessToken !== accessCode) return void res.status(404).json({ error: "Request not found" });
  if (!mayAcceptAlternateOffer(existing.status)) return void res.status(409).json({ error: "There is no alternate offer awaiting acceptance" });
  const policy = await marketplacePolicy();
  const paymentHours = Number(policy.values.marketplacePaymentWindowHours);
  if (!Number.isFinite(paymentHours) || paymentHours <= 0) {
    return void res.status(503).json({ error: "Marketplace payment deadline is not configured" });
  }
  try {
    const reservation = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${existing.vehicleId})`);
      const [request] = await tx.select().from(rentalMarketplaceRequestsTable).where(and(
        eq(rentalMarketplaceRequestsTable.id, id),
        eq(rentalMarketplaceRequestsTable.customerAccessToken, accessCode),
      )).for("update");
      if (!request) throw Object.assign(new Error("Request not found"), { status: 404 });
      if (!mayAcceptAlternateOffer(request.status)) throw Object.assign(new Error("There is no alternate offer awaiting acceptance"), { status: 409 });
      if (request.respondBy <= new Date()) {
        throw Object.assign(new Error("Offer has expired"), { status: 409 });
      }
      const inventoryHoldId = request.offerHoldId ?? request.holdId;
      const [hold] = await tx.select().from(rentalReservationHoldsTable).where(and(
        eq(rentalReservationHoldsTable.id, inventoryHoldId),
        eq(rentalReservationHoldsTable.vehicleId, request.vehicleId),
        isNull(rentalReservationHoldsTable.releasedAt),
      ));
      if (!hold || hold.heldUntil <= new Date()) throw Object.assign(new Error("Request inventory hold has expired"), { status: 409 });
      const currentOffer = request.currentOffer as Record<string, unknown>;
      if (new Date(String(currentOffer.pickupAt)).getTime() !== hold.pickupAt.getTime() ||
          new Date(String(currentOffer.returnAt)).getTime() !== hold.returnAt.getTime()) {
        throw new Error("Offer times do not match the reserved inventory");
      }
      if (!await isVehicleAvailable(request.vehicleId, hold.pickupAt, hold.returnAt, hold.id, undefined, tx)) {
        throw Object.assign(new Error("Vehicle is no longer available"), { status: 409 });
      }
      if (request.respondBy <= new Date()) throw Object.assign(new Error("Offer has expired"), { status: 409 });
      const deadline = new Date(Date.now() + paymentHours * 3_600_000);
      const created = await createPaymentReservation(
        tx,
        request,
        currentOffer,
        deadline,
        "customer",
      );
      return { reservation: created, deadline };
    });
    notifyRequest(req, {
      email: typeof (existing.driver as Record<string, unknown>).email === "string"
        ? String((existing.driver as Record<string, unknown>).email) : null,
      eventType: "acceptance",
      bookingId: id,
      locale: existing.locale === "ja" ? "ja" : "en",
      extra: { paymentDeadline: reservation.deadline.toISOString() },
    });
    res.json({
      id,
      status: "awaiting_payment",
      reservationId: reservation.reservation.id,
      paymentDeadline: reservation.deadline.toISOString(),
      price: reservation.reservation.finalTotal,
    });
  } catch (error) {
    res.status((error as { status?: number }).status ?? 500).json({ error: errorMessage(error) });
  }
});

router.post("/rental/requests/:id/decline-offer", async (req, res): Promise<void> => {
  if (!marketplaceEnabled()) return void res.status(404).json({ error: "Rental marketplace is disabled" });
  const id = Number(req.params.id);
  const accessCode = typeof req.query.accessCode === "string" ? req.query.accessCode : "";
  if (!Number.isSafeInteger(id) || id < 1 || !accessCode) {
    return void res.status(400).json({ error: "Request ID and accessCode are required" });
  }
  const updated = await db.transaction(async (tx) => {
    const [candidate] = await tx.select({
      id: rentalMarketplaceRequestsTable.id,
      vehicleId: rentalMarketplaceRequestsTable.vehicleId,
      status: rentalMarketplaceRequestsTable.status,
      respondBy: rentalMarketplaceRequestsTable.respondBy,
    }).from(rentalMarketplaceRequestsTable).where(and(
      eq(rentalMarketplaceRequestsTable.id, id),
      eq(rentalMarketplaceRequestsTable.customerAccessToken, accessCode),
    ));
    if (!candidate || candidate.status !== "offer_pending" || candidate.respondBy <= new Date()) return null;
    await lockVehicleIds(tx, [candidate.vehicleId]);
    const [request] = await tx.select().from(rentalMarketplaceRequestsTable).where(and(
      eq(rentalMarketplaceRequestsTable.id, id),
      eq(rentalMarketplaceRequestsTable.customerAccessToken, accessCode),
    )).for("update");
    if (!request || request.status !== "offer_pending" || request.respondBy <= new Date() ||
        request.vehicleId !== candidate.vehicleId) return null;
    const inventoryHoldId = request.offerHoldId ?? request.holdId;
    const [hold] = await tx.select().from(rentalReservationHoldsTable).where(and(
      eq(rentalReservationHoldsTable.id, inventoryHoldId),
      eq(rentalReservationHoldsTable.vehicleId, request.vehicleId),
      isNull(rentalReservationHoldsTable.releasedAt),
    )).for("update");
    if (!hold) return null;
    const now = new Date();
    const [declined] = await tx.update(rentalMarketplaceRequestsTable).set({
      status: "declined",
      declinedReason: "Customer declined the alternate offer",
      updatedAt: now,
      offerHistory: [...request.offerHistory, {
        type: "customer_declined_offer",
        offerSnapshot: request.currentOffer,
        at: now.toISOString(),
      }],
    }).where(and(
      eq(rentalMarketplaceRequestsTable.id, request.id),
      eq(rentalMarketplaceRequestsTable.status, "offer_pending"),
    )).returning();
    if (declined) await tx.update(rentalReservationHoldsTable).set({ releasedAt: now })
      .where(eq(rentalReservationHoldsTable.id, inventoryHoldId));
    return declined ?? null;
  });
  if (!updated) return void res.status(409).json({ error: "Offer is no longer available" });
  notifyRequest(req, {
    email: typeof ((updated.driver as Record<string, unknown> | undefined)?.email) === "string"
      ? String((updated.driver as Record<string, unknown>).email) : null,
    eventType: "decline",
    bookingId: updated.id,
    locale: updated.locale === "ja" ? "ja" : "en",
    extra: { reason: updated.declinedReason ?? undefined },
  });
  res.json(serializeRequest(updated));
});

router.get("/partner/rental/requests", authenticatePartner, async (req, res): Promise<void> => {
  const current = partnerIdentity(req);
  const requests = await db.select({ request: rentalMarketplaceRequestsTable, vehicle: rentalVehiclesTable })
    .from(rentalMarketplaceRequestsTable)
    .innerJoin(rentalVehiclesTable, eq(rentalVehiclesTable.id, rentalMarketplaceRequestsTable.vehicleId))
    .where(and(
      eq(rentalMarketplaceRequestsTable.operatorId, current.operatorId),
      eq(rentalVehiclesTable.operatorId, current.operatorId),
    )).orderBy(desc(rentalMarketplaceRequestsTable.createdAt));
  const currentRequests = await Promise.all(requests.map(async ({ request, vehicle }) => ({
    request: await expireRequestIfDue(request.id) ?? request,
    vehicle,
  })));
  res.set("Cache-Control", "no-store");
  res.json(currentRequests.map(({ request, vehicle }) => ({
    ...serializeRequest(request),
    driver: request.driver,
    additionalDrivers: request.additionalDrivers,
    travelNotes: request.travelNotes,
    attribution: request.attribution,
    marketingConsent: request.marketingConsent,
    vehicle: { id: vehicle.id, publicTitle: vehicle.publicTitle, slug: vehicle.slug },
  })));
});

function requestId(req: ExpressRequest): number {
  return Number(req.params.id);
}

async function scopedPartnerRequest(req: ExpressRequest) {
  const current = partnerIdentity(req);
  const id = requestId(req);
  if (!Number.isSafeInteger(id) || id < 1) return { current, request: null };
  const [request] = await db.select().from(rentalMarketplaceRequestsTable).where(and(
    eq(rentalMarketplaceRequestsTable.id, id),
    eq(rentalMarketplaceRequestsTable.operatorId, current.operatorId),
  ));
  return { current, request: request ? await expireRequestIfDue(request.id) : null };
}

router.post("/partner/rental/requests/:id/accept", authenticatePartner, async (req, res): Promise<void> => {
  const { request } = await scopedPartnerRequest(req);
  if (!request) return void res.status(404).json({ error: "Request not found" });
  if (request.status !== "requested") return void res.status(409).json({ error: "Request is not awaiting a partner response" });
  const policy = await marketplacePolicy();
  const paymentHours = Number(policy.values.marketplacePaymentWindowHours);
  if (!Number.isFinite(paymentHours) || paymentHours <= 0) return void res.status(503).json({ error: "Marketplace payment deadline is not configured" });
  try {
    const deadline = new Date(Date.now() + paymentHours * 3_600_000);
    const reservation = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${request.vehicleId})`);
      const [current] = await tx.select().from(rentalMarketplaceRequestsTable).where(and(
        eq(rentalMarketplaceRequestsTable.id, request.id),
        eq(rentalMarketplaceRequestsTable.operatorId, partnerIdentity(req).operatorId),
        eq(rentalMarketplaceRequestsTable.status, "requested"),
      )).for("update");
      if (!current || current.respondBy <= new Date()) throw Object.assign(new Error("Request is no longer available"), { status: 409 });
      const [hold] = await tx.select().from(rentalReservationHoldsTable).where(and(
        eq(rentalReservationHoldsTable.id, current.holdId),
        isNull(rentalReservationHoldsTable.releasedAt),
      ));
      if (!hold || !await isVehicleAvailable(current.vehicleId, hold.pickupAt, hold.returnAt, hold.id, undefined, tx)) {
        throw Object.assign(new Error("Vehicle is no longer available"), { status: 409 });
      }
      if (current.respondBy <= new Date()) throw Object.assign(new Error("Request has expired"), { status: 409 });
      const result = await createPaymentReservation(
        tx,
        current,
        current.currentOffer as Record<string, unknown>,
        deadline,
        "partner",
      );
      return result;
    });
    notifyRequest(req, {
      email: typeof (request.driver as Record<string, unknown>).email === "string"
        ? String((request.driver as Record<string, unknown>).email) : null,
      eventType: "acceptance",
      bookingId: request.id,
      locale: request.locale === "ja" ? "ja" : "en",
      extra: { paymentDeadline: deadline.toISOString() },
    });
    res.json({ id: request.id, status: "awaiting_payment", reservationId: reservation.id, paymentDeadline: deadline.toISOString(), price: reservation.finalTotal });
  } catch (error) {
    res.status((error as { status?: number }).status ?? 500).json({ error: errorMessage(error) });
  }
});

router.post("/partner/rental/requests/:id/decline", authenticatePartner, async (req, res): Promise<void> => {
  const parsed = z.object({ reason: z.string().trim().min(1).max(2000) }).strict().safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: parsed.error.message });
  const { request } = await scopedPartnerRequest(req);
  if (!request) return void res.status(404).json({ error: "Request not found" });
  if (request.status !== "requested") return void res.status(409).json({ error: "Request is not awaiting a partner response" });
  const updated = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${request.vehicleId})`);
    const [current] = await tx.select().from(rentalMarketplaceRequestsTable).where(and(
      eq(rentalMarketplaceRequestsTable.id, request.id),
      eq(rentalMarketplaceRequestsTable.operatorId, partnerIdentity(req).operatorId),
      eq(rentalMarketplaceRequestsTable.status, "requested"),
    )).for("update");
    if (!current || current.respondBy <= new Date()) return null;
    const [declined] = await tx.update(rentalMarketplaceRequestsTable).set({
      status: "declined",
      declinedReason: parsed.data.reason,
      updatedAt: new Date(),
      offerHistory: [...current.offerHistory, { type: "partner_declined", reason: parsed.data.reason, at: new Date().toISOString() }],
    }).where(eq(rentalMarketplaceRequestsTable.id, current.id)).returning();
    await tx.update(rentalReservationHoldsTable).set({ releasedAt: new Date() })
      .where(and(eq(rentalReservationHoldsTable.id, current.holdId), isNull(rentalReservationHoldsTable.releasedAt)));
    return declined;
  });
  if (!updated) return void res.status(409).json({ error: "Request has already changed" });
  notifyRequest(req, {
    email: typeof (request.driver as Record<string, unknown>).email === "string"
      ? String((request.driver as Record<string, unknown>).email) : null,
    eventType: "decline",
    bookingId: request.id,
    locale: request.locale === "ja" ? "ja" : "en",
    extra: { reason: parsed.data.reason },
  });
  res.json(serializeRequest(updated));
});

const OfferSchema = z.object({
  totalPrice: z.number().finite().nonnegative(),
  reason: z.string().trim().min(1).max(2000),
  vehicleId: z.coerce.number().int().positive().optional(),
}).strict();
async function submitOffer(req: ExpressRequest, res: ExpressResponse, isAdmin: boolean) {
  if (!marketplaceEnabled()) {
    res.status(404).json({ error: "Rental marketplace is disabled" });
    return;
  }
  const parsed = OfferSchema.safeParse(req.body);
  const id = requestId(req);
  if (!Number.isSafeInteger(id) || id < 1 || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "Invalid request ID" : parsed.error.message });
    return;
  }
  const operatorId = isAdmin ? undefined : partnerIdentity(req).operatorId;
  const [request] = await db.select().from(rentalMarketplaceRequestsTable).where(and(
    eq(rentalMarketplaceRequestsTable.id, id),
    ...(operatorId ? [eq(rentalMarketplaceRequestsTable.operatorId, operatorId)] : []),
  ));
  if (!request) return void res.status(404).json({ error: "Request not found" });
  const active = await expireRequestIfDue(id);
  if (!active || active.status !== "requested") return void res.status(409).json({ error: "Request is not awaiting a partner response" });
  const targetVehicleId = parsed.data.vehicleId ?? active.vehicleId;
  const visibleIds = await visibleVehicleIds();
  if (!visibleIds.includes(targetVehicleId)) return void res.status(404).json({ error: "Vehicle not found" });
  const hours = Number((await marketplacePolicy()).values.marketplaceResponsePeriodHours);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 720) {
    return void res.status(503).json({ error: "Marketplace response deadline is not configured within the supported 720-hour maximum" });
  }
  const respondBy = new Date(Date.now() + hours * 3_600_000);
  let updated: typeof rentalMarketplaceRequestsTable.$inferSelect | null = null;
  try {
    updated = await db.transaction(async (tx) => {
      await lockVehicleIds(tx, [active.vehicleId, targetVehicleId]);
      const [current] = await tx.select().from(rentalMarketplaceRequestsTable).where(and(
        eq(rentalMarketplaceRequestsTable.id, id),
        ...(operatorId ? [eq(rentalMarketplaceRequestsTable.operatorId, operatorId)] : []),
        eq(rentalMarketplaceRequestsTable.status, "requested"),
      )).for("update");
      if (!current || current.respondBy <= new Date()) return null;
      const sourceHoldId = current.offerHoldId ?? current.holdId;
      const [sourceHold] = await tx.select().from(rentalReservationHoldsTable).where(and(
        eq(rentalReservationHoldsTable.id, sourceHoldId),
        eq(rentalReservationHoldsTable.vehicleId, current.vehicleId),
        isNull(rentalReservationHoldsTable.releasedAt),
      )).for("update");
      if (!sourceHold || sourceHold.heldUntil <= new Date()) {
        throw Object.assign(new Error("Original request inventory hold has expired"), { status: 409 });
      }
      const previousOffer = current.currentOffer as Record<string, unknown>;
      const { vehicle, operator } = await eligibleVehicleForOffer(tx, targetVehicleId, current.operatorId);
      if (!isVehicleServiceable(vehicle, String(previousOffer.pickupLocation), String(previousOffer.returnLocation))) {
        throw Object.assign(new Error("Offered vehicle cannot serve the requested pickup or return location"), { status: 409 });
      }
      const targetSameAsSource = targetVehicleId === current.vehicleId;
      if (!await isVehicleAvailable(
        targetVehicleId,
        sourceHold.pickupAt,
        sourceHold.returnAt,
        targetSameAsSource ? sourceHold.id : undefined,
        undefined,
        tx,
      )) {
        throw Object.assign(new Error("Offered vehicle is no longer available"), { status: 409 });
      }
      const pricing = await calculatePrice({
        vehicleId: vehicle.id,
        pickupAt: sourceHold.pickupAt,
        returnAt: sourceHold.returnAt,
        addons: current.addons,
        pickupLocation: String(previousOffer.pickupLocation),
        returnLocation: String(previousOffer.returnLocation),
      }, tx);
      if (current.respondBy <= new Date()) {
        throw Object.assign(new Error("Request has expired"), { status: 409 });
      }
      const policy = await marketplacePolicy();
      const nextOffer = {
        vehicleId: vehicle.id,
        operatorId: operator.id,
        pricing,
        totalPrice: parsed.data.totalPrice,
        currency: pricing.currency,
        policy: policySnapshot(policy, vehicle.disclosures),
        pickupAt: sourceHold.pickupAt.toISOString(),
        returnAt: sourceHold.returnAt.toISOString(),
        pickupLocation: previousOffer.pickupLocation,
        returnLocation: previousOffer.returnLocation,
        partnerReason: parsed.data.reason,
      };
      let activeHoldId = sourceHold.id;
      if (!targetSameAsSource) {
        const [newHold] = await tx.insert(rentalReservationHoldsTable).values({
          vehicleId: vehicle.id,
          pickupAt: sourceHold.pickupAt,
          returnAt: sourceHold.returnAt,
          heldUntil: respondBy,
          sessionToken: null,
        }).returning();
        activeHoldId = newHold.id;
        await tx.update(rentalReservationHoldsTable).set({ releasedAt: new Date() })
          .where(and(
            eq(rentalReservationHoldsTable.id, sourceHold.id),
            isNull(rentalReservationHoldsTable.releasedAt),
          ));
      } else {
        await tx.update(rentalReservationHoldsTable).set({ heldUntil: respondBy })
          .where(eq(rentalReservationHoldsTable.id, sourceHold.id));
      }
      const [offered] = await tx.update(rentalMarketplaceRequestsTable).set({
        vehicleId: vehicle.id,
        offerHoldId: targetSameAsSource ? current.offerHoldId : activeHoldId,
        status: "offer_pending",
        currentOffer: nextOffer,
        offerHistory: [...current.offerHistory, {
          type: isAdmin ? "admin_alternate_offer" : "partner_alternate_offer",
          staffId: isAdmin ? null : partnerIdentity(req).staffId,
          previousOffer,
          offer: nextOffer,
          sourceVehicleId: current.vehicleId,
          offeredVehicleId: vehicle.id,
          at: new Date().toISOString(),
        }],
        respondBy,
        updatedAt: new Date(),
      }).where(eq(rentalMarketplaceRequestsTable.id, current.id)).returning();
      return offered;
    });
  } catch (error) {
    res.status((error as { status?: number }).status ?? 500).json({ error: errorMessage(error) });
    return;
  }
  if (!updated) return void res.status(409).json({ error: "Request has already changed" });
  notifyRequest(req, {
    email: typeof (updated.driver as Record<string, unknown>).email === "string"
      ? String((updated.driver as Record<string, unknown>).email) : null,
    eventType: "request",
    bookingId: updated.id,
    locale: updated.locale === "ja" ? "ja" : "en",
    extra: {
      message: `An alternate rental offer is ready for review. Please respond by ${updated.respondBy.toISOString()}.`,
    },
  });
  res.json(serializeRequest(updated));
}

router.post("/partner/rental/requests/:id/offer", authenticatePartner, (req, res) => submitOffer(req, res, false));
router.post("/admin/rental/requests/:id/offer", requireAdminAuth, (req, res) => submitOffer(req, res, true));

async function createStaffQuote(req: ExpressRequest, res: ExpressResponse, operatorId?: number) {
  if (!marketplaceEnabled()) {
    res.status(404).json({ error: "Rental marketplace is disabled" });
    return;
  }
  const parsed = LeadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const pickupAt = new Date(data.pickupAt);
  const returnAt = new Date(data.returnAt);
  if (returnAt <= pickupAt) {
    res.status(400).json({ error: "Return time must be after pickup time" });
    return;
  }
  const visibleIds = await visibleVehicleIds();
  if (!visibleIds.includes(data.vehicleId)) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }
  const policy = await marketplacePolicy();
  const responseHours = Number(policy.values.marketplaceResponsePeriodHours);
  if (!Number.isFinite(responseHours) || responseHours <= 0 || responseHours > 720) {
    res.status(503).json({ error: "Marketplace response deadline is not configured within the supported 720-hour maximum" });
    return;
  }
  const now = new Date();
  const respondBy = new Date(now.getTime() + responseHours * 3_600_000);
  const token = randomUUID();
  try {
    const request = await db.transaction(async (tx) => {
      await lockVehicleIds(tx, [data.vehicleId]);
      const { vehicle, operator } = await eligibleVehicleForOffer(tx, data.vehicleId, operatorId);
      if (!isVehicleServiceable(vehicle, data.pickupLocation, data.returnLocation)) {
        throw Object.assign(new Error("Vehicle cannot serve the requested pickup or return location"), { status: 409 });
      }
      if (!await isVehicleAvailable(vehicle.id, pickupAt, returnAt, undefined, undefined, tx)) {
        throw Object.assign(new Error("Vehicle is no longer available for the quote"), { status: 409 });
      }
      const pricing = await calculatePrice({
        vehicleId: vehicle.id,
        pickupAt,
        returnAt,
        addons: data.addons,
        pickupLocation: data.pickupLocation,
        returnLocation: data.returnLocation,
      }, tx);
      const offer = {
        vehicleId: vehicle.id,
        operatorId: operator.id,
        pricing,
        totalPrice: data.totalPrice ?? pricing.finalTotal,
        currency: pricing.currency,
        policy: policySnapshot(policy, vehicle.disclosures),
        pickupAt: pickupAt.toISOString(),
        returnAt: returnAt.toISOString(),
        pickupLocation: data.pickupLocation,
        returnLocation: data.returnLocation,
        partnerReason: data.reason,
      };
      const [hold] = await tx.insert(rentalReservationHoldsTable).values({
        vehicleId: vehicle.id,
        pickupAt,
        returnAt,
        heldUntil: respondBy,
        sessionToken: null,
      }).returning();
      const staffId = operatorId == null ? null : partnerIdentity(req).staffId;
      const [created] = await tx.insert(rentalMarketplaceRequestsTable).values({
        operatorId: operator.id,
        vehicleId: vehicle.id,
        holdId: hold.id,
        offerHoldId: hold.id,
        status: "offer_pending",
        customerAccessToken: token,
        driver: data.driver,
        additionalDrivers: data.additionalDrivers ?? [],
        addons: data.addons ?? [],
        travelNotes: data.travelNotes ?? null,
        marketingConsent: data.marketingConsent,
        locale: requestLocale(req),
        attribution: data.attribution ?? null,
        initialOffer: offer,
        currentOffer: offer,
        offerHistory: [{
          type: operatorId == null ? "admin_created_quote" : "partner_created_quote",
          staffId,
          reason: data.reason,
          offerSnapshot: offer,
          at: now.toISOString(),
        }],
        requestedAt: now,
        respondBy,
      }).returning();
      return created;
    });
    notifyRequest(req, {
      email: typeof (request.driver as Record<string, unknown>).email === "string"
        ? String((request.driver as Record<string, unknown>).email) : null,
      eventType: "request",
      bookingId: request.id,
      locale: request.locale === "ja" ? "ja" : "en",
      extra: {
        message: `Your rental quote is ready for review. Please respond by ${request.respondBy.toISOString()}.`,
      },
    });
    res.status(201).json({ ...serializeRequest(request), customerAccessToken: token });
  } catch (error) {
    res.status((error as { status?: number }).status ?? 500).json({ error: errorMessage(error) });
  }
}

router.post("/partner/rental/requests/quote", authenticatePartner, (req, res) =>
  createStaffQuote(req, res, partnerIdentity(req).operatorId));
router.post("/admin/rental/requests/quote", requireAdminAuth, (req, res) => createStaffQuote(req, res));

router.post("/admin/rental/notifications/:id/retry", requireAdminAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return void res.status(400).json({ error: "Invalid notification ID" });
  const parsed = z.object({ confirmDuplicateRisk: z.boolean().optional().default(false) }).strict().safeParse(req.body ?? {});
  if (!parsed.success) return void res.status(400).json({ error: parsed.error.message });
  try {
    const notification = await retryRentalNotification(id, parsed.data.confirmDuplicateRisk);
    if (!notification) return void res.status(404).json({ error: "Rental notification not found" });
    res.json({
      id: notification.id,
      deliveryStatus: notification.deliveryStatus,
      attemptCount: notification.attemptCount,
      lastAttemptAt: notification.lastAttemptAt?.toISOString() ?? null,
      nextAttemptAt: notification.nextAttemptAt?.toISOString() ?? null,
      dataSubmittedAt: notification.dataSubmittedAt?.toISOString() ?? null,
      lastError: notification.lastError,
      sentAt: notification.sentAt?.toISOString() ?? null,
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

router.get("/admin/rental/notifications", requireAdminAuth, async (req, res): Promise<void> => {
  const statuses = ["pending", "unconfigured", "failed", "sent"] as const;
  const status = req.query.status;
  if (status !== undefined && (typeof status !== "string" || !statuses.includes(status as typeof statuses[number]))) {
    return void res.status(400).json({ error: "Invalid delivery status" });
  }
  const rows = await db.select({
    id: rentalNotificationsTable.id,
    email: rentalNotificationsTable.email,
    eventType: rentalNotificationsTable.eventType,
    deliveryStatus: rentalNotificationsTable.deliveryStatus,
    attemptCount: rentalNotificationsTable.attemptCount,
    lastAttemptAt: rentalNotificationsTable.lastAttemptAt,
    nextAttemptAt: rentalNotificationsTable.nextAttemptAt,
    dataSubmittedAt: rentalNotificationsTable.dataSubmittedAt,
    lastError: rentalNotificationsTable.lastError,
    sentAt: rentalNotificationsTable.sentAt,
    createdAt: rentalNotificationsTable.createdAt,
  }).from(rentalNotificationsTable)
    .where(status ? eq(rentalNotificationsTable.deliveryStatus, status) : undefined)
    .orderBy(desc(rentalNotificationsTable.createdAt))
    .limit(100);
  res.json(rows.map((row) => ({
    ...row,
    lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
    nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null,
    dataSubmittedAt: row.dataSubmittedAt?.toISOString() ?? null,
    sentAt: row.sentAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  })));
});

export default router;