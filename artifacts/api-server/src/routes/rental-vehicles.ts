import { Router, type IRouter } from "express";
import { eq, and, isNull, asc, desc, inArray, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  rentalVehiclesTable,
  rentalVehicleImagesTable,
  rentalVehiclePricingTable,
  rentalAvailabilityBlocksTable,
  rentalReservationsTable,
  rentalReservationHoldsTable,
  rentalSettingsTable,
  type RentalVehicle,
  type RentalVehicleImage,
} from "@workspace/db";
import { requireAdminAuth } from "../middlewares/admin-auth";
import { z } from "zod/v4";
import { logRentalAudit } from "../lib/rental-events";

export async function getTurnaroundBufferHours(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any = db,
): Promise<number> {
  const [setting] = await client
    .select()
    .from(rentalSettingsTable)
    .where(eq(rentalSettingsTable.key, "cleaningBufferMinutes"));
  const minutes = setting ? Number(JSON.parse(setting.value)) || 120 : 120;
  return minutes / 60;
}

const router: IRouter = Router();

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "vehicle";
}

async function ensureUniqueSlug(baseSlug: string, excludeId?: number): Promise<string> {
  let candidate = baseSlug;
  let suffix = 2;
  while (true) {
    const existing = await db
      .select({ id: rentalVehiclesTable.id })
      .from(rentalVehiclesTable)
      .where(and(eq(rentalVehiclesTable.slug, candidate), isNull(rentalVehiclesTable.deletedAt)));
    const conflict = existing.find((row) => row.id !== excludeId);
    if (!conflict) return candidate;
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

function serializeVehicle(v: RentalVehicle & { images?: RentalVehicleImage[] }) {
  return {
    ...v,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
    deletedAt: v.deletedAt?.toISOString() ?? null,
    images: (v.images ?? []).map((img) => ({
      ...img,
      createdAt: img.createdAt.toISOString(),
    })),
  };
}

async function getBasePrices(vehicleIds: number[]) {
  if (vehicleIds.length === 0) return new Map<number, number>();
  const rows = await db
    .select({
      vehicleId: rentalVehiclePricingTable.vehicleId,
      basePrice: rentalVehiclePricingTable.basePrice,
    })
    .from(rentalVehiclePricingTable)
    .where(inArray(rentalVehiclePricingTable.vehicleId, vehicleIds));
  return new Map(rows.map((row) => [row.vehicleId, row.basePrice]));
}

export async function isVehicleAvailable(
  vehicleId: number,
  pickupAt: Date,
  returnAt: Date,
  excludeHoldId?: number,
  excludeReservationId?: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any = db,
): Promise<boolean> {
  const bufferHours = await getTurnaroundBufferHours(client);
  const bufferMs = bufferHours * 60 * 60 * 1000;
  const bufferedStart = new Date(pickupAt.getTime() - bufferMs);
  const bufferedEnd = new Date(returnAt.getTime() + bufferMs);

  const blocks = await client
    .select()
    .from(rentalAvailabilityBlocksTable)
    .where(eq(rentalAvailabilityBlocksTable.vehicleId, vehicleId));

  for (const block of blocks) {
    if (block.startAt < bufferedEnd && block.endAt > bufferedStart) {
      return false;
    }
  }

  const activeReservationStatuses = [
    "pending_payment",
    "confirmed",
    "driver_documents_pending",
    "driver_documents_under_review",
    "driver_documents_rejected",
    "awaiting_pickup",
    "vehicle_dispatched",
    "in_rental",
    "overdue",
    "return_initiated",
  ] as const;

  const reservations = await client
    .select()
    .from(rentalReservationsTable)
    .where(
      and(
        eq(rentalReservationsTable.vehicleId, vehicleId),
        isNull(rentalReservationsTable.deletedAt),
        sql`${rentalReservationsTable.status} = ANY(ARRAY[${sql.raw(activeReservationStatuses.map((s) => `'${s}'`).join(","))}]::rental_reservation_status[])`,
      ),
    );

  for (const res of reservations) {
    if (excludeReservationId && res.id === excludeReservationId) continue;
    if (res.pickupAt < bufferedEnd && res.returnAt > bufferedStart) {
      return false;
    }
  }

  const now = new Date();
  const holds = await client
    .select()
    .from(rentalReservationHoldsTable)
    .where(
      and(
        eq(rentalReservationHoldsTable.vehicleId, vehicleId),
        isNull(rentalReservationHoldsTable.releasedAt),
        sql`${rentalReservationHoldsTable.heldUntil} > ${now}`,
      ),
    );

  for (const hold of holds) {
    if (excludeHoldId && hold.id === excludeHoldId) continue;
    if (hold.pickupAt < bufferedEnd && hold.returnAt > bufferedStart) {
      return false;
    }
  }

  return true;
}

export function isVehicleServiceable(
  vehicle: RentalVehicle,
  pickupLocation?: string,
  returnLocation?: string,
): boolean {
  if (vehicle.useGlobalPickupSettings) return true;

  const supportsPickup = !pickupLocation ||
    !vehicle.pickupLocations?.length ||
    vehicle.pickupLocations.includes(pickupLocation);
  const supportsReturn = !returnLocation ||
    !vehicle.returnLocations?.length ||
    vehicle.returnLocations.includes(returnLocation);

  return supportsPickup && supportsReturn;
}

const SearchQuerySchema = z.object({
  pickupAt: z.string().optional(),
  returnAt: z.string().optional(),
  pickupLocation: z.string().optional(),
  returnLocation: z.string().optional(),
  slug: z.string().optional(),
  adults: z.coerce.number().optional(),
  children: z.coerce.number().optional(),
  babies: z.coerce.number().optional(),
  luggageLarge: z.coerce.number().optional(),
  luggageSmall: z.coerce.number().optional(),
  vehicleClass: z.string().optional(),
  transmission: z.string().optional(),
  has4wd: z.enum(["true", "false"]).optional(),
  winterTires: z.enum(["true", "false"]).optional(),
  skiLuggage: z.enum(["true", "false"]).optional(),
  childSeat: z.enum(["true", "false"]).optional(),
  airportDelivery: z.enum(["true", "false"]).optional(),
});

router.get("/rental/vehicles/search", async (req, res): Promise<void> => {
  const query = SearchQuerySchema.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const {
    pickupAt,
    returnAt,
    pickupLocation,
    returnLocation,
    adults,
    children,
    babies,
    luggageLarge,
    luggageSmall,
    vehicleClass,
    transmission,
    slug,
    has4wd,
    winterTires,
    skiLuggage,
    childSeat,
    airportDelivery,
  } = query.data;

  const totalPassengers = (adults ?? 0) + (children ?? 0) + (babies ?? 0);

  let vehicleQuery = db
    .select()
    .from(rentalVehiclesTable)
    .where(
      and(
        isNull(rentalVehiclesTable.deletedAt),
        eq(rentalVehiclesTable.status, "published"),
      ),
    )
    .orderBy(asc(rentalVehiclesTable.sortOrder));

  const vehicles = await vehicleQuery;

  const pickup = pickupAt ? new Date(pickupAt) : null;
  const returnD = returnAt ? new Date(returnAt) : null;

  const available: typeof vehicles = [];
  const unavailable: typeof vehicles = [];

  for (const v of vehicles) {
    if (slug && v.slug !== slug) continue;
    if (!isVehicleServiceable(v, pickupLocation, returnLocation)) continue;
    if (vehicleClass && v.vehicleClass !== vehicleClass) continue;
    if (transmission && v.transmission !== transmission) continue;
    if (has4wd === "true" && !v.has4wd) continue;
    if (winterTires === "true" && !v.hasWinterTires) continue;
    if (skiLuggage === "true" && !v.isSkiFriendly && !v.hasSkiRack) continue;
    if (childSeat === "true" && !v.hasChildSeatCompatible) continue;
    if (
      airportDelivery === "true" &&
      !v.pickupLocations?.includes("New Chitose Airport") &&
      !v.useGlobalPickupSettings
    ) continue;
    if (totalPassengers > 0 && v.maxPassengers < totalPassengers) continue;
    if ((luggageLarge ?? 0) > v.largeLuggageCapacity) continue;
    if ((luggageSmall ?? 0) > v.smallLuggageCapacity) continue;

    if (pickup && returnD) {
      const avail = await isVehicleAvailable(v.id, pickup, returnD);
      if (avail) {
        available.push(v);
      } else {
        unavailable.push(v);
      }
    } else {
      available.push(v);
    }
  }

  const imagesByVehicle = new Map<number, RentalVehicleImage[]>();
  if (vehicles.length > 0) {
    const vehicleIds = vehicles.map((v) => v.id);
    const images = await db
      .select()
      .from(rentalVehicleImagesTable)
      .where(
        sql`${rentalVehicleImagesTable.vehicleId} = ANY(ARRAY[${sql.raw(vehicleIds.join(","))}])`,
      )
      .orderBy(asc(rentalVehicleImagesTable.sortOrder));
    for (const img of images) {
      if (!imagesByVehicle.has(img.vehicleId)) imagesByVehicle.set(img.vehicleId, []);
      imagesByVehicle.get(img.vehicleId)!.push(img);
    }
  }

  const pricingByVehicle = await getBasePrices(vehicles.map((vehicle) => vehicle.id));
  const serialize = (v: RentalVehicle) =>
    ({
      ...serializeVehicle({ ...v, images: imagesByVehicle.get(v.id) ?? [] }),
      basePrice: pricingByVehicle.get(v.id) ?? null,
    });

  res.json({
    available: available.map(serialize),
    unavailable: unavailable.map(serialize),
  });
});

router.get("/rental/vehicles", async (_req, res): Promise<void> => {
  const vehicles = await db
    .select()
    .from(rentalVehiclesTable)
    .where(
      and(
        isNull(rentalVehiclesTable.deletedAt),
        eq(rentalVehiclesTable.status, "published"),
      ),
    )
    .orderBy(asc(rentalVehiclesTable.sortOrder));

  const ids = vehicles.map((v) => v.id);
  let images: RentalVehicleImage[] = [];
  if (ids.length > 0) {
    images = await db
      .select()
      .from(rentalVehicleImagesTable)
      .where(sql`${rentalVehicleImagesTable.vehicleId} = ANY(ARRAY[${sql.raw(ids.join(","))}])`)
      .orderBy(asc(rentalVehicleImagesTable.sortOrder));
  }

  const imagesByVehicle = new Map<number, RentalVehicleImage[]>();
  for (const img of images) {
    if (!imagesByVehicle.has(img.vehicleId)) imagesByVehicle.set(img.vehicleId, []);
    imagesByVehicle.get(img.vehicleId)!.push(img);
  }

  const pricingByVehicle = await getBasePrices(ids);
  res.json(vehicles.map((v) => ({
    ...serializeVehicle({ ...v, images: imagesByVehicle.get(v.id) ?? [] }),
    basePrice: pricingByVehicle.get(v.id) ?? null,
  })));
});

router.get("/rental/vehicles/:slug", async (req, res): Promise<void> => {
  const slug = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;

  const [vehicle] = await db
    .select()
    .from(rentalVehiclesTable)
    .where(
      and(
        eq(rentalVehiclesTable.slug, slug),
        isNull(rentalVehiclesTable.deletedAt),
        eq(rentalVehiclesTable.status, "published"),
      ),
    );

  if (!vehicle) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }

  const images = await db
    .select()
    .from(rentalVehicleImagesTable)
    .where(eq(rentalVehicleImagesTable.vehicleId, vehicle.id))
    .orderBy(asc(rentalVehicleImagesTable.sortOrder));

  const pricing = await db
    .select()
    .from(rentalVehiclePricingTable)
    .where(eq(rentalVehiclePricingTable.vehicleId, vehicle.id));

  res.json({ ...serializeVehicle({ ...vehicle, images }), pricing: pricing[0] ?? null });
});

router.get("/admin/rental/vehicles", requireAdminAuth, async (_req, res): Promise<void> => {
  const vehicles = await db
    .select()
    .from(rentalVehiclesTable)
    .where(isNull(rentalVehiclesTable.deletedAt))
    .orderBy(asc(rentalVehiclesTable.sortOrder));

  const ids = vehicles.map((v) => v.id);
  let images: RentalVehicleImage[] = [];
  let pricingRows: { vehicleId: number; basePrice: number }[] = [];
  if (ids.length > 0) {
    images = await db
      .select()
      .from(rentalVehicleImagesTable)
      .where(sql`${rentalVehicleImagesTable.vehicleId} = ANY(ARRAY[${sql.raw(ids.join(","))}])`)
      .orderBy(asc(rentalVehicleImagesTable.sortOrder));
    pricingRows = await db
      .select({ vehicleId: rentalVehiclePricingTable.vehicleId, basePrice: rentalVehiclePricingTable.basePrice })
      .from(rentalVehiclePricingTable)
      .where(sql`${rentalVehiclePricingTable.vehicleId} = ANY(ARRAY[${sql.raw(ids.join(","))}])`);
  }

  const imagesByVehicle = new Map<number, RentalVehicleImage[]>();
  for (const img of images) {
    if (!imagesByVehicle.has(img.vehicleId)) imagesByVehicle.set(img.vehicleId, []);
    imagesByVehicle.get(img.vehicleId)!.push(img);
  }

  const pricingByVehicle = new Map<number, number>();
  for (const p of pricingRows) {
    pricingByVehicle.set(p.vehicleId, p.basePrice);
  }

  res.json(vehicles.map((v) => ({
    ...serializeVehicle({ ...v, images: imagesByVehicle.get(v.id) ?? [] }),
    basePrice: pricingByVehicle.get(v.id) ?? null,
  })));
});

const CreateVehicleSchema = z.object({
  internalName: z.string().min(1),
  publicTitle: z.string().min(1),
  publicTitleJa: z.string().nullable().optional(),
  publicTitleZhTw: z.string().nullable().optional(),
  slug: z.string().optional(),
  brand: z.string().min(1),
  model: z.string().min(1),
  trim: z.string().nullable().optional(),
  year: z.coerce.number().int(),
  color: z.string().nullable().optional(),
  plate: z.string().nullable().optional(),
  vin: z.string().nullable().optional(),
  vehicleClass: z.enum(["economy", "compact", "midsize", "fullsize", "suv", "minivan", "van", "luxury", "sports", "truck"]).optional(),
  description: z.string().optional(),
  descriptionJa: z.string().nullable().optional(),
  descriptionZhTw: z.string().nullable().optional(),
  internalNotes: z.string().nullable().optional(),
  seats: z.coerce.number().int().optional(),
  recommendedPassengers: z.coerce.number().int().optional(),
  maxPassengers: z.coerce.number().int().optional(),
  smallLuggageCapacity: z.coerce.number().int().optional(),
  largeLuggageCapacity: z.coerce.number().int().optional(),
  doors: z.coerce.number().int().optional(),
  transmission: z.enum(["automatic", "manual", "cvt"]).optional(),
  fuelType: z.enum(["gasoline", "diesel", "hybrid", "electric", "plugin_hybrid"]).optional(),
  driveType: z.enum(["fwd", "rwd", "awd", "4wd"]).optional(),
  engineSize: z.string().nullable().optional(),
  mileage: z.coerce.number().int().nullable().optional(),
  fuelPolicy: z.string().optional(),
  smokingPolicy: z.string().optional(),
  petPolicy: z.string().optional(),
  status: z.enum(["draft", "published", "unpublished", "archived"]).optional(),
  featured: z.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
  has4wd: z.boolean().optional(),
  hasWinterTires: z.boolean().optional(),
  hasSnowBrush: z.boolean().optional(),
  hasIceScraper: z.boolean().optional(),
  isSkiFriendly: z.boolean().optional(),
  hasSkiRack: z.boolean().optional(),
  hasHeatedSeats: z.boolean().optional(),
  hasHeatedSteering: z.boolean().optional(),
  hasEtc: z.boolean().optional(),
  hasNavigation: z.boolean().optional(),
  hasBackupCamera: z.boolean().optional(),
  hasBluetooth: z.boolean().optional(),
  hasUsbPort: z.boolean().optional(),
  hasLargeLuggageSpace: z.boolean().optional(),
  hasEtcCard: z.boolean().optional(),
  hasCarplay: z.boolean().optional(),
  hasAndroidAuto: z.boolean().optional(),
  hasChildSeatCompatible: z.boolean().optional(),
  canonicalUrl: z.string().nullable().optional(),
  useGlobalPickupSettings: z.boolean().optional(),
  pickupLocations: z.array(z.string()).nullable().optional(),
  returnLocations: z.array(z.string()).nullable().optional(),
  afterHoursPickup: z.boolean().optional(),
  afterHoursReturn: z.boolean().optional(),
  requiredDocuments: z.array(z.string()).nullable().optional(),
  operationalStatus: z.enum(["available", "cleaning", "maintenance"]).optional(),
  deliveryLeadTimeHours: z.coerce.number().int().nullable().optional(),
  deliveryFeeOverride: z.coerce.number().nullable().optional(),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  metaTitleJa: z.string().nullable().optional(),
  metaDescriptionJa: z.string().nullable().optional(),
  metaTitleZhTw: z.string().nullable().optional(),
  metaDescriptionZhTw: z.string().nullable().optional(),
  ogTitle: z.string().optional(),
  ogDescription: z.string().optional(),
  ogImage: z.string().optional(),
});

router.post("/admin/rental/vehicles", requireAdminAuth, async (req, res): Promise<void> => {
  const body = CreateVehicleSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const baseSlug = body.data.slug ?? slugify(body.data.publicTitle);
  const slug = await ensureUniqueSlug(baseSlug);

  const [vehicle] = await db
    .insert(rentalVehiclesTable)
    .values({ ...body.data, slug })
    .returning();

  await db.insert(rentalVehiclePricingTable).values({ vehicleId: vehicle.id });
  await logRentalAudit({ adminUser: ((req.session as { admin?: { username?: string } }).admin?.username) ?? "admin", action: "vehicle_created", recordType: "vehicle", recordId: vehicle.id, newValue: { status: vehicle.status, title: vehicle.publicTitle } });

  res.status(201).json(serializeVehicle(vehicle));
});

const UpdateVehicleSchema = CreateVehicleSchema.partial();

router.put("/admin/rental/vehicles/:id", requireAdminAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid vehicle ID" });
    return;
  }

  const body = UpdateVehicleSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const updateData: Partial<typeof rentalVehiclesTable.$inferInsert> = {
    ...body.data,
    updatedAt: new Date(),
  };

  if (body.data.slug) {
    updateData.slug = await ensureUniqueSlug(body.data.slug, id);
  } else if (body.data.publicTitle && !body.data.slug) {
  }

  const [vehicle] = await db
    .update(rentalVehiclesTable)
    .set(updateData)
    .where(and(eq(rentalVehiclesTable.id, id), isNull(rentalVehiclesTable.deletedAt)))
    .returning();

  if (!vehicle) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }
  await logRentalAudit({ adminUser: ((req.session as { admin?: { username?: string } }).admin?.username) ?? "admin", action: body.data.status ? "vehicle_status_updated" : "vehicle_updated", recordType: "vehicle", recordId: id, newValue: { status: vehicle.status, title: vehicle.publicTitle } });

  const images = await db
    .select()
    .from(rentalVehicleImagesTable)
    .where(eq(rentalVehicleImagesTable.vehicleId, vehicle.id))
    .orderBy(asc(rentalVehicleImagesTable.sortOrder));

  res.json(serializeVehicle({ ...vehicle, images }));
});

