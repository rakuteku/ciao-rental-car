import { Router, type IRouter } from "express";
import { count, sum, eq } from "drizzle-orm";
import { db, carsTable, bookingsTable } from "@workspace/db";
import {
  AdminLoginBody,
  AdminLoginResponse,
  GetAdminStatsResponse,
} from "@workspace/api-zod";

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "ciao2024";

const router: IRouter = Router();

router.post("/admin/login", async (req, res): Promise<void> => {
  const body = AdminLoginBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  if (body.data.username !== ADMIN_USERNAME || body.data.password !== ADMIN_PASSWORD) {
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

router.get("/admin/stats", async (_req, res): Promise<void> => {
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
