import { Router, type IRouter } from "express";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  rentalAuditLogTable,
  rentalAvailabilityBlocksTable,
  rentalMaintenanceTable,
  rentalSeasonalPricingRulesTable,
  rentalSettingsTable,
  rentalVehiclesTable,
} from "@workspace/db";
import { requireAdminAuth } from "../middlewares/admin-auth";
import { logRentalAudit } from "../lib/rental-events";

const router: IRouter = Router();

const MaintenanceSchema = z.object({
  vehicleId: z.coerce.number().int(),
  type: z.string().min(1),
  description: z.string().nullable().optional(),
  provider: z.string().nullable().optional(),
  scheduledDate: z.string().nullable().optional(),
  startAt: z.string().nullable().optional(),
  endAt: z.string().nullable().optional(),
  mileage: z.coerce.number().int().nullable().optional(),
  cost: z.coerce.number().nullable().optional(),
  receiptUrl: z.string().nullable().optional(),
  status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).default("scheduled"),
  notes: z.string().nullable().optional(),
});

function adminName(req: { session: unknown }) {
  return ((req.session as { admin?: { username?: string } }).admin?.username) ?? "admin";
}

function serializeDates<T extends Record<string, unknown>>(row: T): T {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value]),
  ) as T;
}

router.get("/admin/rental/maintenance", requireAdminAuth, async (req, res): Promise<void> => {
  const vehicleId = req.query.vehicleId ? Number(req.query.vehicleId) : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const rows = await db.select().from(rentalMaintenanceTable).orderBy(desc(rentalMaintenanceTable.createdAt));
  res.json(rows.filter((row) => (!vehicleId || row.vehicleId === vehicleId) && (!status || row.status === status)).map(serializeDates));
});

router.post("/admin/rental/maintenance", requireAdminAuth, async (req, res): Promise<void> => {
  const parsed = MaintenanceSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: parsed.error.message });
  const data = parsed.data;
  const [vehicle] = await db.select().from(rentalVehiclesTable).where(and(eq(rentalVehiclesTable.id, data.vehicleId), isNull(rentalVehiclesTable.deletedAt)));
  if (!vehicle) return void res.status(404).json({ error: "Vehicle not found" });
  if (data.startAt && data.endAt && new Date(data.endAt) <= new Date(data.startAt)) return void res.status(400).json({ error: "Maintenance end time must be after start time" });
  const [record] = await db.insert(rentalMaintenanceTable).values({
    ...data,
    startAt: data.startAt ? new Date(data.startAt) : null,
    endAt: data.endAt ? new Date(data.endAt) : null,
  }).returning();
  if (data.status === "scheduled" || data.status === "in_progress") {
    const startAt = data.startAt ? new Date(data.startAt) : new Date();
    const endAt = data.endAt ? new Date(data.endAt) : new Date(startAt.getTime() + 24 * 60 * 60 * 1000);
    await db.insert(rentalAvailabilityBlocksTable).values({
      vehicleId: data.vehicleId,
      startAt,
      endAt,
      reason: "maintenance",
      notes: `Maintenance #${record.id}: ${data.type}`,
      createdBy: adminName(req),
    });
    await db.update(rentalVehiclesTable).set({ operationalStatus: "maintenance", updatedAt: new Date() }).where(eq(rentalVehiclesTable.id, data.vehicleId));
  }
  await logRentalAudit({ adminUser: adminName(req), action: "maintenance_created", recordType: "maintenance", recordId: record.id, newValue: { type: record.type, status: record.status } });
  res.status(201).json(serializeDates(record));
});

router.put("/admin/rental/maintenance/:id", requireAdminAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = MaintenanceSchema.partial().safeParse(req.body);
  if (!Number.isInteger(id) || !parsed.success) return void res.status(400).json({ error: parsed.success ? "Invalid maintenance ID" : parsed.error.message });
  const [previous] = await db.select().from(rentalMaintenanceTable).where(eq(rentalMaintenanceTable.id, id));
  if (!previous) return void res.status(404).json({ error: "Maintenance record not found" });
  const [record] = await db.update(rentalMaintenanceTable).set({
    ...parsed.data,
    startAt: parsed.data.startAt ? new Date(parsed.data.startAt) : undefined,
    endAt: parsed.data.endAt ? new Date(parsed.data.endAt) : undefined,
    updatedAt: new Date(),
  }).where(eq(rentalMaintenanceTable.id, id)).returning();
  if (record.status === "completed" || record.status === "cancelled") {
    await db.delete(rentalAvailabilityBlocksTable).where(eq(rentalAvailabilityBlocksTable.notes, `Maintenance #${id}: ${previous.type}`));
    const active = await db.select().from(rentalMaintenanceTable).where(eq(rentalMaintenanceTable.vehicleId, record.vehicleId));
    if (!active.some((item) => item.id !== id && (item.status === "scheduled" || item.status === "in_progress"))) {
      await db.update(rentalVehiclesTable).set({ operationalStatus: "available", updatedAt: new Date() }).where(eq(rentalVehiclesTable.id, record.vehicleId));
    }
  }
  await logRentalAudit({ adminUser: adminName(req), action: "maintenance_updated", recordType: "maintenance", recordId: id, previousValue: { status: previous.status }, newValue: { status: record.status } });
  res.json(serializeDates(record));
});

