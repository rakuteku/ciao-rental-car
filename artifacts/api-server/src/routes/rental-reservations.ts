import { Router, type IRouter } from "express";
import { eq, and, isNull, desc, sql, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  rentalReservationsTable,
  rentalReservationHoldsTable,
  rentalVehiclesTable,
  rentalDriversTable,
  rentalDriverDocumentsTable,
  rentalReservationAddonsTable,
  rentalAddonsTable,
  rentalSettingsTable,
  rentalAuditLogTable,
  rentalInspectionsTable,
  rentalInspectionPhotosTable,
  rentalDamagesTable,
  rentalVehiclePricingTable,
  rentalAvailabilityBlocksTable,
} from "@workspace/db";
import { requireAdminAuth } from "../middlewares/admin-auth";
import { calculatePrice } from "../lib/rental-pricing";
import { isVehicleAvailable, isVehicleServiceable } from "./rental-vehicles";
import { z } from "zod/v4";
import { logRentalAudit, queueRentalNotification } from "../lib/rental-events";

const router: IRouter = Router();

async function getHoldExpiryMinutes(): Promise<number> {
  const [setting] = await db
    .select()
    .from(rentalSettingsTable)
    .where(eq(rentalSettingsTable.key, "hold_expiry_minutes"));
  return setting ? parseInt(setting.value, 10) || 30 : 30;
}

function serializeReservation(res: typeof rentalReservationsTable.$inferSelect) {
  return {
    ...res,
    pickupAt: res.pickupAt.toISOString(),
    returnAt: res.returnAt.toISOString(),
    createdAt: res.createdAt.toISOString(),
    updatedAt: res.updatedAt.toISOString(),
    deletedAt: res.deletedAt?.toISOString() ?? null,
  };
}

function serializeCustomerReservation(res: typeof rentalReservationsTable.$inferSelect) {
  const { internalNotes: _internalNotes, customerAccessToken: _customerAccessToken, ...customerReservation } = serializeReservation(res);
  return customerReservation;
}

function serializeHold(hold: typeof rentalReservationHoldsTable.$inferSelect) {
  const { sessionToken: _sessionToken, reservationId: _reservationId, ...publicHold } = hold;
  return {
    ...publicHold,
    pickupAt: hold.pickupAt.toISOString(),
    returnAt: hold.returnAt.toISOString(),
    heldUntil: hold.heldUntil.toISOString(),
    releasedAt: hold.releasedAt?.toISOString() ?? null,
    createdAt: hold.createdAt.toISOString(),
  };
}

const HoldSchema = z.object({
  vehicleId: z.coerce.number().int(),
  pickupAt: z.string(),
  returnAt: z.string(),
  pickupLocation: z.string().optional(),
  returnLocation: z.string().optional(),
  addons: z
    .array(
      z.object({
        addonId: z.coerce.number().int(),
        qty: z.coerce.number().int().min(1).default(1),
      }),
    )
    .optional(),
  sessionToken: z.string().optional(),
});

