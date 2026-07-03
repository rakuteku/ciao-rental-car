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
  CreateAdminCarBody,
  DeleteAdminCarParams,
} from "@workspace/api-zod";
import { requireAdminAuth } from "../middlewares/admin-auth";

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

router.get("/admin/cars", requireAdminAuth, async (_req, res): Promise<void> => {
  const cars = await db.select().from(carsTable).orderBy(carsTable.id);
  res.json(GetCarsResponse.parse(cars));
});

router.post("/admin/cars", requireAdminAuth, async (req, res): Promise<void> => {
  const body = CreateAdminCarBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [car] = await db.insert(carsTable).values({
    model: body.data.model,
    name: body.data.name,
    year: body.data.year,
    passengerCapacity: body.data.passengerCapacity,
    fuelEfficiency: body.data.fuelEfficiency,
    pricePerDay: body.data.pricePerDay,
    airportPickupFee: body.data.airportPickupFee,
    airportDropoffFee: body.data.airportDropoffFee,
    imageUrls: body.data.imageUrls ?? [],
    imageUrl: body.data.imageUrl ?? (body.data.imageUrls?.[0] ?? ""),
    isAvailable: body.data.isAvailable ?? true,
    description: body.data.description ?? undefined,
  }).returning();

  res.status(201).json(GetCarResponse.parse(car));
});

router.put("/admin/cars/:id", requireAdminAuth, async (req, res): Promise<void> => {
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
  if (body.data.model !== undefined) updateData.model = body.data.model;
  if (body.data.name !== undefined && body.data.name !== null) updateData.name = body.data.name;
  if (body.data.year !== undefined && body.data.year !== null) updateData.year = body.data.year;
  if (body.data.passengerCapacity !== undefined && body.data.passengerCapacity !== null) {
    updateData.passengerCapacity = body.data.passengerCapacity;
  }
  if (body.data.fuelEfficiency !== undefined && body.data.fuelEfficiency !== null) {
    updateData.fuelEfficiency = body.data.fuelEfficiency;
  }
  if (body.data.pricePerDay !== undefined) updateData.pricePerDay = body.data.pricePerDay;
  if (body.data.airportPickupFee !== undefined) updateData.airportPickupFee = body.data.airportPickupFee;
  if (body.data.airportDropoffFee !== undefined) updateData.airportDropoffFee = body.data.airportDropoffFee;
  if (body.data.imageUrls !== undefined) {
    updateData.imageUrls = body.data.imageUrls;
    if (body.data.imageUrls.length > 0 && !body.data.imageUrl) {
      updateData.imageUrl = body.data.imageUrls[0];
    }
  }
  if (body.data.imageUrl !== undefined) updateData.imageUrl = body.data.imageUrl;
  if (body.data.isAvailable !== undefined) updateData.isAvailable = body.data.isAvailable;
  if (body.data.description !== undefined) updateData.description = body.data.description ?? undefined;

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

router.delete("/admin/cars/:id", requireAdminAuth, async (req, res): Promise<void> => {
  const params = DeleteAdminCarParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [car] = await db
    .delete(carsTable)
    .where(eq(carsTable.id, params.data.id))
    .returning();

  if (!car) {
    res.status(404).json({ error: "Car not found" });
    return;
  }

  res.json({ message: "Car deleted successfully" });
});

export default router;