const PricingRuleSchema = z.object({
  name: z.string().min(1),
  appliesTo: z.enum(["all", "class", "vehicle"]).default("all"),
  vehicleClass: z.string().nullable().optional(),
  vehicleId: z.coerce.number().int().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  daysOfWeek: z.array(z.string()).nullable().optional(),
  ruleType: z.enum(["multiplier", "fixed"]).default("multiplier"),
  multiplier: z.coerce.number().nullable().optional(),
  fixedPrice: z.coerce.number().nullable().optional(),
  priority: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
}).refine((rule) => Boolean((rule.startDate && rule.endDate) || (rule.daysOfWeek && rule.daysOfWeek.length)), {
  message: "Pricing rules need a date range or at least one day of week",
});

router.get("/admin/rental/pricing-rules", requireAdminAuth, async (_req, res): Promise<void> => {
  const rules = await db.select().from(rentalSeasonalPricingRulesTable).orderBy(asc(rentalSeasonalPricingRulesTable.priority));
  res.json(rules.map(serializeDates));
});
router.post("/admin/rental/pricing-rules", requireAdminAuth, async (req, res): Promise<void> => {
  const parsed = PricingRuleSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: parsed.error.message });
  const [rule] = await db.insert(rentalSeasonalPricingRulesTable).values(parsed.data).returning();
  await logRentalAudit({ adminUser: adminName(req), action: "pricing_rule_created", recordType: "pricing_rule", recordId: rule.id, newValue: { name: rule.name, priority: rule.priority } });
  res.status(201).json(serializeDates(rule));
});
router.put("/admin/rental/pricing-rules/:id", requireAdminAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = PricingRuleSchema.partial().safeParse(req.body);
  if (!Number.isInteger(id) || !parsed.success) return void res.status(400).json({ error: parsed.success ? "Invalid pricing rule ID" : parsed.error.message });
  const [rule] = await db.update(rentalSeasonalPricingRulesTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(rentalSeasonalPricingRulesTable.id, id)).returning();
  if (!rule) return void res.status(404).json({ error: "Pricing rule not found" });
  await logRentalAudit({ adminUser: adminName(req), action: "pricing_rule_updated", recordType: "pricing_rule", recordId: id, newValue: { name: rule.name, priority: rule.priority } });
  res.json(serializeDates(rule));
});
router.delete("/admin/rental/pricing-rules/:id", requireAdminAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [rule] = await db.delete(rentalSeasonalPricingRulesTable).where(eq(rentalSeasonalPricingRulesTable.id, id)).returning();
  if (!rule) return void res.status(404).json({ error: "Pricing rule not found" });
  await logRentalAudit({ adminUser: adminName(req), action: "pricing_rule_deleted", recordType: "pricing_rule", recordId: id, previousValue: { name: rule.name } });
  res.json({ message: "Pricing rule deleted" });
});

const DEFAULT_SETTINGS = {
  cleaningBufferMinutes: 120,
  preparationBufferMinutes: 60,
  airportDeliveryTravelBufferMinutes: 60,
  lateNightReturnBufferMinutes: 30,
  holdExpiryMinutes: 30,
  pickupLocations: [{ name: "CIAO Sapporo", address: "Wayado Sapporo Ciao, Sapporo", isAirport: false, deliveryFee: 0, afterHours: false, businessHours: "09:00–18:00" }],
  cancellationPolicy: [{ daysBefore: 7, refundPercent: 100 }, { daysBefore: 3, refundPercent: 50 }, { daysBefore: 0, refundPercent: 0 }],
  requiredDocuments: ["drivers_license", "passport"],
};