router.post("/rental/reservations/hold", async (req, res): Promise<void> => {
  const body = HoldSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const pickupAt = new Date(body.data.pickupAt);
  const returnAt = new Date(body.data.returnAt);

  if (isNaN(pickupAt.getTime()) || isNaN(returnAt.getTime())) {
    res.status(400).json({ error: "Invalid date format" });
    return;
  }

  if (returnAt <= pickupAt) {
    res.status(400).json({ error: "Return date must be after pickup date" });
    return;
  }

  const vehicleId = body.data.vehicleId;

  const holdExpiryMinutes = await getHoldExpiryMinutes();
  (req.session as typeof req.session & { rentalHoldSession?: boolean }).rentalHoldSession = true;

  let hold: typeof rentalReservationHoldsTable.$inferSelect;
  try {
    hold = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${vehicleId})`);

      const [vehicle] = await tx
        .select()
        .from(rentalVehiclesTable)
        .where(
          and(
            eq(rentalVehiclesTable.id, vehicleId),
            isNull(rentalVehiclesTable.deletedAt),
            eq(rentalVehiclesTable.status, "published"),
          ),
        );

      if (!vehicle) {
        const err = new Error("Vehicle not found or not available") as Error & { status: number };
        err.status = 404;
        throw err;
      }

      if (!isVehicleServiceable(vehicle, body.data.pickupLocation, body.data.returnLocation)) {
        const err = new Error("Vehicle is not available at the selected pickup or return location") as Error & { status: number };
        err.status = 409;
        throw err;
      }

      const available = await isVehicleAvailable(vehicleId, pickupAt, returnAt, undefined, undefined, tx);
      if (!available) {
        const err = new Error("Vehicle is not available for the selected dates") as Error & { status: number };
        err.status = 409;
        throw err;
      }

      const heldUntil = new Date(Date.now() + holdExpiryMinutes * 60 * 1000);

      const [newHold] = await tx
        .insert(rentalReservationHoldsTable)
        .values({
          vehicleId,
          pickupAt,
          returnAt,
          heldUntil,
          sessionToken: req.sessionID,
        })
        .returning();

      return newHold;
    });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "Internal server error" });
    return;
  }

  res.status(201).json({ ...serializeHold(hold), holdId: hold.id, expired: false });
});

router.get("/rental/reservations/holds/:holdId", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.holdId) ? req.params.holdId[0] : req.params.holdId;
  const holdId = parseInt(rawId, 10);
  if (isNaN(holdId)) {
    res.status(400).json({ error: "Invalid hold ID" });
    return;
  }

  const [hold] = await db
    .select()
    .from(rentalReservationHoldsTable)
    .where(and(eq(rentalReservationHoldsTable.id, holdId), eq(rentalReservationHoldsTable.sessionToken, req.sessionID)));

  if (!hold) {
    res.status(404).json({ error: "Hold not found" });
    return;
  }

  res.json({
    ...serializeHold(hold),
    holdId: hold.id,
    expired: hold.releasedAt != null || hold.heldUntil <= new Date(),
  });
});

const CreateReservationSchema = z.object({
  holdId: z.coerce.number().int(),
  vehicleId: z.coerce.number().int(),
  pickupLocation: z.string().min(1),
  returnLocation: z.string().min(1),
  driver: z.object({
    fullName: z.string().min(1),
    email: z.string().email(),
    phone: z.string().min(1),
    romanizedName: z.string().optional(),
    dateOfBirth: z.string().date().optional(),
    nationality: z.string().optional(),
    residenceCountry: z.string().optional(),
    address: z.string().optional(),
    emergencyContact: z.string().optional(),
    flightNumber: z.string().optional(),
    accommodation: z.string().optional(),
  }),
  additionalDrivers: z.array(z.object({
    fullName: z.string().min(1),
    email: z.string().email(),
    phone: z.string().min(1),
  })).optional(),
  documents: z.array(z.object({
    docType: z.enum(["drivers_license", "passport", "international_license", "insurance", "credit_card", "other"]),
    fileUrl: z.string().url(),
  })).optional(),
  addons: z
    .array(
      z.object({
        addonId: z.coerce.number().int(),
        qty: z.coerce.number().int().min(1).default(1),
      }),
    )
    .optional(),
  source: z.string().optional(),
});

router.post("/rental/reservations", async (req, res): Promise<void> => {
  const body = CreateReservationSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const vehicleId = body.data.vehicleId;

  const [preHold] = await db
    .select()
    .from(rentalReservationHoldsTable)
    .where(and(eq(rentalReservationHoldsTable.id, body.data.holdId), eq(rentalReservationHoldsTable.sessionToken, req.sessionID)));

  if (!preHold || preHold.vehicleId !== vehicleId || preHold.releasedAt != null) {
    res.status(400).json({ error: "Invalid or expired hold" });
    return;
  }

  if (preHold.heldUntil < new Date()) {
    res.status(409).json({ error: "Hold has expired. Please start over." });
    return;
  }

  const pickupAt = preHold.pickupAt;
  const returnAt = preHold.returnAt;

  const pricing = await calculatePrice({
    vehicleId,
    pickupAt,
    returnAt,
    addons: body.data.addons,
    pickupLocation: body.data.pickupLocation,
    returnLocation: body.data.returnLocation,
  });

  let result: { reservation: typeof rentalReservationsTable.$inferSelect };
  try {
    result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${vehicleId})`);

      const [hold] = await tx
        .select()
        .from(rentalReservationHoldsTable)
        .where(and(eq(rentalReservationHoldsTable.id, body.data.holdId), eq(rentalReservationHoldsTable.sessionToken, req.sessionID)));

      if (!hold || hold.vehicleId !== vehicleId || hold.releasedAt != null) {
        const err = new Error("Invalid or expired hold") as Error & { status: number };
        err.status = 400;
        throw err;
      }

      if (hold.heldUntil < new Date()) {
        const err = new Error("Hold has expired. Please start over.") as Error & { status: number };
        err.status = 409;
        throw err;
      }

      const canonicalPickupAt = hold.pickupAt;
      const canonicalReturnAt = hold.returnAt;

      const [vehicle] = await tx
        .select()
        .from(rentalVehiclesTable)
        .where(and(eq(rentalVehiclesTable.id, vehicleId), isNull(rentalVehiclesTable.deletedAt)));

      if (!vehicle || !isVehicleServiceable(vehicle, body.data.pickupLocation, body.data.returnLocation)) {
        const err = new Error("Vehicle is not available at the selected pickup or return location") as Error & { status: number };
        err.status = 409;
        throw err;
      }

      const available = await isVehicleAvailable(vehicleId, canonicalPickupAt, canonicalReturnAt, hold.id, undefined, tx);
      if (!available) {
        const err = new Error("Vehicle is no longer available for the selected dates") as Error & { status: number };
        err.status = 409;
        throw err;
      }

      if (body.data.addons && body.data.addons.length > 0) {
        const addonIds = body.data.addons.map((a) => a.addonId);
        const addonRecords = await tx
          .select()
          .from(rentalAddonsTable)
          .where(inArray(rentalAddonsTable.id, addonIds));

        const addonMap = new Map(addonRecords.map((a) => [a.id, a]));

        for (const reqAddon of body.data.addons) {
          const addon = addonMap.get(reqAddon.addonId);
          if (!addon || !addon.published) {
            const err = new Error(`Add-on ${reqAddon.addonId} not found or unavailable`) as Error & { status: number };
            err.status = 400;
            throw err;
          }
          if (reqAddon.qty > addon.maxQty) {
            const err = new Error(`Quantity ${reqAddon.qty} exceeds max ${addon.maxQty} for add-on "${addon.name}"`) as Error & { status: number };
            err.status = 400;
            throw err;
          }

          if (addon.inventoryLimit != null) {
            const [usedRow] = await tx
              .select({
                usedQty: sql<number>`COALESCE(SUM(${rentalReservationAddonsTable.qty}), 0)::int`,
              })
              .from(rentalReservationAddonsTable)
              .innerJoin(
                rentalReservationsTable,
                eq(rentalReservationAddonsTable.reservationId, rentalReservationsTable.id),
              )
              .where(
                and(
                  eq(rentalReservationAddonsTable.addonId, reqAddon.addonId),
                  isNull(rentalReservationsTable.deletedAt),
                  sql`${rentalReservationsTable.status} NOT IN ('cancelled', 'refunded')`,
                  sql`${rentalReservationsTable.pickupAt} < ${canonicalReturnAt}`,
                  sql`${rentalReservationsTable.returnAt} > ${canonicalPickupAt}`,
                ),
              );

            const usedQty = usedRow?.usedQty ?? 0;
            if (usedQty + reqAddon.qty > addon.inventoryLimit) {
              const err = new Error(`Add-on "${addon.name}" inventory limit reached for this time period`) as Error & { status: number };
              err.status = 409;
              throw err;
            }
          }
        }
      }

      const [driver] = await tx
        .insert(rentalDriversTable)
        .values({
          fullName: body.data.driver.fullName,
          email: body.data.driver.email,
          phone: body.data.driver.phone,
          romanizedName: body.data.driver.romanizedName ?? null,
          dob: body.data.driver.dateOfBirth ?? null,
          nationality: body.data.driver.nationality ?? null,
          country: body.data.driver.residenceCountry ?? null,
          address: body.data.driver.address ?? null,
          emergencyContact: body.data.driver.emergencyContact ?? null,
          flightNumber: body.data.driver.flightNumber ?? null,
          accommodation: body.data.driver.accommodation ?? null,
        })
        .returning();

      if (body.data.additionalDrivers?.length) {
        await tx.insert(rentalDriversTable).values(
          body.data.additionalDrivers.map((additional) => ({
            fullName: additional.fullName,
            email: additional.email,
            phone: additional.phone,
          })),
        );
      }

      const [reservation] = await tx
        .insert(rentalReservationsTable)
        .values({
          vehicleId,
          primaryDriverId: driver.id,
          pickupAt: canonicalPickupAt,
          returnAt: canonicalReturnAt,
          pickupLocation: body.data.pickupLocation,
          returnLocation: body.data.returnLocation,
          status: "pending_payment",
          paymentStatus: "pending",
          subtotal: pricing.subtotal,
          addonsTotal: pricing.addonsTotal,
          deliveryFee: pricing.deliveryFee + pricing.airportPickupFee + pricing.airportDropoffFee,
          discount: pricing.discount,
          tax: pricing.tax,
          securityDeposit: pricing.securityDeposit,
          outstanding: pricing.finalTotal,
          finalTotal: pricing.finalTotal,
          source: body.data.source ?? "website",
          customerAccessToken: crypto.randomUUID(),
        })
        .returning();

      if (pricing.addons.length > 0) {
        await tx.insert(rentalReservationAddonsTable).values(
          pricing.addons.map((a) => ({
            reservationId: reservation.id,
            addonId: a.addonId,
            qty: a.qty,
            unitPrice: a.unitPrice,
            totalPrice: a.totalPrice,
          })),
        );
      }

      if (body.data.documents?.length) {
        await tx.insert(rentalDriverDocumentsTable).values(
          body.data.documents.map((document) => ({
            driverId: driver.id,
            reservationId: reservation.id,
            docType: document.docType,
            fileUrl: document.fileUrl,
            status: "submitted" as const,
          })),
        );
      }

      await tx
        .update(rentalReservationHoldsTable)
        .set({ releasedAt: new Date(), reservationId: reservation.id })
        .where(eq(rentalReservationHoldsTable.id, hold.id));

      return { reservation };
    });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "Internal server error" });
    return;
  }

  res.status(201).json({ ...serializeReservation(result.reservation), pricing });
  await queueRentalNotification({
    email: body.data.driver.email,
    eventType: "new_booking",
    bookingId: result.reservation.id,
    extra: { accessCode: result.reservation.customerAccessToken },
  });
});

