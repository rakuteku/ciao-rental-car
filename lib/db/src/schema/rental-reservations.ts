import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  real,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { rentalVehiclesTable } from "./rental-vehicles";
import { rentalDriversTable } from "./rental-drivers";

export const rentalReservationStatusEnum = pgEnum("rental_reservation_status", [
  "inquiry",
  "quote_sent",
  "pending_payment",
  "payment_failed",
  "confirmed",
  "driver_documents_pending",
  "driver_documents_under_review",
  "driver_documents_rejected",
  "awaiting_pickup",
  "vehicle_dispatched",
  "in_rental",
  "overdue",
  "return_initiated",
  "return_completed",
  "inspection_pending",
  "damage_assessed",
  "deposit_refunded",
  "cancelled",
  "refunded",
]);

export const rentalPaymentStatusEnum = pgEnum("rental_payment_status", [
  "pending",
  "authorized",
  "partial_paid",
  "paid",
  "refund_pending",
  "partially_refunded",
  "refunded",
  "chargeback",
  "disputed",
  "void",
]);

export const rentalReservationsTable = pgTable(
  "rental_reservations",
  {
    id: serial("id").primaryKey(),
    vehicleId: integer("vehicle_id")
      .notNull()
      .references(() => rentalVehiclesTable.id),
    primaryDriverId: integer("primary_driver_id")
      .references(() => rentalDriversTable.id),
    pickupAt: timestamp("pickup_at", { withTimezone: true }).notNull(),
    returnAt: timestamp("return_at", { withTimezone: true }).notNull(),
    pickupLocation: text("pickup_location").notNull(),
    returnLocation: text("return_location").notNull(),
    status: rentalReservationStatusEnum("status").notNull().default("inquiry"),
    paymentStatus: rentalPaymentStatusEnum("payment_status").notNull().default("pending"),
    subtotal: real("subtotal").notNull().default(0),
    addonsTotal: real("addons_total").notNull().default(0),
    deliveryFee: real("delivery_fee").notNull().default(0),
    discount: real("discount").notNull().default(0),
    tax: real("tax").notNull().default(0),
    securityDeposit: real("security_deposit").notNull().default(0),
    paidAmount: real("paid_amount").notNull().default(0),
    outstanding: real("outstanding").notNull().default(0),
    refundAmount: real("refund_amount").notNull().default(0),
    finalTotal: real("final_total").notNull().default(0),
    source: text("source").notNull().default("website"),
    customerAccessToken: text("customer_access_token"),
    internalNotes: text("internal_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("rental_reservations_vehicle_idx").on(table.vehicleId),
    index("rental_reservations_status_idx").on(table.status),
    index("rental_reservations_pickup_idx").on(table.pickupAt),
    index("rental_reservations_range_idx").on(table.pickupAt, table.returnAt),
  ],
);

export const insertRentalReservationSchema = createInsertSchema(rentalReservationsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});
export type InsertRentalReservation = z.infer<typeof insertRentalReservationSchema>;
export type RentalReservation = typeof rentalReservationsTable.$inferSelect;

export const rentalReservationHoldsTable = pgTable(
  "rental_reservation_holds",
  {
    id: serial("id").primaryKey(),
    vehicleId: integer("vehicle_id")
      .notNull()
      .references(() => rentalVehiclesTable.id, { onDelete: "cascade" }),
    reservationId: integer("reservation_id")
      .references(() => rentalReservationsTable.id, { onDelete: "cascade" }),
    pickupAt: timestamp("pickup_at", { withTimezone: true }).notNull(),
    returnAt: timestamp("return_at", { withTimezone: true }).notNull(),
    heldUntil: timestamp("held_until", { withTimezone: true }).notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    sessionToken: text("session_token"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("rental_holds_vehicle_idx").on(table.vehicleId),
    index("rental_holds_held_until_idx").on(table.heldUntil),
  ],
);

export const insertRentalReservationHoldSchema = createInsertSchema(rentalReservationHoldsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertRentalReservationHold = z.infer<typeof insertRentalReservationHoldSchema>;
export type RentalReservationHold = typeof rentalReservationHoldsTable.$inferSelect;
