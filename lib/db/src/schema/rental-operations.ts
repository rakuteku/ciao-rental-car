import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  real,
  jsonb,
  boolean,
  timestamp,
  index,
  date,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { rentalVehiclesTable } from "./rental-vehicles";
import { rentalReservationsTable } from "./rental-reservations";
import { rentalDriversTable } from "./rental-drivers";

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
    agreementAccepted: boolean("agreement_accepted").notNull().default(false),
    signatureReference: text("signature_reference"),
    vehicleIdentity: text("vehicle_identity"),
    actualAt: timestamp("actual_at", { withTimezone: true }),
    location: text("location"),
    equipment: jsonb("equipment").$type<string[]>().notNull().default([]),
    discrepancies: jsonb("discrepancies").$type<Array<Record<string, unknown>>>().notNull().default([]),
    retentionUntil: timestamp("retention_until", { withTimezone: true }),
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
    storageKey: text("storage_key"),
    retentionUntil: timestamp("retention_until", { withTimezone: true }),
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

/** Reservation-level authorization, distinct from submitted document metadata. */
export const rentalReservationDriversTable = pgTable(
  "rental_reservation_drivers",
  {
    id: serial("id").primaryKey(),
    reservationId: integer("reservation_id").notNull()
      .references(() => rentalReservationsTable.id, { onDelete: "cascade" }),
    driverId: integer("driver_id").notNull()
      .references(() => rentalDriversTable.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(false),
    originalsVerifiedAt: timestamp("originals_verified_at", { withTimezone: true }),
    originalsVerifiedBy: text("originals_verified_by"),
    originalLicenseVerifiedAt: timestamp("original_license_verified_at", { withTimezone: true }),
    originalIdentityVerifiedAt: timestamp("original_identity_verified_at", { withTimezone: true }),
    originalInternationalPermitVerifiedAt: timestamp("original_international_permit_verified_at", { withTimezone: true }),
    originalsEvidence: jsonb("originals_evidence").$type<Record<string, string>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("rental_reservation_drivers_unique").on(table.reservationId, table.driverId),
    index("rental_reservation_drivers_reservation_idx").on(table.reservationId),
  ],
);

// Kept as an independent table so evidence access can be audited without putting
// mutable counters or sensitive object URLs on the immutable inspection record.
export const rentalInspectionAccessTable = pgTable("rental_inspection_access", {
  id: serial("id").primaryKey(),
  inspectionId: integer("inspection_id").notNull()
    .references(() => rentalInspectionsTable.id, { onDelete: "cascade" }),
  actorType: text("actor_type").notNull(),
  actorId: text("actor_id").notNull(),
  accessedAt: timestamp("accessed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("rental_inspection_access_inspection_idx").on(table.inspectionId)]);

export const rentalTripLedgerTable = pgTable("rental_trip_ledger", {
  id: serial("id").primaryKey(),
  reservationId: integer("reservation_id").notNull()
    .references(() => rentalReservationsTable.id, { onDelete: "cascade" }),
  operatorId: integer("operator_id").notNull(),
  entryType: text("entry_type").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull().default("jpy"),
  status: text("status").notNull().default("posted"),
  description: text("description").notNull(),
  savedTerms: jsonb("saved_terms").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("rental_trip_ledger_reservation_idx").on(table.reservationId),
  index("rental_trip_ledger_operator_idx").on(table.operatorId),
]);

export const rentalTripUploadsTable = pgTable("rental_trip_uploads", {
  token: text("token").primaryKey(),
  reservationId: integer("reservation_id").notNull()
    .references(() => rentalReservationsTable.id, { onDelete: "cascade" }),
  operatorId: integer("operator_id").notNull(),
  contentType: text("content_type").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [index("rental_trip_uploads_reservation_idx").on(table.reservationId)]);

export const rentalTripChargeApprovalsTable = pgTable("rental_trip_charge_approvals", {
  id: serial("id").primaryKey(),
  reservationId: integer("reservation_id").notNull()
    .references(() => rentalReservationsTable.id, { onDelete: "cascade" }),
  customerDriverId: integer("customer_driver_id").notNull()
    .references(() => rentalDriversTable.id),
  code: text("code").notNull(),
  amount: integer("amount").notNull(),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("rental_trip_charge_approvals_unique").on(table.reservationId, table.code),
  index("rental_trip_charge_approvals_reservation_idx").on(table.reservationId),
]);

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