router.get("/admin/rental/reservations", requireAdminAuth, async (req, res): Promise<void> => {
  const status = req.query.status as string | undefined;
  const vehicleId = req.query.vehicleId ? parseInt(req.query.vehicleId as string, 10) : undefined;

  let reservations = await db
    .select()
    .from(rentalReservationsTable)
    .where(isNull(rentalReservationsTable.deletedAt))
    .orderBy(desc(rentalReservationsTable.createdAt));

  if (status) {
    reservations = reservations.filter((r) => r.status === status);
  }
  if (vehicleId) {
    reservations = reservations.filter((r) => r.vehicleId === vehicleId);
  }

  const vehicleIds = [...new Set(reservations.map((reservation) => reservation.vehicleId))];
  const driverIds = reservations.map((reservation) => reservation.primaryDriverId).filter((id): id is number => id !== null);
  const vehicles = vehicleIds.length ? await db.select().from(rentalVehiclesTable).where(inArray(rentalVehiclesTable.id, vehicleIds)) : [];
  const drivers = driverIds.length ? await db.select().from(rentalDriversTable).where(inArray(rentalDriversTable.id, driverIds)) : [];
  const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const driverById = new Map(drivers.map((driver) => [driver.id, driver]));
  res.json(reservations.map((reservation) => ({
    ...serializeReservation(reservation),
    vehicle: vehicleById.get(reservation.vehicleId) ?? null,
    driver: reservation.primaryDriverId ? driverById.get(reservation.primaryDriverId) ?? null : null,
  })));
});

router.get("/admin/rental/reservations/:id", requireAdminAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid reservation ID" });
    return;
  }

  const [reservation] = await db
    .select()
    .from(rentalReservationsTable)
    .where(and(eq(rentalReservationsTable.id, id), isNull(rentalReservationsTable.deletedAt)));

  if (!reservation) {
    res.status(404).json({ error: "Reservation not found" });
    return;
  }

  const driver = reservation.primaryDriverId
    ? await db
        .select()
        .from(rentalDriversTable)
        .where(eq(rentalDriversTable.id, reservation.primaryDriverId))
        .then((rows) => rows[0] ?? null)
    : null;

  const addons = await db
    .select()
    .from(rentalReservationAddonsTable)
    .where(eq(rentalReservationAddonsTable.reservationId, id));
  const documents = reservation.primaryDriverId
    ? await db.select().from(rentalDriverDocumentsTable).where(eq(rentalDriverDocumentsTable.driverId, reservation.primaryDriverId))
    : [];
  const inspections = await db.select().from(rentalInspectionsTable).where(eq(rentalInspectionsTable.reservationId, id));
  const [vehicle] = await db.select().from(rentalVehiclesTable).where(eq(rentalVehiclesTable.id, reservation.vehicleId));
  const audits = await db.select().from(rentalAuditLogTable).where(and(eq(rentalAuditLogTable.recordType, "reservation"), eq(rentalAuditLogTable.recordId, id))).orderBy(desc(rentalAuditLogTable.createdAt));

  res.json({
    ...serializeReservation(reservation),
    driver,
    vehicle: vehicle ?? null,
    addons,
    documents: documents.map((document) => ({ ...document, reviewedAt: document.reviewedAt?.toISOString() ?? null, createdAt: document.createdAt.toISOString(), updatedAt: document.updatedAt.toISOString() })),
    inspections: inspections.map((inspection) => ({ ...inspection, completedAt: inspection.completedAt?.toISOString() ?? null, createdAt: inspection.createdAt.toISOString() })),
    audit: audits.map((audit) => ({ ...audit, createdAt: audit.createdAt.toISOString() })),
  });
});

