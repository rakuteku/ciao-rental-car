import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { Router, type IRouter } from "express";
import { and, desc, eq, exists, isNull } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  rentalOperatorStaffTable,
  rentalOperatorsTable,
  rentalReservationsTable,
  rentalVehiclesTable,
} from "@workspace/db";
import {
  getOperatorIdentity,
  isRentalMarketplaceEnabled,
  requireOperatorAuth,
  type OperatorStaffRole,
} from "../middlewares/operator-auth";

const router: IRouter = Router();
router.get("/rental/marketplace/config", (_req, res): void => {
  res.set("Cache-Control", "no-store");
  res.json({ enabled: isRentalMarketplaceEnabled() });
});
const scrypt = promisify(scryptCallback);
const failedLogins = new Map<string, number[]>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 10;

const LoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(1024),
  operatorSlug: z.string().min(1).max(120).optional(),
}).strict();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (failedLogins.get(ip) ?? []).filter((timestamp) => now - timestamp < LOGIN_WINDOW_MS);
  if (recent.length >= MAX_LOGIN_ATTEMPTS) {
    failedLogins.set(ip, recent);
    return true;
  }
  recent.push(now);
  failedLogins.set(ip, recent);
  return false;
}

function clearFailedLogins(ip: string): void {
  failedLogins.delete(ip);
}