router.get("/admin/rental/vehicles/:id", requireAdminAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid vehicle ID" });
    return;
  }

  const [vehicle] = await db
    .select()
    .from(rentalVehiclesTable)
    .where(and(eq(rentalVehiclesTable.id, id), isNull(rentalVehiclesTable.deletedAt)));

  if (!vehicle) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }

  const images = await db
    .select()
    .from(rentalVehicleImagesTable)
    .where(eq(rentalVehicleImagesTable.vehicleId, vehicle.id))
    .orderBy(asc(rentalVehicleImagesTable.sortOrder));

  const [pricing] = await db
    .select()
    .from(rentalVehiclePricingTable)
    .where(eq(rentalVehiclePricingTable.vehicleId, vehicle.id));

  res.json({ ...serializeVehicle({ ...vehicle, images }), pricing: pricing ?? null });
});

router.get("/admin/rental/vehicles/:id/pricing", requireAdminAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid vehicle ID" });
    return;
  }

  const [pricing] = await db
    .select()
    .from(rentalVehiclePricingTable)
    .where(eq(rentalVehiclePricingTable.vehicleId, id));

  if (!pricing) {
    res.status(404).json({ error: "Pricing not found" });
    return;
  }

  res.json(pricing);
});

const UpdatePricingSchema = z.object({
  basePrice: z.coerce.number().optional(),
  weekendPrice: z.coerce.number().nullable().optional(),
  holidayPrice: z.coerce.number().nullable().optional(),
  highSeasonPrice: z.coerce.number().nullable().optional(),
  winterSeasonPrice: z.coerce.number().nullable().optional(),
  weeklyDiscountPct: z.coerce.number().optional(),
  monthlyDiscountPct: z.coerce.number().optional(),
  minDays: z.coerce.number().int().optional(),
  maxDays: z.coerce.number().int().nullable().optional(),
  cleaningFee: z.coerce.number().optional(),
  deliveryFee: z.coerce.number().optional(),
  lateReturnFee: z.coerce.number().optional(),
  extraMileageFee: z.coerce.number().optional(),
  securityDeposit: z.coerce.number().optional(),
  taxIncluded: z.boolean().optional(),
  taxRate: z.coerce.number().optional(),
  airportPickupFee: z.coerce.number().optional(),
  airportDropoffFee: z.coerce.number().optional(),
  manualPriceOverride: z.boolean().optional(),
  manualPriceValue: z.coerce.number().nullable().optional(),
});