const UpdateReservationSchema = z.object({
  status: z
    .enum([
      "inquiry",
      "quote_sent",
      "pending_payment",
      "payment_failed",
      "confirmed",
      "driver_documents_pending",
      "driver_documents_under_review",
      "driver_documents_rejected",
      "awaiting_pickup",
      "vehicle_dispatched",
      "in_rental",
      "overdue",
      "return_initiated",
      "return_completed",
      "inspection_pending",
      "damage_assessed",
      "deposit_refunded",
      "cancelled",
      "refunded",
    ])
    .optional(),
  paymentStatus: z
    .enum([
      "pending",
      "authorized",
      "partial_paid",
      "paid",
      "refund_pending",
      "partially_refunded",
      "refunded",
      "chargeback",
      "disputed",
      "void",
    ])
    .optional(),
  internalNotes: z.string().nullable().optional(),
  paidAmount: z.coerce.number().optional(),
  refundAmount: z.coerce.number().optional(),
});

router.put("/admin/rental/reservations/:id", requireAdminAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid reservation ID" });
    return;
  }

  const body = UpdateReservationSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const updateData: Partial<typeof rentalReservationsTable.$inferInsert> = {
    ...body.data,
    updatedAt: new Date(),
  };

  if (body.data.paidAmount !== undefined) {
    const [current] = await db
      .select()
      .from(rentalReservationsTable)
      .where(eq(rentalReservationsTable.id, id));
    if (current) {
      updateData.outstanding = Math.max(0, current.finalTotal - (body.data.paidAmount ?? 0));
    }
  }

  const [previous] = await db.select().from(rentalReservationsTable).where(eq(rentalReservationsTable.id, id));
  const [reservation] = await db
    .update(rentalReservationsTable)
    .set(updateData)
    .where(and(eq(rentalReservationsTable.id, id), isNull(rentalReservationsTable.deletedAt)))
    .returning();

  if (!reservation) {
    res.status(404).json({ error: "Reservation not found" });
    return;
  }

  await logRentalAudit({
    adminUser: ((req.session as { admin?: { username?: string } }).admin?.username) ?? "admin",
    action: "reservation_updated",
    recordType: "reservation",
    recordId: id,
    previousValue: previous ? { status: previous.status, paymentStatus: previous.paymentStatus, paidAmount: previous.paidAmount } : null,
    newValue: { status: reservation.status, paymentStatus: reservation.paymentStatus, paidAmount: reservation.paidAmount },
  });
  res.json(serializeReservation(reservation));
});

function createStatusAction(newStatus: typeof rentalReservationsTable.$inferInsert["status"]) {
  return async (req: Parameters<Parameters<typeof router.post>[1]>[0], res: Parameters<Parameters<typeof router.post>[1]>[1]): Promise<void> => {
    if (!newStatus) {
      res.status(500).json({ error: "Missing target reservation status" });
      return;
    }
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(rawId, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid reservation ID" });
      return;
    }

    const [previous] = await db.select().from(rentalReservationsTable).where(and(eq(rentalReservationsTable.id, id), isNull(rentalReservationsTable.deletedAt)));
    if (!previous) {
      res.status(404).json({ error: "Reservation not found" });
      return;
    }
    const allowedFrom: Record<string, string[]> = {
      confirmed: ["inquiry", "quote_sent", "pending_payment", "driver_documents_pending", "driver_documents_under_review"],
      cancelled: ["inquiry", "quote_sent", "pending_payment", "confirmed", "awaiting_pickup", "driver_documents_pending", "driver_documents_under_review"],
      vehicle_dispatched: ["confirmed", "awaiting_pickup"],
      in_rental: ["vehicle_dispatched", "awaiting_pickup"],
      return_initiated: ["in_rental", "overdue"],
      return_completed: ["return_initiated", "in_rental", "overdue"],
    };
    if (allowedFrom[newStatus] && !allowedFrom[newStatus].includes(previous.status)) {
      res.status(409).json({ error: `Cannot transition from ${previous.status} to ${newStatus}` });
      return;
    }
    const [reservation] = await db
      .update(rentalReservationsTable)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(and(eq(rentalReservationsTable.id, id), isNull(rentalReservationsTable.deletedAt)))
      .returning();

    if (!reservation) {
      res.status(404).json({ error: "Reservation not found" });
      return;
    }

    await logRentalAudit({
      adminUser: ((req.session as { admin?: { username?: string } }).admin?.username) ?? "admin",
      action: `reservation_${newStatus}`,
      recordType: "reservation",
      recordId: id,
      previousValue: previous ? { status: previous.status } : null,
      newValue: { status: newStatus },
    });
    if (newStatus === "confirmed" && reservation.primaryDriverId) {
      const [driver] = await db.select().from(rentalDriversTable).where(eq(rentalDriversTable.id, reservation.primaryDriverId));
      await queueRentalNotification({ email: driver?.email, eventType: "booking_confirmed", bookingId: id });
    }
    res.json(serializeReservation(reservation));
  };
}

router.post("/admin/rental/reservations/:id/confirm", requireAdminAuth, createStatusAction("confirmed"));
router.post("/admin/rental/reservations/:id/cancel", requireAdminAuth, createStatusAction("cancelled"));
router.post("/admin/rental/reservations/:id/start-pickup", requireAdminAuth, createStatusAction("vehicle_dispatched"));
router.post("/admin/rental/reservations/:id/complete-pickup", requireAdminAuth, createStatusAction("in_rental"));
router.post("/admin/rental/reservations/:id/start-return", requireAdminAuth, createStatusAction("return_initiated"));
router.post("/admin/rental/reservations/:id/complete-return", requireAdminAuth, createStatusAction("return_completed"));

