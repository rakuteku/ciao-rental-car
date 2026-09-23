import { Router, type IRouter } from "express";
import { count, sum, eq } from "drizzle-orm";
import { db, carsTable, bookingsTable } from "@workspace/db";
import {
  AdminLoginBody,
  AdminLoginResponse,
  GetAdminStatsResponse,
} from "@workspace/api-zod";
import { requireAdminAuth } from "../middlewares/admin-auth";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME?.trim() || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (process.env.NODE_ENV === "production" && (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12)) {
  throw new Error("ADMIN_PASSWORD must be configured with at least 12 characters in production");
}

const router: IRouter = Router();
const loginAttempts = new Map<string, number[]>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 10;

function isRateLimited(ip: string) {
  const now = Date.now();
  const recent = (loginAttempts.get(ip) ?? []).filter((timestamp) => now - timestamp < LOGIN_WINDOW_MS);
  if (recent.length >= MAX_LOGIN_ATTEMPTS) {
    loginAttempts.set(ip, recent);
    return true;
  }
  recent.push(now);
  loginAttempts.set(ip, recent);
  return false;
}

router.post("/admin/login", async (req, res): Promise<void> => {
  if (isRateLimited(req.ip || "unknown")) {
    res.status(429).json({ error: "Too many login attempts. Try again later." });
    return;
  }
  const body = AdminLoginBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  if (!ADMIN_PASSWORD || body.data.username !== ADMIN_USERNAME || body.data.password !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  (req.session as unknown as Record<string, unknown>).admin = { username: body.data.username };
  res.json(AdminLoginResponse.parse({ authenticated: true, username: body.data.username }));
});

router.post("/admin/logout", async (req, res): Promise<void> => {
  req.session.destroy(() => {
    res.json({ message: "Logged out" });
  });
});

router.get("/admin/me", async (req, res): Promise<void> => {
  const session = req.session as unknown as Record<string, unknown>;
  if (!session.admin) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const admin = session.admin as { username: string };
  res.json(AdminLoginResponse.parse({ authenticated: true, username: admin.username }));
});

router.get("/admin/stats", requireAdminAuth, async (_req, res): Promise<void> => {
  const [bookingStats] = await db
    .select({
      totalBookings: count(bookingsTable.id),
      totalRevenue: sum(bookingsTable.totalPrice),
    })
    .from(bookingsTable);

  const [carStats] = await db
    .select({
      totalCars: count(carsTable.id),
    })
    .from(carsTable);

  const [availableCarStats] = await db
    .select({
      availableCars: count(carsTable.id),
    })
    .from(carsTable)
    .where(eq(carsTable.isAvailable, true));

  const allBookings = await db
    .select({ id: bookingsTable.id })
    .from(bookingsTable);

  res.json(GetAdminStatsResponse.parse({
    totalBookings: bookingStats?.totalBookings ?? 0,
    totalRevenue: Number(bookingStats?.totalRevenue ?? 0),
    availableCars: availableCarStats?.availableCars ?? 0,
    totalCars: carStats?.totalCars ?? 0,
    recentBookings: allBookings.length,
  }));
});

export default router;