async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, salt, digest] = encoded.split("$");
  if (algorithm !== "scrypt" || !salt || !digest || !/^[a-f0-9]{128}$/i.test(digest)) return false;
  const expected = Buffer.from(digest, "hex");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function hashOperatorPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const digest = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${digest.toString("hex")}`;
}

function approvedOperator(operator: unknown): boolean {
  if (!operator || typeof operator !== "object") return false;
  const values = operator as Record<string, unknown>;
  return values.verificationStatus === "approved" && values.status === "active";
}

router.post("/operator/login", async (req, res): Promise<void> => {
  if (!isRentalMarketplaceEnabled()) {
    res.status(404).json({ error: "Rental marketplace is disabled" });
    return;
  }

  const ip = req.ip || "unknown";
  if (isRateLimited(ip)) {
    res.status(429).json({ error: "Too many login attempts. Try again later." });
    return;
  }
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const matches = await db
    .select({ staff: rentalOperatorStaffTable, operator: rentalOperatorsTable })
    .from(rentalOperatorStaffTable)
    .innerJoin(rentalOperatorsTable, eq(rentalOperatorStaffTable.operatorId, rentalOperatorsTable.id))
    .where(and(
      eq(rentalOperatorStaffTable.email, email),
      eq(rentalOperatorStaffTable.active, true),
      ...(parsed.data.operatorSlug ? [eq(rentalOperatorsTable.slug, parsed.data.operatorSlug.trim().toLowerCase())] : []),
    ));
  // Never choose an arbitrary tenant for a shared email address. The operator
  // slug is required to disambiguate, and is checked before the session exists.
  if (matches.length > 1) {
    res.status(400).json({ error: "Specify the operator slug for this account" });
    return;
  }
  const { staff, operator } = matches[0] ?? {};
  if (!staff || !(await verifyPassword(parsed.data.password, staff.passwordHash))) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  if (!approvedOperator(operator)) {
    res.status(403).json({ error: "Operator is not approved" });
    return;
  }

  const role = staff.role as OperatorStaffRole;
  if (!["owner", "manager", "counter", "operations"].includes(role)) {
    res.status(403).json({ error: "Operator staff role is not permitted" });
    return;
  }

  clearFailedLogins(ip);
  req.session.regenerate((error) => {
    if (error) {
      res.status(500).json({ error: "Could not establish operator session" });
      return;
    }
    const session = req.session as unknown as Record<string, unknown>;
    session.operator = { operatorId: staff.operatorId, staffId: staff.id, email: staff.email, role };
    res.json({ authenticated: true, operatorId: staff.operatorId, staffId: staff.id, email: staff.email, role });
  });
});

router.post("/operator/logout", async (req, res): Promise<void> => {
  if (!isRentalMarketplaceEnabled()) {
    res.status(404).json({ error: "Rental marketplace is disabled" });
    return;
  }
  const session = req.session as unknown as Record<string, unknown>;
  delete session.operator;
  req.session.save((error) => {
    if (error) {
      res.status(500).json({ error: "Could not end operator session" });
      return;
    }
    res.json({ message: "Logged out" });
  });
});

router.get("/operator/me", requireOperatorAuth, async (req, res): Promise<void> => {
  const identity = getOperatorIdentity(req)!;
  res.json({ authenticated: true, ...identity });
});

router.get("/operator/rental/vehicles", requireOperatorAuth, async (req, res): Promise<void> => {
  const identity = getOperatorIdentity(req)!;
  const vehicles = await db
    .select()
    .from(rentalVehiclesTable)
    .where(and(eq(rentalVehiclesTable.operatorId, identity.operatorId), isNull(rentalVehiclesTable.deletedAt)));
  res.json(vehicles);
});

router.get("/operator/rental/vehicles/:id", requireOperatorAuth, async (req, res): Promise<void> => {
  const identity = getOperatorIdentity(req)!;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: "Invalid vehicle ID" });
    return;
  }
  const [vehicle] = await db.select().from(rentalVehiclesTable).where(and(
    eq(rentalVehiclesTable.id, id),
    eq(rentalVehiclesTable.operatorId, identity.operatorId),
    isNull(rentalVehiclesTable.deletedAt),
  ));
  if (!vehicle) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }
  res.json(vehicle);
});

const VehicleUpdateSchema = z.object({
  operationalStatus: z.enum(["available", "cleaning", "maintenance"]).optional(),
  internalNotes: z.string().max(10_000).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one editable field is required");

router.patch("/operator/rental/vehicles/:id", requireOperatorAuth, async (req, res): Promise<void> => {
  const identity = getOperatorIdentity(req)!;
  if (!["owner", "manager", "operations"].includes(identity.role)) {
    res.status(403).json({ error: "This staff role cannot update vehicles" });
    return;
  }
  const id = Number(req.params.id);
  const parsed = VehicleUpdateSchema.safeParse(req.body);
  if (!Number.isInteger(id) || id < 1 || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "Invalid vehicle ID" : parsed.error.message });
    return;
  }
  const [vehicle] = await db.update(rentalVehiclesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(
      eq(rentalVehiclesTable.id, id),
      eq(rentalVehiclesTable.operatorId, identity.operatorId),
      isNull(rentalVehiclesTable.deletedAt),
    ))
    .returning();
  if (!vehicle) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }
  res.json(vehicle);
});

router.get("/operator/rental/reservations", requireOperatorAuth, async (req, res): Promise<void> => {
  const identity = getOperatorIdentity(req)!;
  const reservations = await db
    .select({ reservation: rentalReservationsTable })
    .from(rentalReservationsTable)
    .innerJoin(rentalVehiclesTable, eq(rentalReservationsTable.vehicleId, rentalVehiclesTable.id))
    .where(and(
      eq(rentalReservationsTable.operatorId, identity.operatorId),
      eq(rentalVehiclesTable.operatorId, identity.operatorId),
      isNull(rentalReservationsTable.deletedAt),
    ))
    .orderBy(desc(rentalReservationsTable.createdAt));
  res.json(reservations.map(({ reservation }) => ({
    id: reservation.id,
    vehicleId: reservation.vehicleId,
    pickupAt: reservation.pickupAt,
    returnAt: reservation.returnAt,
    pickupLocation: reservation.pickupLocation,
    returnLocation: reservation.returnLocation,
    status: reservation.status,
    paymentStatus: reservation.paymentStatus,
    subtotal: reservation.subtotal,
    addonsTotal: reservation.addonsTotal,
    deliveryFee: reservation.deliveryFee,
    discount: reservation.discount,
    tax: reservation.tax,
    securityDeposit: reservation.securityDeposit,
    paidAmount: reservation.paidAmount,
    outstanding: reservation.outstanding,
    refundAmount: reservation.refundAmount,
    finalTotal: reservation.finalTotal,
    source: reservation.source,
    createdAt: reservation.createdAt,
    updatedAt: reservation.updatedAt,
  })));
});

router.get("/operator/rental/reservations/:id", requireOperatorAuth, async (req, res): Promise<void> => {
  const identity = getOperatorIdentity(req)!;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: "Invalid reservation ID" });
    return;
  }
  const [row] = await db
    .select({ reservation: rentalReservationsTable })
    .from(rentalReservationsTable)
    .innerJoin(rentalVehiclesTable, eq(rentalReservationsTable.vehicleId, rentalVehiclesTable.id))
    .where(and(
      eq(rentalReservationsTable.id, id),
      eq(rentalReservationsTable.operatorId, identity.operatorId),
      eq(rentalVehiclesTable.operatorId, identity.operatorId),
      isNull(rentalReservationsTable.deletedAt),
    ));
  if (!row) {
    res.status(404).json({ error: "Reservation not found" });
    return;
  }
  const reservation = row.reservation;
  res.json({
    id: reservation.id,
    vehicleId: reservation.vehicleId,
    primaryDriverId: reservation.primaryDriverId,
    pickupAt: reservation.pickupAt,
    returnAt: reservation.returnAt,
    pickupLocation: reservation.pickupLocation,
    returnLocation: reservation.returnLocation,
    status: reservation.status,
    paymentStatus: reservation.paymentStatus,
    subtotal: reservation.subtotal,
    addonsTotal: reservation.addonsTotal,
    deliveryFee: reservation.deliveryFee,
    discount: reservation.discount,
    tax: reservation.tax,
    securityDeposit: reservation.securityDeposit,
    paidAmount: reservation.paidAmount,
    outstanding: reservation.outstanding,
    refundAmount: reservation.refundAmount,
    finalTotal: reservation.finalTotal,
    source: reservation.source,
    internalNotes: reservation.internalNotes,
    createdAt: reservation.createdAt,
    updatedAt: reservation.updatedAt,
  });
});

const ReservationUpdateSchema = z.object({
  status: z.enum([
    "confirmed", "awaiting_pickup", "vehicle_dispatched", "in_rental", "overdue",
    "return_initiated", "return_completed", "inspection_pending", "damage_assessed",
  ]).optional(),
  internalNotes: z.string().max(10_000).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one editable field is required");

router.patch("/operator/rental/reservations/:id", requireOperatorAuth, async (req, res): Promise<void> => {
  const identity = getOperatorIdentity(req)!;
  const parsed = ReservationUpdateSchema.safeParse(req.body);
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1 || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "Invalid reservation ID" : parsed.error.message });
    return;
  }
  if (identity.role === "counter" && parsed.data.status && !["confirmed", "awaiting_pickup"].includes(parsed.data.status)) {
    res.status(403).json({ error: "This staff role cannot set that reservation status" });
    return;
  }
  const [reservation] = await db.update(rentalReservationsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(
      eq(rentalReservationsTable.id, id),
      eq(rentalReservationsTable.operatorId, identity.operatorId),
      isNull(rentalReservationsTable.deletedAt),
      exists(db.select({ id: rentalVehiclesTable.id })
        .from(rentalVehiclesTable)
        .where(and(
          eq(rentalVehiclesTable.id, rentalReservationsTable.vehicleId),
          eq(rentalVehiclesTable.operatorId, identity.operatorId),
        ))),
    ))
    .returning();
  if (!reservation) {
    res.status(404).json({ error: "Reservation not found" });
    return;
  }
  res.json({ id: reservation.id, vehicleId: reservation.vehicleId, status: reservation.status, internalNotes: reservation.internalNotes, updatedAt: reservation.updatedAt });
});

export default router;