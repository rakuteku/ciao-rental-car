import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { rentalVehiclesTable } from "./rental-vehicles";

export const rentalBlockReasonEnum = pgEnum("rental_block_reason", [
  "maintenance",
  "cleaning",
  "buffer",
  "manual",
  "reservation",
  "holiday",
  "inspection",
  "other",
]);

export const rentalAvailabilityBlocksTable = pgTable(
  "rental_availability_blocks",
  {
    id: serial("id").primaryKey(),
    vehicleId: integer("vehicle_id")
      .notNull()
      .references(() => rentalVehiclesTable.id, { onDelete: "cascade" }),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    reason: rentalBlockReasonEnum("reason").notNull().default("manual"),
    notes: text("notes"),
    isRecurring: boolean("is_recurring").notNull().default(false),
    recurrenceRule: text("recurrence_rule"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("rental_blocks_vehicle_idx").on(table.vehicleId),
    index("rental_blocks_range_idx").on(table.startAt, table.endAt),
  ],
);

export const insertRentalAvailabilityBlockSchema = createInsertSchema(rentalAvailabilityBlocksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertRentalAvailabilityBlock = z.infer<typeof insertRentalAvailabilityBlockSchema>;
export type RentalAvailabilityBlock = typeof rentalAvailabilityBlocksTable.$inferSelect;

export const rentalSettingsTable = pgTable(
  "rental_settings",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    description: text("description"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("rental_settings_key_unique").on(table.key),
  ],
);

export const insertRentalSettingSchema = createInsertSchema(rentalSettingsTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertRentalSetting = z.infer<typeof insertRentalSettingSchema>;
export type RentalSetting = typeof rentalSettingsTable.$inferSelect;
