import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db } from "@workspace/db";
import { rentalAddonsTable } from "@workspace/db";
import { requireAdminAuth } from "../middlewares/admin-auth";
import { z } from "zod/v4";

const router: IRouter = Router();

function serializeAddon(addon: typeof rentalAddonsTable.$inferSelect) {
  return {
    ...addon,
    createdAt: addon.createdAt.toISOString(),
    updatedAt: addon.updatedAt.toISOString(),
  };
}

const AddonSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  image: z.string().nullable().optional(),
  pricingType: z.enum(["flat", "per_day", "per_unit"]).optional(),
  flatFee: z.coerce.number().optional(),
  perDayFee: z.coerce.number().optional(),
  perUnitFee: z.coerce.number().optional(),
  maxQty: z.coerce.number().int().optional(),
  inventoryLimit: z.coerce.number().int().nullable().optional(),
  vehicleCompatibility: z.array(z.string()).optional(),
  required: z.boolean().optional(),
  published: z.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
});

router.get("/rental/addons", async (_req, res): Promise<void> => {
  const addons = await db
    .select()
    .from(rentalAddonsTable)
    .where(eq(rentalAddonsTable.published, true))
    .orderBy(asc(rentalAddonsTable.sortOrder));
  res.json(addons.map(serializeAddon));
});

router.get("/admin/rental/addons", requireAdminAuth, async (_req, res): Promise<void> => {
  const addons = await db
    .select()
    .from(rentalAddonsTable)
    .orderBy(asc(rentalAddonsTable.sortOrder));
  res.json(addons.map(serializeAddon));
});

router.post("/admin/rental/addons", requireAdminAuth, async (req, res): Promise<void> => {
  const body = AddonSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [addon] = await db.insert(rentalAddonsTable).values(body.data).returning();
  res.status(201).json(serializeAddon(addon));
});

router.put("/admin/rental/addons/:id", requireAdminAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid addon ID" });
    return;
  }

  const body = AddonSchema.partial().safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [addon] = await db
    .update(rentalAddonsTable)
    .set({ ...body.data, updatedAt: new Date() })
    .where(eq(rentalAddonsTable.id, id))
    .returning();

  if (!addon) {
    res.status(404).json({ error: "Addon not found" });
    return;
  }

  res.json(serializeAddon(addon));
});

router.delete("/admin/rental/addons/:id", requireAdminAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid addon ID" });
    return;
  }

  const [addon] = await db
    .delete(rentalAddonsTable)
    .where(eq(rentalAddonsTable.id, id))
    .returning();

  if (!addon) {
    res.status(404).json({ error: "Addon not found" });
    return;
  }

  res.json({ message: "Addon deleted" });
});

export default router;
