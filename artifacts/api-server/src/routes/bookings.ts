import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, bookingsTable, carsTable } from "@workspace/db";
import {
  CreateBookingBody,
  GetAdminBookingsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/bookings", async (req, res): Promise<void> => {
  const body = CreateBookingBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [car] = await db.select().from(carsTable).where(eq(carsTable.id, body.data.carId));
  if (!car) {
    res.status(400).json({ error: "Car not found" });
    return;
  }

  if (!car.isAvailable) {
    res.status(409).json({ error: "Car is not available for selected dates" });
    return;
  }

  const pickup = new Date(body.data.pickupDate);
  const returnD = new Date(body.data.returnDate);
  const days = Math.max(1, Math.ceil((returnD.getTime() - pickup.getTime()) / (1000 * 60 * 60 * 24)));
  const totalPrice = days * car.pricePerDay;

  const [booking] = await db.insert(bookingsTable).values({
    carId: body.data.carId,
    pickupDate: body.data.pickupDate,
    returnDate: body.data.returnDate,
    pickupLocation: body.data.pickupLocation,
    returnLocation: body.data.returnLocation,
    name: body.data.name,
    email: body.data.email,
    phone: body.data.phone,
    totalPrice,
  }).returning();

  res.status(201).json({
    ...booking,
    createdAt: booking.createdAt.toISOString(),
  });
});

router.get("/admin/bookings", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: bookingsTable.id,
      carId: bookingsTable.carId,
      carName: carsTable.name,
      pickupDate: bookingsTable.pickupDate,
      returnDate: bookingsTable.returnDate,
      pickupLocation: bookingsTable.pickupLocation,
      returnLocation: bookingsTable.returnLocation,
      name: bookingsTable.name,
      email: bookingsTable.email,
      phone: bookingsTable.phone,
      totalPrice: bookingsTable.totalPrice,
      createdAt: bookingsTable.createdAt,
    })
    .from(bookingsTable)
    .leftJoin(carsTable, eq(bookingsTable.carId, carsTable.id))
    .orderBy(bookingsTable.createdAt);

  const result = rows.map(row => ({
    ...row,
    carName: row.carName ?? "Unknown",
    createdAt: row.createdAt.toISOString(),
  }));

  res.json(GetAdminBookingsResponse.parse(result));
});

export default router;