router.put("/admin/rental/vehicles/:id/pricing", requireAdminAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid vehicle ID" });
    return;
  }

  const body = UpdatePricingSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const existing = await db
    .select()
    .from(rentalVehiclePricingTable)
    .where(eq(rentalVehiclePricingTable.vehicleId, id));

  let pricing;
  if (existing.length === 0) {
    [pricing] = await db
      .insert(rentalVehiclePricingTable)
      .values({ vehicleId: id, ...body.data })
      .returning();
  } else {
    [pricing] = await db
      .update(rentalVehiclePricingTable)
      .set({ ...body.data, updatedAt: new Date() })
      .where(eq(rentalVehiclePricingTable.vehicleId, id))
      .returning();
  }

  if (!pricing) {
    res.status(404).json({ error: "Pricing not found" });
    return;
  }

  res.json(pricing);
});

router.delete("/admin/rental/vehicles/:id", requireAdminAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid vehicle ID" });
    return;
  }

  const [vehicle] = await db
    .update(rentalVehiclesTable)
    .set({ status: "archived", updatedAt: new Date() })
    .where(and(eq(rentalVehiclesTable.id, id), isNull(rentalVehiclesTable.deletedAt)))
    .returning();

  if (!vehicle) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }
  await logRentalAudit({ adminUser: ((req.session as { admin?: { username?: string } }).admin?.username) ?? "admin", action: "vehicle_archived", recordType: "vehicle", recordId: id, newValue: { status: vehicle.status } });

  res.json({ message: "Vehicle deleted successfully" });
});

