import { Router, type IRouter } from "express";
import { eq, asc, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { rentalAddonsTable, rentalOperatorsTable } from "@workspace/db";
import { requireAdminAuth } from "../middlewares/admin-auth";
import { platformOperatorId } from "../lib/platform-operator";
import { z } from "zod/v4";
import { logRentalAudit } from "../lib/rental-events";
import { isMarketplaceEnabled } from "../lib/rental-request-policy.mjs";
import { addonCategory, insuranceKind } from "../lib/rental-addon-policy.mjs";

function adminName(req: { session: unknown }) {
  return ((req.session as { admin?: { username?: string } }).admin?.username) ?? "admin";
}

const router: IRouter = Router();

function serializeAddon(addon: typeof rentalAddonsTable.$inferSelect) {
  const isLegacyPerUnit = addon.pricingType === "per_unit";
  return {
    ...addon,
    category: addonCategory(addon),
    insuranceKind: addonCategory(addon) === "insurance" ? insuranceKind(addon) : null,
    pricingType: isLegacyPerUnit ? "flat" : addon.pricingType,
    flatFee: isLegacyPerUnit ? addon.perUnitFee : addon.flatFee,
    createdAt: addon.createdAt.toISOString(),
    updatedAt: addon.updatedAt.toISOString(),
  };
}

const AddonSchema = z.object({
  name: z.string().min(1),
  category: z.enum(["equipment", "insurance", "winter_tires"]).optional(),
  insuranceKind: z.enum(["basic", "cdw", "noc", "full"]).nullable().optional(),
  nameJa: z.string().nullable().optional(),
  nameZhTw: z.string().nullable().optional(),
  description: z.string().optional(),
  descriptionJa: z.string().nullable().optional(),
  descriptionZhTw: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  pricingType: z.enum(["per_started_24_hours", "per_rental", "per_handover", "included", "flat", "per_day"]).optional(),
  flatFee: z.coerce.number().int().min(0).optional(),
  perDayFee: z.coerce.number().int().min(0).optional(),
  maxQty: z.coerce.number().int().optional(),
  inventoryLimit: z.coerce.number().int().nullable().optional(),
  vehicleCompatibility: z.array(z.string()).optional(),
  required: z.boolean().optional(),
  published: z.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
});

router.get("/rental/addons", async (_req, res): Promise<void> => {
  const enabled = isMarketplaceEnabled(process.env.RENTAL_MARKETPLACE_ENABLED);
  const addons = await db
    .select({ addon: rentalAddonsTable })
    .from(rentalAddonsTable)
    .innerJoin(rentalOperatorsTable, eq(rentalAddonsTable.operatorId, rentalOperatorsTable.id))
    .where(and(
      eq(rentalAddonsTable.published, true),
      enabled
        ? and(eq(rentalOperatorsTable.status, "active"), eq(rentalOperatorsTable.verificationStatus, "approved"))
        : eq(rentalOperatorsTable.slug, "platform"),
    ))
    .orderBy(asc(rentalAddonsTable.sortOrder));
  res.json(addons.filter(({ addon }) => addonCategory(addon) !== "winter_tires").map(({ addon }) => serializeAddon(addon)));
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

  const values = {
    ...body.data,
    flatFee: body.data.pricingType === "per_day" ? 0 : body.data.flatFee,
    perDayFee: body.data.pricingType === "flat" ? 0 : body.data.perDayFee,
    perUnitFee: 0,
  };
  const [addon] = await db.insert(rentalAddonsTable).values({ ...values, operatorId: await platformOperatorId() }).returning();
  await logRentalAudit({ adminUser: adminName(req), action: "addon_created", recordType: "addon", recordId: addon.id, newValue: { name: addon.name } });
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

  const values = {
    ...body.data,
    ...(body.data.pricingType === "per_day" ? { flatFee: 0, perUnitFee: 0 } : {}),
    ...(body.data.pricingType === "flat" ? { perDayFee: 0, perUnitFee: 0 } : {}),
  };
  const [addon] = await db
    .update(rentalAddonsTable)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(rentalAddonsTable.id, id))
    .returning();

  if (!addon) {
    res.status(404).json({ error: "Addon not found" });
    return;
  }
  await logRentalAudit({ adminUser: adminName(req), action: "addon_updated", recordType: "addon", recordId: id, newValue: { name: addon.name, published: addon.published } });

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
  await logRentalAudit({ adminUser: adminName(req), action: "addon_deleted", recordType: "addon", recordId: id, previousValue: { name: addon.name } });

  res.json({ message: "Addon deleted" });
});

export default router;
