import { Router, type IRouter } from "express";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  rentalCustomerAccountsTable,
  rentalDriversTable,
  rentalReservationsTable,
  rentalVehiclesTable,
} from "@workspace/db";
import { requireAdminAuth } from "../middlewares/admin-auth";

const router: IRouter = Router();
const scrypt = promisify(scryptCallback);
const customerSessionKey = "rentalCustomerAccountId";

const credentialsSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8).max(128),
});

const registrationSchema = credentialsSchema.extend({
  fullName: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional(),
  preferredLanguage: z.enum(["en", "ja", "zh-TW"]).default("en"),
});

function publicAccount(account: typeof rentalCustomerAccountsTable.$inferSelect) {
  const { passwordHash: _passwordHash, ...safe } = account;
  return {
    ...safe,
    lastLoginAt: safe.lastLoginAt?.toISOString() ?? null,
    createdAt: safe.createdAt.toISOString(),
    updatedAt: safe.updatedAt.toISOString(),
  };
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string) {
  const [salt, keyHex] = stored.split(":");
  if (!salt || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = await scrypt(password, salt, expected.length) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function bookingsForEmail(email: string) {
  const drivers = await db.select({ id: rentalDriversTable.id }).from(rentalDriversTable).where(eq(rentalDriversTable.email, email));
  const driverIds = drivers.map((driver) => driver.id);
  if (!driverIds.length) return [];

  const rows = await db
    .select({ reservation: rentalReservationsTable, vehicleTitle: rentalVehiclesTable.publicTitle })
    .from(rentalReservationsTable)
    .leftJoin(rentalVehiclesTable, eq(rentalReservationsTable.vehicleId, rentalVehiclesTable.id))
    .where(and(inArray(rentalReservationsTable.primaryDriverId, driverIds), isNull(rentalReservationsTable.deletedAt)))
    .orderBy(desc(rentalReservationsTable.createdAt));

  return rows.map(({ reservation, vehicleTitle }) => ({
    ...reservation,
    customerAccessToken: undefined,
    internalNotes: undefined,
    vehicleTitle: vehicleTitle ?? `Vehicle #${reservation.vehicleId}`,
    pickupAt: reservation.pickupAt.toISOString(),
    returnAt: reservation.returnAt.toISOString(),
    createdAt: reservation.createdAt.toISOString(),
    updatedAt: reservation.updatedAt.toISOString(),
    deletedAt: null,
  }));
}

router.post("/rental/account/register", async (req, res): Promise<void> => {
  const parsed = registrationSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: parsed.error.message });

  const [existing] = await db.select({ id: rentalCustomerAccountsTable.id }).from(rentalCustomerAccountsTable).where(eq(rentalCustomerAccountsTable.email, parsed.data.email));
  if (existing) return void res.status(409).json({ error: "An account already exists for this email" });

  const [account] = await db.insert(rentalCustomerAccountsTable).values({
    email: parsed.data.email,
    passwordHash: await hashPassword(parsed.data.password),
    fullName: parsed.data.fullName,
    phone: parsed.data.phone || null,
    preferredLanguage: parsed.data.preferredLanguage,
  }).returning();

  const session = req.session as unknown as Record<string, unknown>;
  session[customerSessionKey] = account.id;
  session.rentalCustomerEmail = account.email;
  res.status(201).json({ account: publicAccount(account), bookings: await bookingsForEmail(account.email) });
});

router.post("/rental/account/login", async (req, res): Promise<void> => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "Invalid email or password" });

  const [account] = await db.select().from(rentalCustomerAccountsTable).where(eq(rentalCustomerAccountsTable.email, parsed.data.email));
  if (!account || account.status !== "active" || !(await verifyPassword(parsed.data.password, account.passwordHash))) {
    return void res.status(401).json({ error: "Invalid email or password" });
  }

  const [updated] = await db.update(rentalCustomerAccountsTable).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(rentalCustomerAccountsTable.id, account.id)).returning();
  const session = req.session as unknown as Record<string, unknown>;
  session[customerSessionKey] = account.id;
  session.rentalCustomerEmail = account.email;
  delete session.rentalCustomerBookingId;
  res.json({ account: publicAccount(updated), bookings: await bookingsForEmail(updated.email) });
});

router.post("/rental/account/logout", (req, res): void => {
  const session = req.session as unknown as Record<string, unknown>;
  delete session[customerSessionKey];
  delete session.rentalCustomerEmail;
  delete session.rentalCustomerBookingId;
  res.status(204).end();
});

router.get("/rental/account/me", async (req, res): Promise<void> => {
  const accountId = Number((req.session as unknown as Record<string, unknown>)[customerSessionKey]);
  if (!accountId) return void res.status(401).json({ error: "Not authenticated" });
  const [account] = await db.select().from(rentalCustomerAccountsTable).where(eq(rentalCustomerAccountsTable.id, accountId));
  if (!account || account.status !== "active") return void res.status(401).json({ error: "Not authenticated" });
  (req.session as unknown as Record<string, unknown>).rentalCustomerEmail = account.email;
  res.json({ account: publicAccount(account), bookings: await bookingsForEmail(account.email) });
});

router.get("/admin/rental/customers", requireAdminAuth, async (_req, res): Promise<void> => {
  const accounts = await db.select().from(rentalCustomerAccountsTable).orderBy(desc(rentalCustomerAccountsTable.createdAt));
  const result = await Promise.all(accounts.map(async (account) => ({
    ...publicAccount(account),
    bookings: await bookingsForEmail(account.email),
  })));
  res.json(result);
});

router.patch("/admin/rental/customers/:id", requireAdminAuth, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const parsed = z.object({ status: z.enum(["active", "suspended"]) }).safeParse(req.body);
  if (!Number.isInteger(id) || !parsed.success) return void res.status(400).json({ error: parsed.success ? "Invalid customer ID" : parsed.error.message });
  const [account] = await db.update(rentalCustomerAccountsTable).set({ status: parsed.data.status, updatedAt: new Date() }).where(eq(rentalCustomerAccountsTable.id, id)).returning();
  if (!account) return void res.status(404).json({ error: "Customer not found" });
  res.json({ ...publicAccount(account), bookings: await bookingsForEmail(account.email) });
});

export default router;
