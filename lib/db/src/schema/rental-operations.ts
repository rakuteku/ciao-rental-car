import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  real,
  jsonb,
  timestamp,
  index,
  date,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { rentalVehiclesTable } from "./rental-vehicles";
import { rentalReservationsTable } from "./rental-reservations";

export const rentalInspectionTypeEnum = pgEnum("rental_inspection_type", [
  "pickup",
  "return",
]);

export const rentalInspectionPhotoTypeEnum = pgEnum("rental_inspection_photo_type", [
  "exterior",
  "interior",
  "damage",
  "document",
]);

export const rentalMaintenanceStatusEnum = pgEnum("rental_maintenance_status", [
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
]);

export const rentalInspectionsTable = pgTable(
  "rental_inspections",
  {
    id: serial("id").primaryKey(),
    reservationId: integer("reservation_id")
      .notNull()
      .references(() => rentalReservationsTable.id, { onDelete: "cascade" }),
    type: rentalInspectionTypeEnum("type").notNull(),
    mileage: integer("mileage"),
    fuelLevel: text("fuel_level"),
    notes: text("notes"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: text("completed_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("rental_inspections_reservation_idx").on(table.reservationId),
  ],
);

export const insertRentalInspectionSchema = createInsertSchema(rentalInspectionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertRentalInspection = z.infer<typeof insertRentalInspectionSchema>;
export type RentalInspection = typeof rentalInspectionsTable.$inferSelect;

export const rentalInspectionPhotosTable = pgTable(
  "rental_inspection_photos",
  {
    id: serial("id").primaryKey(),
    inspectionId: integer("inspection_id")
      .notNull()
      .references(() => rentalInspectionsTable.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    type: rentalInspectionPhotoTypeEnum("type").notNull().default("exterior"),
    caption: text("caption"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("rental_inspection_photos_inspection_idx").on(table.inspectionId),
  ],
);

export const insertRentalInspectionPhotoSchema = createInsertSchema(rentalInspectionPhotosTable).omit({
  id: true,
  createdAt: true,
});
export type InsertRentalInspectionPhoto = z.infer<typeof insertRentalInspectionPhotoSchema>;
export type RentalInspectionPhoto = typeof rentalInspectionPhotosTable.$inferSelect;

export const rentalDamagesTable = pgTable(
  "rental_damages",
  {
    id: serial("id").primaryKey(),
    inspectionId: integer("inspection_id")
      .notNull()
      .references(() => rentalInspectionsTable.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    location: text("location"),
    estimatedCost: real("estimated_cost"),
    photos: jsonb("photos").$type<string[]>().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("rental_damages_inspection_idx").on(table.inspectionId),
  ],
);

export const insertRentalDamageSchema = createInsertSchema(rentalDamagesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertRentalDamage = z.infer<typeof insertRentalDamageSchema>;
export type RentalDamage = typeof rentalDamagesTable.$inferSelect;

export const rentalMaintenanceTable = pgTable(
  "rental_maintenance",
  {
    id: serial("id").primaryKey(),
    vehicleId: integer("vehicle_id")
      .notNull()
      .references(() => rentalVehiclesTable.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    description: text("description"),
    provider: text("provider"),
    scheduledDate: date("scheduled_date", { mode: "string" }),
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    mileage: integer("mileage"),
    cost: real("cost"),
    receiptUrl: text("receipt_url"),
    status: rentalMaintenanceStatusEnum("status").notNull().default("scheduled"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("rental_maintenance_vehicle_idx").on(table.vehicleId),
    index("rental_maintenance_status_idx").on(table.status),
  ],
);

export const insertRentalMaintenanceSchema = createInsertSchema(rentalMaintenanceTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertRentalMaintenance = z.infer<typeof insertRentalMaintenanceSchema>;
export type RentalMaintenance = typeof rentalMaintenanceTable.$inferSelect;