const ManualReservationSchema = z.object({
  vehicleId: z.coerce.number().int(),
  pickupAt: z.string(),
  returnAt: z.string(),
  pickupLocation: z.string().min(1),
  returnLocation: z.string().min(1),
  driver: z.object({ fullName: z.string().min(1), email: z.string().email(), phone: z.string().min(1) }),
  addons: z.array(z.object({ addonId: z.coerce.number().int(), qty: z.coerce.number().int().min(1).default(1) })).optional(),
  status: z.enum(["inquiry", "quote_sent", "pending_payment", "confirmed", "awaiting_pickup"]).default("confirmed"),
  paymentStatus: z.enum(["pending", "authorized", "partial_paid", "paid"]).default("pending"),
  customPrice: z.coerce.number().min(0).optional(),
  discount: z.coerce.number().min(0).default(0),
  paymentMethod: z.string().optional(),
  source: z.string().default("manual"),
  internalNotes: z.string().optional(),
});

router.post("/admin/rental/reservations", requireAdminAuth, async (req, res): Promise<void> => {
  const parsed = ManualReservationSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: parsed.error.message });
  const data = parsed.data;
  const pickupAt = new Date(data.pickupAt);
  const returnAt = new Date(data.returnAt);
  if (Number.isNaN(pickupAt.getTime()) || Number.isNaN(returnAt.getTime()) || returnAt <= pickupAt) {
    return void res.status(400).json({ error: "A valid pickup and return time is required" });
  }
  const [vehicle] = await db.select().from(rentalVehiclesTable).where(and(eq(rentalVehiclesTable.id, data.vehicleId), isNull(rentalVehiclesTable.deletedAt)));
  if (!vehicle || !isVehicleServiceable(vehicle, data.pickupLocation, data.returnLocation)) return void res.status(409).json({ error: "Vehicle cannot serve these locations" });
  if (!await isVehicleAvailable(data.vehicleId, pickupAt, returnAt)) return void res.status(409).json({ error: "Vehicle is unavailable for those dates" });
  const pricing = await calculatePrice({ vehicleId: data.vehicleId, pickupAt, returnAt, addons: data.addons, pickupLocation: data.pickupLocation, returnLocation: data.returnLocation });
  const [driver] = await db.insert(rentalDriversTable).values(data.driver).returning();
  const finalTotal = data.customPrice ?? Math.max(0, pricing.finalTotal - data.discount);
  const [reservation] = await db.insert(rentalReservationsTable).values({
    vehicleId: data.vehicleId, primaryDriverId: driver.id, pickupAt, returnAt, pickupLocation: data.pickupLocation, returnLocation: data.returnLocation,
    status: data.status, paymentStatus: data.paymentStatus, subtotal: pricing.subtotal, addonsTotal: pricing.addonsTotal,
    deliveryFee: pricing.deliveryFee, discount: data.discount, tax: pricing.tax, securityDeposit: pricing.securityDeposit,
    finalTotal, outstanding: finalTotal, source: data.source, customerAccessToken: crypto.randomUUID(), internalNotes: [data.internalNotes, data.paymentMethod ? `Payment method: ${data.paymentMethod}` : ""].filter(Boolean).join("\n") || null,
  }).returning();
  if (pricing.addons.length) await db.insert(rentalReservationAddonsTable).values(pricing.addons.map((addon) => ({ reservationId: reservation.id, addonId: addon.addonId, qty: addon.qty, unitPrice: addon.unitPrice, totalPrice: addon.totalPrice })));
  await logRentalAudit({ adminUser: ((req.session as { admin?: { username?: string } }).admin?.username) ?? "admin", action: "manual_reservation_created", recordType: "reservation", recordId: reservation.id, newValue: { source: data.source, customPrice: data.customPrice ?? null } });
  await queueRentalNotification({ email: driver.email, eventType: "new_booking", bookingId: reservation.id, extra: { accessCode: reservation.customerAccessToken } });
  res.status(201).json(serializeReservation(reservation));
});

function parseReservationId(value: string | string[] | undefined) {
  const id = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(id) ? id : null;
}

router.post("/admin/rental/reservations/:id/change-vehicle", requireAdminAuth, async (req, res): Promise<void> => {
  const id = parseReservationId(req.params.id);
  const vehicleId = Number(req.body?.vehicleId);
  if (!id || !Number.isInteger(vehicleId)) return void res.status(400).json({ error: "Reservation and vehicle are required" });
  const [reservation] = await db.select().from(rentalReservationsTable).where(and(eq(rentalReservationsTable.id, id), isNull(rentalReservationsTable.deletedAt)));
  if (!reservation) return void res.status(404).json({ error: "Reservation not found" });
  const available = await isVehicleAvailable(vehicleId, reservation.pickupAt, reservation.returnAt, undefined, id);
  if (!available) return void res.status(409).json({ error: "The selected vehicle is unavailable" });
  const [updated] = await db.update(rentalReservationsTable).set({ vehicleId, updatedAt: new Date() }).where(eq(rentalReservationsTable.id, id)).returning();
  await logRentalAudit({ adminUser: ((req.session as { admin?: { username?: string } }).admin?.username) ?? "admin", action: "vehicle_changed", recordType: "reservation", recordId: id, previousValue: { vehicleId: reservation.vehicleId }, newValue: { vehicleId } });
  res.json(serializeReservation(updated));
});

