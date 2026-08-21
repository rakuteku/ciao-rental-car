import { Router, type IRouter } from "express";
import { eq, and, gte, isNull, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { rentalAvailabilityBlocksTable, rentalVehiclesTable } from "@workspace/db";
import { requireAdminAuth } from "../middlewares/admin-auth";
import { getTurnaroundBufferHours } from "./rental-vehicles";
import { z } from "zod/v4";
import { logRentalAudit } from "../lib/rental-events";

const router: IRouter = Router();

function adminName(req: { session: unknown }) {
  return ((req.session as { admin?: { username?: string } }).admin?.username) ?? "admin";
}

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

router.get("/admin/rental/settings/turnaround-buffer", requireAdminAuth, async (_req, res): Promise<void> => {
  res.json({ turnaroundBufferHours: await getTurnaroundBufferHours() });
});

function getValidatedInterval(startAt: string, endAt: string): { startAt: Date; endAt: Date } | null {
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
  return { startAt: start, endAt: end };
}

function getRecurringIntervals(
  startAt: Date,
  endAt: Date,
  recurrenceRule?: string | null,
): Array<{ startAt: Date; endAt: Date }> | null {
  if (!recurrenceRule) return [{ startAt, endAt }];
  const match = /^FREQ=(DAILY|WEEKLY|MONTHLY);UNTIL=([^;]+)(?:;SERIES=[a-z0-9-]+)?$/i.exec(recurrenceRule);
  if (!match) return null;
  const until = new Date(match[2]);
  if (Number.isNaN(until.getTime()) || until < startAt) return null;

  const intervals: Array<{ startAt: Date; endAt: Date }> = [];
  const duration = endAt.getTime() - startAt.getTime();
  let occurrence = 0;
  const anchorDay = startAt.getDate();
  while (intervals.length < 2000) {
    let nextStart: Date;
    if (match[1].toUpperCase() === "DAILY") {
      nextStart = new Date(startAt);
      nextStart.setDate(startAt.getDate() + occurrence);
    } else if (match[1].toUpperCase() === "WEEKLY") {
      nextStart = new Date(startAt);
      nextStart.setDate(startAt.getDate() + occurrence * 7);
    } else {
      nextStart = new Date(startAt);
      nextStart.setDate(1);
      nextStart.setMonth(startAt.getMonth() + occurrence);
      const lastDay = new Date(nextStart.getFullYear(), nextStart.getMonth() + 1, 0).getDate();
      nextStart.setDate(Math.min(anchorDay, lastDay));
    }
    if (nextStart > until) return intervals;
    const nextEnd = new Date(nextStart.getTime() + duration);
    intervals.push({ startAt: new Date(nextStart), endAt: new Date(nextEnd) });
    occurrence += 1;
  }
  return null;
}

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
  const interval = getValidatedInterval(body.data.startAt, body.data.endAt);
  if (!interval) {
    res.status(400).json({ error: "End date must be after a valid start date" });
    return;
  }
  const recurrenceRule = body.data.isRecurring && body.data.recurrenceRule
    ? `${body.data.recurrenceRule};SERIES=${crypto.randomUUID()}`
    : null;
  const intervals = getRecurringIntervals(interval.startAt, interval.endAt, recurrenceRule);
  if (!intervals) {
    res.status(400).json({ error: "Invalid recurrence rule or more than 2,000 occurrences requested" });
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

  const createdBlocks = await db
    .insert(rentalAvailabilityBlocksTable)
    .values(intervals.map((entry) => ({
      vehicleId: body.data.vehicleId,
      startAt: entry.startAt,
      endAt: entry.endAt,
      reason: body.data.reason ?? "manual",
      notes: body.data.notes ?? null,
      isRecurring: body.data.isRecurring ?? false,
      recurrenceRule,
      createdBy: body.data.createdBy ?? null,
    })))
    .returning();
  const block = createdBlocks[0];

  if (body.data.reason === "maintenance" || body.data.reason === "inspection") {
    await db
      .update(rentalVehiclesTable)
      .set({ status: "unpublished", updatedAt: new Date() })
      .where(eq(rentalVehiclesTable.id, body.data.vehicleId));
  }
  await logRentalAudit({ adminUser: adminName(req), action: "availability_block_created", recordType: "availability_block", recordId: block.id, newValue: { vehicleId: block.vehicleId, reason: block.reason } });

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

  const [existingBlock] = await db
    .select()
    .from(rentalAvailabilityBlocksTable)
    .where(eq(rentalAvailabilityBlocksTable.id, id));
  if (!existingBlock) {
    res.status(404).json({ error: "Block not found" });
    return;
  }
  const interval = getValidatedInterval(
    body.data.startAt ?? existingBlock.startAt.toISOString(),
    body.data.endAt ?? existingBlock.endAt.toISOString(),
  );
  if (!interval) {
    res.status(400).json({ error: "End date must be after a valid start date" });
    return;
  }

  const updateData: Partial<typeof rentalAvailabilityBlocksTable.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (body.data.vehicleId !== undefined) updateData.vehicleId = body.data.vehicleId;
  if (body.data.startAt !== undefined) updateData.startAt = interval.startAt;
  if (body.data.endAt !== undefined) updateData.endAt = interval.endAt;
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

  if (body.data.reason === "maintenance" || body.data.reason === "inspection") {
    await db
      .update(rentalVehiclesTable)
      .set({ status: "unpublished", updatedAt: new Date() })
      .where(eq(rentalVehiclesTable.id, block.vehicleId));
  }

  res.json(serializeBlock(block));
});

