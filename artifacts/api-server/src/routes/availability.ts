import { Router, type IRouter } from "express";
import { eq, and, between } from "drizzle-orm";
import { db, availabilityTable, carsTable } from "@workspace/db";
import {
  GetCarAvailabilityParams,
  GetCarAvailabilityQueryParams,
  GetCarAvailabilityResponse,
  SetCarAvailabilityParams,
  SetCarAvailabilityBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/cars/:id/availability", async (req, res): Promise<void> => {
  const params = GetCarAvailabilityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const query = GetCarAvailabilityQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  let q = db.select().from(availabilityTable).where(eq(availabilityTable.carId, params.data.id));

  const rows = await q.orderBy(availabilityTable.date);
  res.json(GetCarAvailabilityResponse.parse(rows));
});

router.post("/admin/cars/:id/availability", async (req, res): Promise<void> => {
  const params = SetCarAvailabilityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = SetCarAvailabilityBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [car] = await db.select().from(carsTable).where(eq(carsTable.id, params.data.id));
  if (!car) {
    res.status(404).json({ error: "Car not found" });
    return;
  }

  const start = new Date(body.data.startDate);
  const end = new Date(body.data.endDate);
  const dates: string[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split("T")[0]);
  }

  for (const date of dates) {
    const [existing] = await db
      .select()
      .from(availabilityTable)
      .where(and(eq(availabilityTable.carId, params.data.id), eq(availabilityTable.date, date)));

    if (existing) {
      await db
        .update(availabilityTable)
        .set({ isAvailable: body.data.isAvailable })
        .where(eq(availabilityTable.id, existing.id));
    } else {
      await db.insert(availabilityTable).values({
        carId: params.data.id,
        date,
        isAvailable: body.data.isAvailable,
      });
    }
  }

  res.json({ message: `Availability updated for ${dates.length} date(s)` });
});

export default router;
