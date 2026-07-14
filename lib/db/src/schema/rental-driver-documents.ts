import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  index,
  date,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { rentalDocTypeEnum, rentalDocStatusEnum, rentalDriversTable } from "./rental-drivers";
import { rentalReservationsTable } from "./rental-reservations";

export const rentalDriverDocumentsTable = pgTable(
  "rental_driver_documents",
  {
    id: serial("id").primaryKey(),
    driverId: integer("driver_id")
      .notNull()
      .references(() => rentalDriversTable.id, { onDelete: "cascade" }),
    reservationId: integer("reservation_id")
      .references(() => rentalReservationsTable.id, { onDelete: "set null" }),
    docType: rentalDocTypeEnum("doc_type").notNull(),
    fileUrl: text("file_url"),
    status: rentalDocStatusEnum("status").notNull().default("pending"),
    expiryDate: date("expiry_date", { mode: "string" }),
    adminNotes: text("admin_notes"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("rental_driver_docs_driver_idx").on(table.driverId),
    index("rental_driver_docs_reservation_idx").on(table.reservationId),
  ],
);

export const insertRentalDriverDocumentSchema = createInsertSchema(rentalDriverDocumentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertRentalDriverDocument = z.infer<typeof insertRentalDriverDocumentSchema>;
export type RentalDriverDocument = typeof rentalDriverDocumentsTable.$inferSelect;
