import { pgTable, serial, text, integer, real, boolean, jsonb, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const roomsTable = pgTable(
  "rooms",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    roomType: text("room_type").notNull().default("Studio"),
    maxGuests: integer("max_guests").notNull().default(2),
    beds: integer("beds").notNull().default(1),
    size: text("size").notNull().default(""),
    floor: text("floor").notNull().default(""),
    description: text("description").notNull().default(""),
    startingPrice: real("starting_price").notNull().default(0),
    amenities: jsonb("amenities").notNull().$type<string[]>().default([]),
    images: jsonb("images").notNull().$type<string[]>().default([]),
    coverImage: text("cover_image").notNull().default(""),
    houseRules: text("house_rules").notNull().default(""),
    checkInTime: text("check_in_time").notNull().default("15:00"),
    checkOutTime: text("check_out_time").notNull().default("10:00"),
    featured: boolean("featured").notNull().default(false),
    published: boolean("published").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    metaTitle: text("meta_title").notNull().default(""),
    metaDescription: text("meta_description").notNull().default(""),
    ogTitle: text("og_title").notNull().default(""),
    ogDescription: text("og_description").notNull().default(""),
    ogImage: text("og_image").notNull().default(""),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [unique("rooms_slug_unique").on(table.slug)],
);

export const insertRoomSchema = createInsertSchema(roomsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRoom = z.infer<typeof insertRoomSchema>;
export type Room = typeof roomsTable.$inferSelect;
