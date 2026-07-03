import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, roomsTable, type Room } from "@workspace/db";
import {
  GetRoomsQueryParams,
  GetRoomParams,
  CreateAdminRoomBody,
  UpdateAdminRoomParams,
  UpdateAdminRoomBody,
  ReorderAdminRoomsBody,
} from "@workspace/api-zod";
import { requireAdminAuth } from "../middlewares/admin-auth";

const router: IRouter = Router();

function serializeRoom(room: Room) {
  return {
    ...room,
    createdAt: room.createdAt.toISOString(),
    updatedAt: room.updatedAt.toISOString(),
  };
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "room";
}

async function ensureUniqueSlug(baseSlug: string, excludeId?: number): Promise<string> {
  let candidate = baseSlug;
  let suffix = 2;
  while (true) {
    const existing = await db.select().from(roomsTable).where(eq(roomsTable.slug, candidate));
    const conflict = existing.find((row) => row.id !== excludeId);
    if (!conflict) {
      return candidate;
    }
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

router.get("/rooms", async (req, res): Promise<void> => {
  const query = GetRoomsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const rows = await db.select().from(roomsTable).where(eq(roomsTable.published, true)).orderBy(asc(roomsTable.sortOrder));
  const filtered = query.data.featured ? rows.filter((r) => r.featured) : rows;
  res.json(filtered.map(serializeRoom));
});

router.get("/rooms/:slug", async (req, res): Promise<void> => {
  const params = GetRoomParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [room] = await db.select().from(roomsTable).where(eq(roomsTable.slug, params.data.slug));
  if (!room || !room.published) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  res.json(serializeRoom(room));
});

router.get("/admin/rooms", requireAdminAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(roomsTable).orderBy(asc(roomsTable.sortOrder));
  res.json(rows.map(serializeRoom));
});

router.post("/admin/rooms", requireAdminAuth, async (req, res): Promise<void> => {
  const body = CreateAdminRoomBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const data = body.data;
  const baseSlug = slugify(data.slug && data.slug.trim() ? data.slug : data.title);
  const slug = await ensureUniqueSlug(baseSlug);

  const allRooms = await db.select({ sortOrder: roomsTable.sortOrder }).from(roomsTable);
  const nextSortOrder = allRooms.length > 0 ? Math.max(...allRooms.map((r) => r.sortOrder)) + 1 : 0;

  const coverImage = data.coverImage || data.images?.[0] || "";
  const metaTitle = data.metaTitle || `${data.title} | CIAO Sapporo Lodging`;
  const metaDescription = data.metaDescription || truncate(data.description || `${data.title} — short-term lodging in Sapporo.`, 155);
  const ogTitle = data.ogTitle || metaTitle;
  const ogDescription = data.ogDescription || metaDescription;
  const ogImage = data.ogImage || coverImage;

  const [created] = await db
    .insert(roomsTable)
    .values({
      slug,
      title: data.title,
      roomType: data.roomType ?? "Studio",
      maxGuests: data.maxGuests ?? 2,
      beds: data.beds ?? 1,
      size: data.size ?? "",
      floor: data.floor ?? "",
      description: data.description ?? "",
      startingPrice: data.startingPrice ?? 0,
      amenities: data.amenities ?? [],
      images: data.images ?? [],
      coverImage,
      houseRules: data.houseRules ?? "",
      checkInTime: data.checkInTime ?? "15:00",
      checkOutTime: data.checkOutTime ?? "10:00",
      featured: data.featured ?? false,
      published: data.published ?? true,
      sortOrder: nextSortOrder,
      metaTitle,
      metaDescription,
      ogTitle,
      ogDescription,
      ogImage,
    })
    .returning();

  res.status(201).json(serializeRoom(created));
});

router.put("/admin/rooms/reorder", requireAdminAuth, async (req, res): Promise<void> => {
  const body = ReorderAdminRoomsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  await Promise.all(
    body.data.orderedIds.map((id, index) => db.update(roomsTable).set({ sortOrder: index }).where(eq(roomsTable.id, id))),
  );

  res.json({ message: "Reordered" });
});

router.put("/admin/rooms/:id", requireAdminAuth, async (req, res): Promise<void> => {
  const params = UpdateAdminRoomParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db.select().from(roomsTable).where(eq(roomsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  const body = UpdateAdminRoomBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const data = body.data;
  let slug = existing.slug;
  if (data.slug && data.slug.trim() && slugify(data.slug) !== existing.slug) {
    slug = await ensureUniqueSlug(slugify(data.slug), existing.id);
  }

  const title = data.title ?? existing.title;
  const description = data.description ?? existing.description;
  const images = data.images ?? existing.images;
  const coverImage = data.coverImage || existing.coverImage || images[0] || "";
  const metaTitle = data.metaTitle || existing.metaTitle || `${title} | CIAO Sapporo Lodging`;
  const metaDescription = data.metaDescription || existing.metaDescription || truncate(description, 155);
  const ogTitle = data.ogTitle || existing.ogTitle || metaTitle;
  const ogDescription = data.ogDescription || existing.ogDescription || metaDescription;
  const ogImage = data.ogImage || existing.ogImage || coverImage;

  const [updated] = await db
    .update(roomsTable)
    .set({
      slug,
      title,
      roomType: data.roomType ?? existing.roomType,
      maxGuests: data.maxGuests ?? existing.maxGuests,
      beds: data.beds ?? existing.beds,
      size: data.size ?? existing.size,
      floor: data.floor ?? existing.floor,
      description,
      startingPrice: data.startingPrice ?? existing.startingPrice,
      amenities: data.amenities ?? existing.amenities,
      images,
      coverImage,
      houseRules: data.houseRules ?? existing.houseRules,
      checkInTime: data.checkInTime ?? existing.checkInTime,
      checkOutTime: data.checkOutTime ?? existing.checkOutTime,
      featured: data.featured ?? existing.featured,
      published: data.published ?? existing.published,
      metaTitle,
      metaDescription,
      ogTitle,
      ogDescription,
      ogImage,
      updatedAt: new Date(),
    })
    .where(eq(roomsTable.id, params.data.id))
    .returning();

  res.json(serializeRoom(updated));
});

router.delete("/admin/rooms/:id", requireAdminAuth, async (req, res): Promise<void> => {
  const params = UpdateAdminRoomParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db.delete(roomsTable).where(eq(roomsTable.id, params.data.id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  res.json({ message: "Room deleted" });
});

export default router;