router.put("/admin/rental/availability-blocks/:id/future", requireAdminAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid block ID" });
    return;
  }
  const body = BlockSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const interval = getValidatedInterval(body.data.startAt, body.data.endAt);
  if (!interval || !body.data.isRecurring || !body.data.recurrenceRule) {
    res.status(400).json({ error: "A valid recurring interval is required" });
    return;
  }

  const [existingBlock] = await db
    .select()
    .from(rentalAvailabilityBlocksTable)
    .where(eq(rentalAvailabilityBlocksTable.id, id));
  const existingRule = existingBlock?.recurrenceRule;
  const seriesMatch = existingRule?.match(/;SERIES=([a-z0-9-]+)$/i);
  if (!existingBlock || !existingRule || !seriesMatch) {
    res.status(400).json({ error: "This block is not part of an editable recurring series" });
    return;
  }
  const recurrenceRule = `${body.data.recurrenceRule};SERIES=${seriesMatch[1]}`;
  const intervals = getRecurringIntervals(interval.startAt, interval.endAt, recurrenceRule);
  if (!intervals) {
    res.status(400).json({ error: "Invalid recurrence rule or more than 2,000 occurrences requested" });
    return;
  }

  const blocks = await db.transaction(async (tx) => {
    await tx
      .delete(rentalAvailabilityBlocksTable)
      .where(and(
        eq(rentalAvailabilityBlocksTable.vehicleId, existingBlock.vehicleId),
        sql`${rentalAvailabilityBlocksTable.recurrenceRule} LIKE ${`%;SERIES=${seriesMatch[1]}`}`,
        gte(rentalAvailabilityBlocksTable.startAt, existingBlock.startAt),
      ));
    return tx
      .insert(rentalAvailabilityBlocksTable)
      .values(intervals.map((entry) => ({
        vehicleId: body.data.vehicleId,
        startAt: entry.startAt,
        endAt: entry.endAt,
        reason: body.data.reason ?? "manual",
        notes: body.data.notes ?? null,
        isRecurring: true,
        recurrenceRule,
        createdBy: body.data.createdBy ?? null,
      })))
      .returning();
  });
  res.json(serializeBlock(blocks[0]));
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
  await logRentalAudit({ adminUser: adminName(req), action: "availability_block_deleted", recordType: "availability_block", recordId: id, previousValue: { vehicleId: block.vehicleId, reason: block.reason } });

  res.json({ message: "Block deleted" });
});

export default router;