router.post("/admin/rental/reservations/:id/extend", requireAdminAuth, async (req, res): Promise<void> => {
  const id = parseReservationId(req.params.id);
  const returnAt = new Date(req.body?.returnAt);
  if (!id || Number.isNaN(returnAt.getTime())) return void res.status(400).json({ error: "A new return time is required" });
  const [reservation] = await db.select().from(rentalReservationsTable).where(and(eq(rentalReservationsTable.id, id), isNull(rentalReservationsTable.deletedAt)));
  if (!reservation || returnAt <= reservation.returnAt) return void res.status(400).json({ error: "New return time must be later than the current return time" });
  if (!await isVehicleAvailable(reservation.vehicleId, reservation.pickupAt, returnAt, undefined, id)) return void res.status(409).json({ error: "Vehicle is unavailable for the extension" });
  const pricing = await calculatePrice({ vehicleId: reservation.vehicleId, pickupAt: reservation.pickupAt, returnAt, pickupLocation: reservation.pickupLocation, returnLocation: reservation.returnLocation });
  const difference = Math.max(0, pricing.finalTotal - reservation.finalTotal);
  const [updated] = await db.update(rentalReservationsTable).set({ returnAt, finalTotal: pricing.finalTotal, outstanding: reservation.outstanding + difference, updatedAt: new Date() }).where(eq(rentalReservationsTable.id, id)).returning();
  await logRentalAudit({ adminUser: ((req.session as { admin?: { username?: string } }).admin?.username) ?? "admin", action: "rental_extended", recordType: "reservation", recordId: id, previousValue: { returnAt: reservation.returnAt.toISOString() }, newValue: { returnAt: returnAt.toISOString(), priceDifference: difference } });
  res.json({ reservation: serializeReservation(updated), additionalPayment: difference });
});

const InspectionSchema = z.object({
  mileage: z.coerce.number().int().nonnegative(),
  fuelLevel: z.enum(["Full", "3/4", "1/2", "1/4", "Empty"]),
  identityConfirmed: z.boolean().optional(),
  licenseConfirmed: z.boolean().optional(),
  idpConfirmed: z.boolean().optional(),
  paymentConfirmed: z.boolean().optional(),
  depositConfirmed: z.boolean().optional(),
  exteriorPhotos: z.array(z.string()).default([]),
  interiorPhotos: z.array(z.string()).default([]),
  damageNotes: z.array(z.object({ location: z.string().optional(), description: z.string().min(1), estimatedCost: z.coerce.number().optional() })).default([]),
  notes: z.string().optional(),
  additionalCharges: z.object({ extraMileage: z.coerce.number().default(0), lateReturn: z.coerce.number().default(0), fuel: z.coerce.number().default(0), cleaning: z.coerce.number().default(0), damage: z.coerce.number().default(0) }).optional(),
  depositAction: z.enum(["release", "capture"]).optional(),
  returnAt: z.string().optional(),
});

async function saveInspection(id: number, type: "pickup" | "return", data: z.infer<typeof InspectionSchema>, admin: string) {
  const [reservation] = await db.select().from(rentalReservationsTable).where(and(eq(rentalReservationsTable.id, id), isNull(rentalReservationsTable.deletedAt)));
  if (!reservation) return null;
  const permittedStatuses = type === "pickup" ? ["confirmed", "awaiting_pickup", "vehicle_dispatched"] : ["in_rental", "overdue", "return_initiated"];
  if (!permittedStatuses.includes(reservation.status)) return null;
  const existing = await db.select().from(rentalInspectionsTable).where(and(eq(rentalInspectionsTable.reservationId, id), eq(rentalInspectionsTable.type, type)));
  if (existing.length) return null;
  const [inspection] = await db.insert(rentalInspectionsTable).values({ reservationId: id, type, mileage: data.mileage, fuelLevel: data.fuelLevel, notes: data.notes ?? null, completedAt: new Date(), completedBy: admin }).returning();
  const photos = [...data.exteriorPhotos.map((url) => ({ inspectionId: inspection.id, url, type: "exterior" as const })), ...data.interiorPhotos.map((url) => ({ inspectionId: inspection.id, url, type: "interior" as const }))];
  if (photos.length) await db.insert(rentalInspectionPhotosTable).values(photos);
  if (data.damageNotes.length) await db.insert(rentalDamagesTable).values(data.damageNotes.map((damage) => ({ inspectionId: inspection.id, description: damage.description, location: damage.location ?? null, estimatedCost: damage.estimatedCost ?? null })));
  if (type === "pickup") {
    await db.update(rentalReservationsTable).set({ status: "in_rental", updatedAt: new Date() }).where(eq(rentalReservationsTable.id, id));
    await db.update(rentalVehiclesTable).set({ operationalStatus: "in_use", updatedAt: new Date() }).where(eq(rentalVehiclesTable.id, reservation.vehicleId));
  } else {
    const additional = data.additionalCharges ? Object.values(data.additionalCharges).reduce((sum, value) => sum + value, 0) : 0;
    await db.update(rentalReservationsTable).set({ status: "return_completed", finalTotal: reservation.finalTotal + additional, outstanding: Math.max(0, reservation.outstanding + additional), updatedAt: new Date() }).where(eq(rentalReservationsTable.id, id));
    await db.update(rentalVehiclesTable).set({ operationalStatus: "cleaning", updatedAt: new Date() }).where(eq(rentalVehiclesTable.id, reservation.vehicleId));
    const [cleaningSetting] = await db.select().from(rentalSettingsTable).where(eq(rentalSettingsTable.key, "cleaningBufferMinutes"));
    const returnTime = data.returnAt ? new Date(data.returnAt) : new Date();
    const cleaningMinutes = Math.max(0, cleaningSetting ? Number(JSON.parse(cleaningSetting.value)) : 120);
    if (cleaningMinutes > 0) {
      await db.insert(rentalAvailabilityBlocksTable).values({
        vehicleId: reservation.vehicleId,
        startAt: returnTime,
        endAt: new Date(returnTime.getTime() + cleaningMinutes * 60_000),
        reason: "cleaning",
        notes: `Return turnaround for reservation #${id}`,
        createdBy: admin,
      });
    }
    if (data.depositAction === "release") await db.update(rentalReservationsTable).set({ status: "deposit_refunded", updatedAt: new Date() }).where(eq(rentalReservationsTable.id, id));
  }
  return inspection;
}

