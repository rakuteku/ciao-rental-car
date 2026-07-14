import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  real,
  boolean,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { rentalReservationsTable } from "./rental-reservations";

export const rentalAddonPricingTypeEnum = pgEnum("rental_addon_pricing_type", [
  "flat",
  "per_day",
  "per_unit",
]);

export const rentalAddonsTable = pgTable(
  "rental_addons",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    image: text("image"),
    pricingType: rentalAddonPricingTypeEnum("pricing_type").notNull().default("flat"),
    flatFee: real("flat_fee").notNull().default(0),
    perDayFee: real("per_day_fee").notNull().default(0),
    perUnitFee: real("per_unit_fee").notNull().default(0),
    maxQty: integer("max_qty").notNull().default(1),
    inventoryLimit: integer("inventory_limit"),
    vehicleCompatibility: jsonb("vehicle_compatibility").$type<string[]>().default([]),
    required: boolean("required").notNull().default(false),
    published: boolean("published").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("rental_addons_published_idx").on(table.published),
  ],
);

export const insertRentalAddonSchema = createInsertSchema(rentalAddonsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertRentalAddon = z.infer<typeof insertRentalAddonSchema>;
export type RentalAddon = typeof rentalAddonsTable.$inferSelect;

export const rentalReservationAddonsTable = pgTable(
  "rental_reservation_addons",
  {
    id: serial("id").primaryKey(),
    reservationId: integer("reservation_id")
      .notNull()
      .references(() => rentalReservationsTable.id, { onDelete: "cascade" }),
    addonId: integer("addon_id")
      .notNull()
      .references(() => rentalAddonsTable.id),
    qty: integer("qty").notNull().default(1),
    unitPrice: real("unit_price").notNull().default(0),
    totalPrice: real("total_price").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("rental_res_addons_reservation_idx").on(table.reservationId),
  ],
);

export const insertRentalReservationAddonSchema = createInsertSchema(rentalReservationAddonsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertRentalReservationAddon = z.infer<typeof insertRentalReservationAddonSchema>;
export type RentalReservationAddon = typeof rentalReservationAddonsTable.$inferSelect;
