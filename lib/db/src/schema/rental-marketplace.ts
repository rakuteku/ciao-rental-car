import {
  pgEnum,
  pgTable,
  serial,
  integer,
  text,
  boolean,
  jsonb,
  timestamp,
  index,
  unique,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const rentalOperatorStatusEnum = pgEnum("rental_operator_status", [
  "active",
  "pending",
  "suspended",
  "closed",
]);

export const rentalOperatorStaffRoleEnum = pgEnum("rental_operator_staff_role", [
  "owner",
  "manager",
  "counter",
  "operations",
]);

export const rentalOperatorStaffStatusEnum = pgEnum("rental_operator_staff_status", [
  "invited",
  "active",
  "suspended",
  "removed",
]);

export const rentalOperatorVerificationStatusEnum = pgEnum(
  "rental_operator_verification_status",
  ["draft", "submitted", "under_review", "approved", "rejected", "needs_information"],
);

export const rentalOperatorDocumentStatusEnum = pgEnum("rental_operator_document_status", [
  "uploaded",
  "under_review",
  "accepted",
  "rejected",
  "expired",
]);

export const rentalOperatorsTable = pgTable(
  "rental_operators",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    status: rentalOperatorStatusEnum("status").notNull().default("pending"),
    verificationStatus: rentalOperatorVerificationStatusEnum("verification_status")
      .notNull()
      .default("draft"),
    isPlatform: boolean("is_platform").notNull().default(false),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    address: text("address"),
    businessDetails: jsonb("business_details").$type<Record<string, unknown>>().notNull().default({}),
    insuranceExpiresAt: timestamp("insurance_expires_at", { withTimezone: true }),
    permissionExpiresAt: timestamp("permission_expires_at", { withTimezone: true }),
    payoutStatus: text("payout_status").notNull().default("unverified"),
    payoutExpiresAt: timestamp("payout_expires_at", { withTimezone: true }),
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("rental_operators_slug_unique").on(table.slug),
    uniqueIndex("rental_operators_platform_unique")
      .on(table.isPlatform)
      .where(sql`${table.isPlatform} = true`),
    index("rental_operators_status_idx").on(table.status),
  ],
);

export const rentalOperatorStaffTable = pgTable(
  "rental_operator_staff",
  {
    id: serial("id").primaryKey(),
    operatorId: integer("operator_id")
      .notNull()
      .references(() => rentalOperatorsTable.id, { onDelete: "cascade" }),
    // Identity provider subject, deliberately not coupled to an application user table.
    identitySubject: text("identity_subject").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name"),
    role: rentalOperatorStaffRoleEnum("role").notNull().default("counter"),
    status: rentalOperatorStaffStatusEnum("status").notNull().default("invited"),
    active: boolean("active").notNull().default(false),
    invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("rental_operator_staff_identity_unique").on(table.operatorId, table.identitySubject),
    check(
      "rental_operator_staff_active_status_check",
      sql`${table.active} = (${table.status} = 'active')`,
    ),
    index("rental_operator_staff_operator_idx").on(table.operatorId),
    index("rental_operator_staff_subject_idx").on(table.identitySubject),
  ],
);

export const rentalOperatorVerificationsTable = pgTable(
  "rental_operator_verifications",
  {
    id: serial("id").primaryKey(),
    operatorId: integer("operator_id")
      .notNull()
      .references(() => rentalOperatorsTable.id, { onDelete: "cascade" }),
    verificationType: text("verification_type").notNull(),
    status: rentalOperatorVerificationStatusEnum("status").notNull().default("draft"),
    submittedByStaffId: integer("submitted_by_staff_id").references(
      () => rentalOperatorStaffTable.id,
      { onDelete: "set null" },
    ),
    reviewedBy: text("reviewed_by"),
    reviewNotes: text("review_notes"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("rental_operator_verifications_operator_idx").on(table.operatorId),
    index("rental_operator_verifications_status_idx").on(table.status),
  ],
);

export const rentalOperatorDocumentsTable = pgTable(
  "rental_operator_documents",
  {
    id: serial("id").primaryKey(),
    operatorId: integer("operator_id")
      .notNull()
      .references(() => rentalOperatorsTable.id, { onDelete: "cascade" }),
    verificationId: integer("verification_id").references(
      () => rentalOperatorVerificationsTable.id,
      { onDelete: "set null" },
    ),
    uploadedByStaffId: integer("uploaded_by_staff_id").references(
      () => rentalOperatorStaffTable.id,
      { onDelete: "set null" },
    ),
    documentType: text("document_type").notNull(),
    storageKey: text("storage_key").notNull(),
    originalFileName: text("original_file_name"),
    contentType: text("content_type"),
    status: rentalOperatorDocumentStatusEnum("status").notNull().default("uploaded"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("rental_operator_documents_operator_idx").on(table.operatorId),
    index("rental_operator_documents_verification_idx").on(table.verificationId),
  ],
);

export const insertRentalOperatorSchema = createInsertSchema(rentalOperatorsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertRentalOperator = z.infer<typeof insertRentalOperatorSchema>;
export type RentalOperator = typeof rentalOperatorsTable.$inferSelect;

export const insertRentalOperatorStaffSchema = createInsertSchema(rentalOperatorStaffTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertRentalOperatorStaff = z.infer<typeof insertRentalOperatorStaffSchema>;
export type RentalOperatorStaff = typeof rentalOperatorStaffTable.$inferSelect;

export const insertRentalOperatorVerificationSchema = createInsertSchema(
  rentalOperatorVerificationsTable,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertRentalOperatorVerification = z.infer<
  typeof insertRentalOperatorVerificationSchema
>;
export type RentalOperatorVerification = typeof rentalOperatorVerificationsTable.$inferSelect;

export const insertRentalOperatorDocumentSchema = createInsertSchema(
  rentalOperatorDocumentsTable,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertRentalOperatorDocument = z.infer<typeof insertRentalOperatorDocumentSchema>;
export type RentalOperatorDocument = typeof rentalOperatorDocumentsTable.$inferSelect;