router.post("/admin/rental/vehicles/:id/duplicate", requireAdminAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid vehicle ID" });
    return;
  }

  const [original] = await db
    .select()
    .from(rentalVehiclesTable)
    .where(and(eq(rentalVehiclesTable.id, id), isNull(rentalVehiclesTable.deletedAt)));

  if (!original) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }

  const baseSlug = `${original.slug}-copy`;
  const newSlug = await ensureUniqueSlug(baseSlug);
  const newTitle = `${original.publicTitle} (Copy)`;

  const { id: _id, createdAt: _ca, updatedAt: _ua, deletedAt: _da, ...rest } = original;

  const [duplicate] = await db
    .insert(rentalVehiclesTable)
    .values({ ...rest, publicTitle: newTitle, slug: newSlug, status: "draft" })
    .returning();

  const [originalPricing] = await db
    .select()
    .from(rentalVehiclePricingTable)
    .where(eq(rentalVehiclePricingTable.vehicleId, id));

  if (originalPricing) {
    const { id: _pid, vehicleId: _vid, updatedAt: _pua, ...pricingRest } = originalPricing;
    await db.insert(rentalVehiclePricingTable).values({ ...pricingRest, vehicleId: duplicate.id });
  } else {
    await db.insert(rentalVehiclePricingTable).values({ vehicleId: duplicate.id });
  }

  const originalImages = await db
    .select()
    .from(rentalVehicleImagesTable)
    .where(eq(rentalVehicleImagesTable.vehicleId, id))
    .orderBy(asc(rentalVehicleImagesTable.sortOrder));

  const duplicateImages = [];
  for (const img of originalImages) {
    const { id: _iid, vehicleId: _ivid, createdAt: _ica, ...imgRest } = img;
    const [newImg] = await db
      .insert(rentalVehicleImagesTable)
      .values({ ...imgRest, vehicleId: duplicate.id })
      .returning();
    duplicateImages.push(newImg);
  }

  res.status(201).json(serializeVehicle({ ...duplicate, images: duplicateImages }));
});