router.post("/admin/rental/reservations/:id/pickup", requireAdminAuth, async (req, res): Promise<void> => {
  const id = parseReservationId(req.params.id); const parsed = InspectionSchema.safeParse(req.body);
  if (!id || !parsed.success) return void res.status(400).json({ error: parsed.success ? "Invalid reservation ID" : parsed.error.message });
  if (!parsed.data.identityConfirmed || !parsed.data.licenseConfirmed || !parsed.data.paymentConfirmed || !parsed.data.depositConfirmed) return void res.status(400).json({ error: "Identity, license, payment, and deposit must be confirmed" });
  const inspection = await saveInspection(id, "pickup", parsed.data, ((req.session as { admin?: { username?: string } }).admin?.username) ?? "admin");
  if (!inspection) return void res.status(404).json({ error: "Reservation not found" });
  await logRentalAudit({ adminUser: ((req.session as { admin?: { username?: string } }).admin?.username) ?? "admin", action: "pickup_completed", recordType: "reservation", recordId: id, newValue: { mileage: parsed.data.mileage, fuelLevel: parsed.data.fuelLevel } });
  res.json({ inspection });
});

router.post("/admin/rental/reservations/:id/return", requireAdminAuth, async (req, res): Promise<void> => {
  const id = parseReservationId(req.params.id); const parsed = InspectionSchema.safeParse(req.body);
  if (!id || !parsed.success) return void res.status(400).json({ error: parsed.success ? "Invalid reservation ID" : parsed.error.message });
  const inspection = await saveInspection(id, "return", parsed.data, ((req.session as { admin?: { username?: string } }).admin?.username) ?? "admin");
  if (!inspection) return void res.status(404).json({ error: "Reservation not found" });
  await logRentalAudit({ adminUser: ((req.session as { admin?: { username?: string } }).admin?.username) ?? "admin", action: "return_completed", recordType: "reservation", recordId: id, newValue: { mileage: parsed.data.mileage, charges: parsed.data.additionalCharges ?? {} } });
  res.json({ inspection });
});

const DocumentUpdateSchema = z.object({ status: z.enum(["approved", "rejected", "resubmit_required", "under_review"]), adminNotes: z.string().nullable().optional(), expiryDate: z.string().nullable().optional() });
router.put("/admin/rental/documents/:id", requireAdminAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id); const parsed = DocumentUpdateSchema.safeParse(req.body);
  if (!Number.isInteger(id) || !parsed.success) return void res.status(400).json({ error: parsed.success ? "Invalid document ID" : parsed.error.message });
  const [previous] = await db.select().from(rentalDriverDocumentsTable).where(eq(rentalDriverDocumentsTable.id, id));
  const [document] = await db.update(rentalDriverDocumentsTable).set({ ...parsed.data, reviewedAt: new Date(), updatedAt: new Date() }).where(eq(rentalDriverDocumentsTable.id, id)).returning();
  if (!document) return void res.status(404).json({ error: "Document not found" });
  await logRentalAudit({ adminUser: ((req.session as { admin?: { username?: string } }).admin?.username) ?? "admin", action: `document_${document.status}`, recordType: "document", recordId: id, previousValue: previous ? { status: previous.status } : null, newValue: { status: document.status } });
  if (document.reservationId) {
    const [reservation] = await db.select().from(rentalReservationsTable).where(eq(rentalReservationsTable.id, document.reservationId));
    const [driver] = await db.select().from(rentalDriversTable).where(eq(rentalDriversTable.id, document.driverId));
    if (reservation) await queueRentalNotification({ email: driver?.email, eventType: document.status === "approved" ? "document_approved" : "document_rejected", bookingId: reservation.id });
  }
  res.json({ ...document, reviewedAt: document.reviewedAt?.toISOString() ?? null, createdAt: document.createdAt.toISOString(), updatedAt: document.updatedAt.toISOString() });
});

router.get("/rental/my-bookings", async (req, res): Promise<void> => {
  const email = typeof req.query.email === "string" ? req.query.email.trim().toLowerCase() : "";
  const bookingId = req.query.bookingId ? Number(req.query.bookingId) : undefined;
  const accessCode = typeof req.query.accessCode === "string" ? req.query.accessCode : "";
  if (!email || !bookingId || !accessCode) return void res.status(400).json({ error: "Email, booking ID, and access code are required" });
  const [reservation] = await db.select().from(rentalReservationsTable).where(and(eq(rentalReservationsTable.id, bookingId), eq(rentalReservationsTable.customerAccessToken, accessCode), isNull(rentalReservationsTable.deletedAt)));
  if (!reservation) return void res.status(404).json({ error: "Booking not found" });
  const session = req.session as unknown as Record<string, unknown>;
  session.rentalCustomerEmail = email;
  session.rentalCustomerBookingId = bookingId;
  const drivers = await db.select().from(rentalDriversTable).where(eq(rentalDriversTable.email, email));
  const ids = drivers.map((driver) => driver.id);
  const reservations = ids.length ? await db.select().from(rentalReservationsTable).where(isNull(rentalReservationsTable.deletedAt)) : [];
  const filtered = reservations.filter((item) => ids.includes(item.primaryDriverId ?? -1) && item.id === reservation.id);
  res.json(filtered.map(serializeCustomerReservation));
});

