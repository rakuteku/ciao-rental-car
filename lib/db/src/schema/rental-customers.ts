import {
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const rentalCustomerAccountsTable = pgTable(
  "rental_customer_accounts",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name").notNull(),
    phone: text("phone"),
    preferredLanguage: text("preferred_language").notNull().default("en"),
    status: text("status").notNull().default("active"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("rental_customer_accounts_email_unique").on(table.email)],
);

export const insertRentalCustomerAccountSchema = createInsertSchema(rentalCustomerAccountsTable).omit({
  id: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRentalCustomerAccount = z.infer<typeof insertRentalCustomerAccountSchema>;
export type RentalCustomerAccount = typeof rentalCustomerAccountsTable.$inferSelect;