router.post("/admin/rental/vehicles/:id/images", requireAdminAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid vehicle ID" });
    return;
  }

  const body = z.object({
    url: z.string().url(),
    caption: z.string().optional(),
    isCover: z.boolean().optional(),
  }).safeParse(req.body);

  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const existingImages = await db
    .select()
    .from(rentalVehicleImagesTable)
    .where(eq(rentalVehicleImagesTable.vehicleId, id))
    .orderBy(desc(rentalVehicleImagesTable.sortOrder));

  const nextSortOrder = existingImages.length > 0 ? (existingImages[0].sortOrder + 1) : 0;

  if (body.data.isCover) {
    await db
      .update(rentalVehicleImagesTable)
      .set({ isCover: false })
      .where(eq(rentalVehicleImagesTable.vehicleId, id));
  }

  const [image] = await db
    .insert(rentalVehicleImagesTable)
    .values({
      vehicleId: id,
      url: body.data.url,
      caption: body.data.caption,
      sortOrder: nextSortOrder,
      isCover: body.data.isCover ?? existingImages.length === 0,
    })
    .returning();

  res.status(201).json({ ...image, createdAt: image.createdAt.toISOString() });
});

router.put("/admin/rental/vehicles/:id/images/reorder", requireAdminAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid vehicle ID" });
    return;
  }

  const body = z.object({ orderedIds: z.array(z.number()) }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  for (let i = 0; i < body.data.orderedIds.length; i++) {
    await db
      .update(rentalVehicleImagesTable)
      .set({ sortOrder: i })
      .where(
        and(
          eq(rentalVehicleImagesTable.id, body.data.orderedIds[i]),
          eq(rentalVehicleImagesTable.vehicleId, id),
        ),
      );
  }

  res.json({ message: "Images reordered" });
});

