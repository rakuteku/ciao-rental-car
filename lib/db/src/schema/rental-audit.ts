import {
  pgTable,
  serial,
  text,
  integer,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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
    deliveryStatus: text("delivery_status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    deliveryLeaseUntil: timestamp("delivery_lease_until", { withTimezone: true }),
    dataSubmittedAt: timestamp("data_submitted_at", { withTimezone: true }),
    dedupeKey: text("dedupe_key"),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("rental_notifications_event_idx").on(table.eventType),
    index("rental_notifications_email_idx").on(table.email),
    index("rental_notifications_delivery_idx").on(table.deliveryStatus, table.nextAttemptAt),
    index("rental_notifications_delivery_lease_idx").on(table.deliveryStatus, table.deliveryLeaseUntil),
    uniqueIndex("rental_notifications_dedupe_unique").on(table.dedupeKey),
    check(
      "rental_notifications_delivery_status_check",
      sql`${table.deliveryStatus} IN ('pending', 'unconfigured', 'failed', 'sent')`,
    ),
    check("rental_notifications_attempt_count_check", sql`${table.attemptCount} >= 0`),
  ],
);

export const insertRentalNotificationSchema = createInsertSchema(rentalNotificationsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertRentalNotification = z.infer<typeof insertRentalNotificationSchema>;
export type RentalNotification = typeof rentalNotificationsTable.$inferSelect;
