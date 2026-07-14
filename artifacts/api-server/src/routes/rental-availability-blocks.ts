import { Router, type IRouter } from "express";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import { rentalAvailabilityBlocksTable, rentalVehiclesTable } from "@workspace/db";
import { requireAdminAuth } from "../middlewares/admin-auth";
import { z } from "zod/v4";

const router: IRouter = Router();

function serializeBlock(block: typeof rentalAvailabilityBlocksTable.$inferSelect) {
  return {
    ...block,
    startAt: block.startAt.toISOString(),
    endAt: block.endAt.toISOString(),
    createdAt: block.createdAt.toISOString(),
    updatedAt: block.updatedAt.toISOString(),
  };
}

const BlockSchema = z.object({
  vehicleId: z.coerce.number().int(),
  startAt: z.string(),
  endAt: z.string(),
  reason: z.enum(["maintenance", "cleaning", "buffer", "manual", "reservation", "holiday", "inspection", "other"]).optional(),
  notes: z.string().nullable().optional(),
  isRecurring: z.boolean().optional(),
  recurrenceRule: z.string().nullable().optional(),
  createdBy: z.string().nullable().optional(),
});

router.get("/admin/rental/availability-blocks", requireAdminAuth, async (req, res): Promise<void> => {
  const vehicleId = req.query.vehicleId ? parseInt(req.query.vehicleId as string, 10) : undefined;

  let query = db.select().from(rentalAvailabilityBlocksTable);
  const blocks = vehicleId
    ? await db.select().from(rentalAvailabilityBlocksTable).where(eq(rentalAvailabilityBlocksTable.vehicleId, vehicleId))
    : await db.select().from(rentalAvailabilityBlocksTable);

  res.json(blocks.map(serializeBlock));
});

router.post("/admin/rental/availability-blocks", requireAdminAuth, async (req, res): Promise<void> => {
  const body = BlockSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [vehicle] = await db
    .select()
    .from(rentalVehiclesTable)
    .where(and(eq(rentalVehiclesTable.id, body.data.vehicleId), isNull(rentalVehiclesTable.deletedAt)));

  if (!vehicle) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }

  const [block] = await db
    .insert(rentalAvailabilityBlocksTable)
    .values({
      vehicleId: body.data.vehicleId,
      startAt: new Date(body.data.startAt),
      endAt: new Date(body.data.endAt),
      reason: body.data.reason ?? "manual",
      notes: body.data.notes ?? null,
      isRecurring: body.data.isRecurring ?? false,
      recurrenceRule: body.data.recurrenceRule ?? null,
      createdBy: body.data.createdBy ?? null,
    })
    .returning();

  if (body.data.reason === "maintenance") {
    await db
      .update(rentalVehiclesTable)
      .set({ status: "unpublished", updatedAt: new Date() })
      .where(eq(rentalVehiclesTable.id, body.data.vehicleId));
  }

  res.status(201).json(serializeBlock(block));
});

router.put("/admin/rental/availability-blocks/:id", requireAdminAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid block ID" });
    return;
  }

  const body = BlockSchema.partial().safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const updateData: Partial<typeof rentalAvailabilityBlocksTable.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (body.data.vehicleId !== undefined) updateData.vehicleId = body.data.vehicleId;
  if (body.data.startAt !== undefined) updateData.startAt = new Date(body.data.startAt);
  if (body.data.endAt !== undefined) updateData.endAt = new Date(body.data.endAt);
  if (body.data.reason !== undefined) updateData.reason = body.data.reason;
  if (body.data.notes !== undefined) updateData.notes = body.data.notes ?? null;
  if (body.data.isRecurring !== undefined) updateData.isRecurring = body.data.isRecurring;
  if (body.data.recurrenceRule !== undefined) updateData.recurrenceRule = body.data.recurrenceRule ?? null;
  if (body.data.createdBy !== undefined) updateData.createdBy = body.data.createdBy ?? null;

  const [block] = await db
    .update(rentalAvailabilityBlocksTable)
    .set(updateData)
    .where(eq(rentalAvailabilityBlocksTable.id, id))
    .returning();

  if (!block) {
    res.status(404).json({ error: "Block not found" });
    return;
  }

  res.json(serializeBlock(block));
});

router.delete("/admin/rental/availability-blocks/:id", requireAdminAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid block ID" });
    return;
  }

  const [block] = await db
    .delete(rentalAvailabilityBlocksTable)
    .where(eq(rentalAvailabilityBlocksTable.id, id))
    .returning();

  if (!block) {
    res.status(404).json({ error: "Block not found" });
    return;
  }

  res.json({ message: "Block deleted" });
});

export default router;