router.patch("/admin/rental/vehicles/:id/images/:imgId", requireAdminAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const rawImgId = Array.isArray(req.params.imgId) ? req.params.imgId[0] : req.params.imgId;
  const id = parseInt(rawId, 10);
  const imgId = parseInt(rawImgId, 10);

  if (isNaN(id) || isNaN(imgId)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const body = z.object({ caption: z.string().optional() }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [updated] = await db
    .update(rentalVehicleImagesTable)
    .set({ ...(body.data.caption !== undefined ? { caption: body.data.caption } : {}) })
    .where(
      and(
        eq(rentalVehicleImagesTable.id, imgId),
        eq(rentalVehicleImagesTable.vehicleId, id),
      ),
    )
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Image not found" });
    return;
  }

  res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
});

router.delete("/admin/rental/vehicles/:id/images/:imgId", requireAdminAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const rawImgId = Array.isArray(req.params.imgId) ? req.params.imgId[0] : req.params.imgId;
  const id = parseInt(rawId, 10);
  const imgId = parseInt(rawImgId, 10);

  if (isNaN(id) || isNaN(imgId)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [deleted] = await db
    .delete(rentalVehicleImagesTable)
    .where(
      and(
        eq(rentalVehicleImagesTable.id, imgId),
        eq(rentalVehicleImagesTable.vehicleId, id),
      ),
    )
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Image not found" });
    return;
  }

  res.json({ message: "Image deleted" });
});

router.put("/admin/rental/vehicles/:id/images/:imgId/cover", requireAdminAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const rawImgId = Array.isArray(req.params.imgId) ? req.params.imgId[0] : req.params.imgId;
  const id = parseInt(rawId, 10);
  const imgId = parseInt(rawImgId, 10);

  if (isNaN(id) || isNaN(imgId)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  await db
    .update(rentalVehicleImagesTable)
    .set({ isCover: false })
    .where(eq(rentalVehicleImagesTable.vehicleId, id));

  const [updated] = await db
    .update(rentalVehicleImagesTable)
    .set({ isCover: true })
    .where(
      and(
        eq(rentalVehicleImagesTable.id, imgId),
        eq(rentalVehicleImagesTable.vehicleId, id),
      ),
    )
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Image not found" });
    return;
  }

  res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
});

export default router;