router.get("/rental/my-bookings/:id", async (req, res): Promise<void> => {
  const id = parseReservationId(req.params.id);
  const session = req.session as unknown as Record<string, unknown>;
  const email = typeof session.rentalCustomerEmail === "string" ? session.rentalCustomerEmail : "";
  const authorizedBookingId = session.rentalCustomerBookingId;
  if (!id || !email || (authorizedBookingId && authorizedBookingId !== id)) return void res.status(401).json({ error: "Please look up this booking first" });
  const [reservation] = await db.select().from(rentalReservationsTable).where(and(eq(rentalReservationsTable.id, id), isNull(rentalReservationsTable.deletedAt)));
  if (!reservation || !reservation.primaryDriverId) return void res.status(404).json({ error: "Booking not found" });
  const [driver] = await db.select().from(rentalDriversTable).where(and(eq(rentalDriversTable.id, reservation.primaryDriverId), eq(rentalDriversTable.email, email)));
  if (!driver) return void res.status(404).json({ error: "Booking not found" });
  const [vehicle] = await db.select().from(rentalVehiclesTable).where(eq(rentalVehiclesTable.id, reservation.vehicleId));
  const documents = await db.select().from(rentalDriverDocumentsTable).where(eq(rentalDriverDocumentsTable.reservationId, id));
  res.json({ ...serializeCustomerReservation(reservation), driver, vehicle: vehicle ?? null, documents: documents.map((document) => ({ ...document, createdAt: document.createdAt.toISOString(), updatedAt: document.updatedAt.toISOString(), reviewedAt: document.reviewedAt?.toISOString() ?? null })) });
});

router.post("/rental/my-bookings/:id/documents", async (req, res): Promise<void> => {
  const id = parseReservationId(req.params.id);
  const session = req.session as unknown as Record<string, unknown>;
  const email = typeof session.rentalCustomerEmail === "string" ? session.rentalCustomerEmail : "";
  const parsed = z.object({ docType: z.enum(["drivers_license", "passport", "international_license", "insurance", "credit_card", "other"]), fileUrl: z.string().url() }).safeParse(req.body);
  if (!id || !email || ((session.rentalCustomerBookingId as number | undefined) && session.rentalCustomerBookingId !== id) || !parsed.success) return void res.status(401).json({ error: parsed.success ? "Please look up this booking first" : parsed.error.message });
  const [reservation] = await db.select().from(rentalReservationsTable).where(eq(rentalReservationsTable.id, id));
  if (!reservation?.primaryDriverId) return void res.status(404).json({ error: "Booking not found" });
  const [driver] = await db.select().from(rentalDriversTable).where(and(eq(rentalDriversTable.id, reservation.primaryDriverId), eq(rentalDriversTable.email, email)));
  if (!driver) return void res.status(404).json({ error: "Booking not found" });
  const [document] = await db.insert(rentalDriverDocumentsTable).values({ driverId: driver.id, reservationId: id, docType: parsed.data.docType, fileUrl: parsed.data.fileUrl, status: "submitted" }).returning();
  res.status(201).json({ ...document, createdAt: document.createdAt.toISOString(), updatedAt: document.updatedAt.toISOString() });
});

router.post("/rental/reservations/:id/cancel-request", async (req, res): Promise<void> => {
  const id = parseReservationId(req.params.id);
  const session = req.session as unknown as Record<string, unknown>;
  const email = typeof session.rentalCustomerEmail === "string" ? session.rentalCustomerEmail : "";
  if (!id || !email || ((session.rentalCustomerBookingId as number | undefined) && session.rentalCustomerBookingId !== id)) return void res.status(401).json({ error: "Please look up this booking first" });
  const [reservation] = await db.select().from(rentalReservationsTable).where(eq(rentalReservationsTable.id, id));
  if (!reservation?.primaryDriverId) return void res.status(404).json({ error: "Booking not found" });
  const [driver] = await db.select().from(rentalDriversTable).where(and(eq(rentalDriversTable.id, reservation.primaryDriverId), eq(rentalDriversTable.email, email)));
  if (!driver) return void res.status(404).json({ error: "Booking not found" });
  const cancellableStatuses = ["inquiry", "quote_sent", "pending_payment", "driver_documents_pending", "driver_documents_under_review", "confirmed", "awaiting_pickup"];
  if (!cancellableStatuses.includes(reservation.status)) return void res.status(409).json({ error: "This reservation can no longer be cancelled online" });
  const [updated] = await db.update(rentalReservationsTable).set({ status: "cancelled", internalNotes: `${reservation.internalNotes ?? ""}\nCancellation requested by customer.`.trim(), updatedAt: new Date() }).where(eq(rentalReservationsTable.id, id)).returning();
  await logRentalAudit({ action: "customer_cancellation_requested", recordType: "reservation", recordId: id, previousValue: { status: reservation.status }, newValue: { status: updated.status } });
  await queueRentalNotification({ email, eventType: "cancellation_confirmed", bookingId: id });
  res.json(serializeCustomerReservation(updated));
});

router.post("/rental/pricing/calculate", async (req, res): Promise<void> => {
  const body = z
    .object({
      vehicleId: z.coerce.number().int(),
      pickupAt: z.string(),
      returnAt: z.string(),
      pickupLocation: z.string().optional(),
      returnLocation: z.string().optional(),
      addons: z
        .array(
          z.object({
            addonId: z.coerce.number().int(),
            qty: z.coerce.number().int().min(1).default(1),
          }),
        )
        .optional(),
    })
    .safeParse(req.body);

  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const pickupAt = new Date(body.data.pickupAt);
  const returnAt = new Date(body.data.returnAt);

  if (isNaN(pickupAt.getTime()) || isNaN(returnAt.getTime())) {
    res.status(400).json({ error: "Invalid date format" });
    return;
  }
  if (returnAt <= pickupAt) {
    res.status(400).json({ error: "Return date must be after pickup date" });
    return;
  }

  const [vehicle] = await db
    .select()
    .from(rentalVehiclesTable)
    .where(and(eq(rentalVehiclesTable.id, body.data.vehicleId), isNull(rentalVehiclesTable.deletedAt)));

  if (!vehicle || !isVehicleServiceable(vehicle, body.data.pickupLocation, body.data.returnLocation)) {
    res.status(409).json({ error: "Vehicle is not available at the selected pickup or return location" });
    return;
  }

  const pricing = await calculatePrice({
    vehicleId: body.data.vehicleId,
    pickupAt,
    returnAt,
    addons: body.data.addons,
    pickupLocation: body.data.pickupLocation,
    returnLocation: body.data.returnLocation,
  });

  res.json(pricing);
});

export default router;
