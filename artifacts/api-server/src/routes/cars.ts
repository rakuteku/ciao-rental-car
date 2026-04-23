import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, carsTable } from "@workspace/db";
import {
  GetCarParams,
  GetCarsResponse,
  GetCarResponse,
  UpdateAdminCarParams,
  UpdateAdminCarBody,
  UpdateAdminCarResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/cars", async (_req, res): Promise<void> => {
  const cars = await db.select().from(carsTable).orderBy(carsTable.id);
  res.json(GetCarsResponse.parse(cars));
});

router.get("/cars/:id", async (req, res): Promise<void> => {
  const params = GetCarParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [car] = await db.select().from(carsTable).where(eq(carsTable.id, params.data.id));
  if (!car) {
    res.status(404).json({ error: "Car not found" });
    return;
  }

  res.json(GetCarResponse.parse(car));
});

router.put("/admin/cars/:id", async (req, res): Promise<void> => {
  const params = UpdateAdminCarParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateAdminCarBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const updateData: Partial<typeof carsTable.$inferInsert> = {};
  if (body.data.pricePerDay !== undefined) updateData.pricePerDay = body.data.pricePerDay;
  if (body.data.isAvailable !== undefined) updateData.isAvailable = body.data.isAvailable;
  if (body.data.name !== undefined && body.data.name !== null) updateData.name = body.data.name;
  if (body.data.description !== undefined) updateData.description = body.data.description ?? undefined;
  if (body.data.passengerCapacity !== undefined && body.data.passengerCapacity !== null) {
    updateData.passengerCapacity = body.data.passengerCapacity;
  }

  const [car] = await db
    .update(carsTable)
    .set(updateData)
    .where(eq(carsTable.id, params.data.id))
    .returning();

  if (!car) {
    res.status(404).json({ error: "Car not found" });
    return;
  }

  res.json(UpdateAdminCarResponse.parse(car));
});

router.get("/admin/cars", async (_req, res): Promise<void> => {
  const cars = await db.select().from(carsTable).orderBy(carsTable.id);
  res.json(GetCarsResponse.parse(cars));
});

export default router;