router.get("/admin/rental/settings", requireAdminAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(rentalSettingsTable);
  const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const result = Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([key, fallback]) => {
    const raw = stored[key];
    if (raw === undefined) return [key, fallback];
    try { return [key, JSON.parse(raw)]; } catch { return [key, raw]; }
  }));
  res.json(result);
});
router.put("/admin/rental/settings", requireAdminAuth, async (req, res): Promise<void> => {
  const allowed = Object.keys(DEFAULT_SETTINGS);
  const entries = Object.entries(req.body as Record<string, unknown>).filter(([key]) => allowed.includes(key));
  for (const [key, value] of entries) {
    await db.insert(rentalSettingsTable).values({ key, value: JSON.stringify(value) })
      .onConflictDoUpdate({ target: rentalSettingsTable.key, set: { value: JSON.stringify(value), updatedAt: new Date() } });
  }
  if (typeof req.body.holdExpiryMinutes === "number") {
    await db.insert(rentalSettingsTable).values({ key: "hold_expiry_minutes", value: String(req.body.holdExpiryMinutes) })
      .onConflictDoUpdate({ target: rentalSettingsTable.key, set: { value: String(req.body.holdExpiryMinutes), updatedAt: new Date() } });
  }
  await logRentalAudit({ adminUser: adminName(req), action: "rental_settings_updated", recordType: "settings", newValue: req.body as Record<string, unknown> });
  res.json({ saved: true });
});

router.get("/admin/rental/audit", requireAdminAuth, async (req, res): Promise<void> => {
  const action = typeof req.query.action === "string" ? req.query.action : undefined;
  const recordType = typeof req.query.recordType === "string" ? req.query.recordType : undefined;
  const page = Math.max(1, Number(req.query.page) || 1);
  const rows = await db.select().from(rentalAuditLogTable).orderBy(desc(rentalAuditLogTable.createdAt));
  const filtered = rows.filter((row) => (!action || row.action.includes(action)) && (!recordType || row.recordType === recordType));
  res.json({ items: filtered.slice((page - 1) * 50, page * 50).map(serializeDates), total: filtered.length, page });
});

router.get("/admin/rental/dashboard", requireAdminAuth, async (_req, res): Promise<void> => {
  const now = new Date();
  const dayEnd = new Date(now); dayEnd.setHours(23, 59, 59, 999);
  const [vehicles, maintenance] = await Promise.all([db.select().from(rentalVehiclesTable).where(isNull(rentalVehiclesTable.deletedAt)), db.select().from(rentalMaintenanceTable)]);
  const { rentalReservationsTable, rentalDriverDocumentsTable } = await import("@workspace/db");
  const reservations = await db.select().from(rentalReservationsTable).where(isNull(rentalReservationsTable.deletedAt));
  const documents = await db.select().from(rentalDriverDocumentsTable);
  res.json({
    activeRentals: reservations.filter((r) => r.status === "in_rental" || r.status === "overdue").length,
    todayPickups: reservations.filter((r) => r.pickupAt >= now && r.pickupAt <= dayEnd).length,
    todayReturns: reservations.filter((r) => r.returnAt >= now && r.returnAt <= dayEnd).length,
    vehiclesAvailable: vehicles.filter((v) => v.operationalStatus === "available").length,
    vehiclesInMaintenance: maintenance.filter((m) => m.status === "scheduled" || m.status === "in_progress").length,
    pendingDocuments: documents.filter((d) => ["submitted", "under_review", "resubmit_required"].includes(d.status)).length,
    outstandingPayments: reservations.reduce((total, r) => total + r.outstanding, 0),
    nextSevenDays: reservations.filter((r) => r.pickupAt >= now && r.pickupAt <= new Date(now.getTime() + 7 * 86400000)).map(serializeDates),
    // Kept alongside the clearer operation fields for the existing dashboard client.
    activeVehicles: vehicles.filter((v) => v.operationalStatus === "in_use").length,
    pendingReservations: reservations.filter((r) => ["inquiry", "quote_sent", "pending_payment"].includes(r.status)).length,
    mtdRevenue: reservations.filter((r) => r.createdAt.getMonth() === now.getMonth() && r.createdAt.getFullYear() === now.getFullYear()).reduce((total, r) => total + r.paidAmount, 0),
    recentActivity: reservations.slice(0, 5).map((r) => ({ title: `Reservation #${r.id}`, description: `Status: ${r.status}`, time: r.updatedAt.toISOString() })),
  });
});

export default router;