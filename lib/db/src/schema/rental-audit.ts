import {
  pgTable,
  serial,
  text,
  integer,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const rentalAuditLogTable = pgTable(
  "rental_audit_log",
  {
    id: serial("id").primaryKey(),
    adminUser: text("admin_user"),
    action: text("action").notNull(),
    recordType: text("record_type").notNull(),
    recordId: integer("record_id"),
    previousValue: jsonb("previous_value").$type<Record<string, unknown>>(),
    newValue: jsonb("new_value").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("rental_audit_log_record_idx").on(table.recordType, table.recordId),
    index("rental_audit_log_created_idx").on(table.createdAt),
  ],
);

export const insertRentalAuditLogSchema = createInsertSchema(rentalAuditLogTable).omit({
  id: true,
  createdAt: true,
});
export type InsertRentalAuditLog = z.infer<typeof insertRentalAuditLogSchema>;
export type RentalAuditLog = typeof rentalAuditLogTable.$inferSelect;

export const rentalNotificationsTable = pgTable(
  "rental_notifications",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id"),
    email: text("email"),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
    channel: text("channel").notNull().default("email"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("rental_notifications_event_idx").on(table.eventType),
    index("rental_notifications_email_idx").on(table.email),
  ],
);

export const insertRentalNotificationSchema = createInsertSchema(rentalNotificationsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertRentalNotification = z.infer<typeof insertRentalNotificationSchema>;
export type RentalNotification = typeof rentalNotificationsTable.$inferSelect;
