import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  timestamp,
  index,
  date,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const rentalDocTypeEnum = pgEnum("rental_doc_type", [
  "drivers_license",
  "passport",
  "international_license",
  "insurance",
  "credit_card",
  "other",
]);

export const rentalDocStatusEnum = pgEnum("rental_doc_status", [
  "pending",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "expired",
  "resubmit_required",
]);

export const rentalDriversTable = pgTable(
  "rental_drivers",
  {
    id: serial("id").primaryKey(),
    fullName: text("full_name").notNull(),
    romanizedName: text("romanized_name"),
    dob: date("dob", { mode: "string" }),
    nationality: text("nationality"),
    country: text("country"),
    address: text("address"),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    emergencyContact: text("emergency_contact"),
    flightNumber: text("flight_number"),
    accommodation: text("accommodation"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("rental_drivers_email_idx").on(table.email),
  ],
);

export const insertRentalDriverSchema = createInsertSchema(rentalDriversTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertRentalDriver = z.infer<typeof insertRentalDriverSchema>;
export type RentalDriver = typeof rentalDriversTable.$inferSelect;
