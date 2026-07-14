import { Router, type IRouter } from "express";
import { eq, and, isNull, desc, sql, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  rentalReservationsTable,
  rentalReservationHoldsTable,
  rentalVehiclesTable,
  rentalDriversTable,
  rentalReservationAddonsTable,
  rentalAddonsTable,
  rentalSettingsTable,
} from "@workspace/db";
import { requireAdminAuth } from "../middlewares/admin-auth";
import { calculatePrice } from "../lib/rental-pricing";
import { isVehicleAvailable } from "./rental-vehicles";
import { z } from "zod/v4";

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

function serializeHold(hold: typeof rentalReservationHoldsTable.$inferSelect) {
  return {
    ...hold,
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
          sessionToken: body.data.sessionToken ?? null,
        })
        .returning();

      return newHold;
    });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "Internal server error" });
    return;
  }

  res.status(201).json({ ...serializeHold(hold), holdId: hold.id });
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
    nationality: z.string().optional(),
    flightNumber: z.string().optional(),
    accommodation: z.string().optional(),
  }),
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
    .where(eq(rentalReservationHoldsTable.id, body.data.holdId));

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
        .where(eq(rentalReservationHoldsTable.id, body.data.holdId));

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
          nationality: body.data.driver.nationality ?? null,
          flightNumber: body.data.driver.flightNumber ?? null,
          accommodation: body.data.driver.accommodation ?? null,
        })
        .returning();

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

  res.json(reservations.map(serializeReservation));
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

  res.json({
    ...serializeReservation(reservation),
    driver,
    addons,
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

  const [reservation] = await db
    .update(rentalReservationsTable)
    .set(updateData)
    .where(and(eq(rentalReservationsTable.id, id), isNull(rentalReservationsTable.deletedAt)))
    .returning();

  if (!reservation) {
    res.status(404).json({ error: "Reservation not found" });
    return;
  }

  res.json(serializeReservation(reservation));
});

function createStatusAction(newStatus: typeof rentalReservationsTable.$inferInsert["status"]) {
  return async (req: Parameters<Parameters<typeof router.post>[1]>[0], res: Parameters<Parameters<typeof router.post>[1]>[1]): Promise<void> => {
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(rawId, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid reservation ID" });
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

    res.json(serializeReservation(reservation));
  };
}

router.post("/admin/rental/reservations/:id/confirm", requireAdminAuth, createStatusAction("confirmed"));
router.post("/admin/rental/reservations/:id/cancel", requireAdminAuth, createStatusAction("cancelled"));
router.post("/admin/rental/reservations/:id/start-pickup", requireAdminAuth, createStatusAction("vehicle_dispatched"));
router.post("/admin/rental/reservations/:id/complete-pickup", requireAdminAuth, createStatusAction("in_rental"));
router.post("/admin/rental/reservations/:id/start-return", requireAdminAuth, createStatusAction("return_initiated"));
router.post("/admin/rental/reservations/:id/complete-return", requireAdminAuth, createStatusAction("return_completed"));

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
