import {
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
import { rentalReservationsTable } from "./rental-reservations";
import { rentalOperatorsTable } from "./rental-marketplace";
import { rentalInspectionsTable } from "./rental-operations";

export const rentalIncidentsTable = pgTable("rental_incidents", {
  id: serial("id").primaryKey(),
  reservationId: integer("reservation_id").notNull().references(() => rentalReservationsTable.id, { onDelete: "cascade" }),
  operatorId: integer("operator_id").notNull().references(() => rentalOperatorsTable.id),
  category: text("category").notNull(),
  severity: text("severity").notNull().default("medium"),
  status: text("status").notNull().default("open"),
  description: text("description").notNull(),
  unsafeVehicle: boolean("unsafe_vehicle").notNull().default(false),
  priorOperationalStatus: text("prior_operational_status"),
  location: text("location"),
  peopleInvolved: jsonb("people_involved").$type<Array<{ role: string; name?: string; contact?: string }>>().notNull().default([]),
  policeReported: boolean("police_reported").notNull().default(false),
  policeReference: text("police_reference"),
  roadsideDetails: text("roadside_details"),
  insurerReference: text("insurer_reference"),
  towDetails: text("tow_details"),
  replacementVehicleDetails: text("replacement_vehicle_details"),
  downtimeStart: timestamp("downtime_start", { withTimezone: true }),
  downtimeEnd: timestamp("downtime_end", { withTimezone: true }),
  nextBookingImpact: text("next_booking_impact"),
  customerUpdate: text("customer_update"),
  reportedByType: text("reported_by_type").notNull(),
  reportedById: text("reported_by_id").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("rental_incidents_reservation_idx").on(table.reservationId, table.createdAt),
  index("rental_incidents_operator_status_idx").on(table.operatorId, table.status),
]);

export const rentalClaimsTable = pgTable("rental_claims", {
  id: serial("id").primaryKey(),
  reservationId: integer("reservation_id").notNull().references(() => rentalReservationsTable.id, { onDelete: "cascade" }),
  incidentId: integer("incident_id").references(() => rentalIncidentsTable.id, { onDelete: "set null" }),
  operatorId: integer("operator_id").notNull().references(() => rentalOperatorsTable.id),
  status: text("status").notNull().default("draft"),
  currency: text("currency").notNull().default("jpy"),
  invoiceReference: text("invoice_reference"),
  insurerOutcome: text("insurer_outcome"),
  customerResponse: text("customer_response"),
  customerRespondedAt: timestamp("customer_responded_at", { withTimezone: true }),
  providerChargeStatus: text("provider_charge_status").notNull().default("not_configured"),
  totalAmount: integer("total_amount").notNull().default(0),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decidedBy: text("decided_by"),
  decision: text("decision"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("rental_claims_reservation_idx").on(table.reservationId, table.createdAt),
  index("rental_claims_operator_status_idx").on(table.operatorId, table.status),
]);

export const rentalClaimItemsTable = pgTable("rental_claim_items", {
  id: serial("id").primaryKey(),
  claimId: integer("claim_id").notNull().references(() => rentalClaimsTable.id, { onDelete: "cascade" }),
  category: text("category").notNull().default("repair"),
  description: text("description").notNull(),
  amount: integer("amount").notNull(),
  status: text("status").notNull().default("pending_platform_review"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("rental_claim_items_claim_idx").on(table.claimId)]);

export const rentalExceptionEvidenceTable = pgTable("rental_exception_evidence", {
  token: text("token").primaryKey(),
  reservationId: integer("reservation_id").notNull().references(() => rentalReservationsTable.id, { onDelete: "cascade" }),
  operatorId: integer("operator_id").notNull().references(() => rentalOperatorsTable.id),
  incidentId: integer("incident_id").references(() => rentalIncidentsTable.id, { onDelete: "cascade" }),
  claimId: integer("claim_id").references(() => rentalClaimsTable.id, { onDelete: "cascade" }),
  claimItemId: integer("claim_item_id").references(() => rentalClaimItemsTable.id, { onDelete: "cascade" }),
  inspectionId: integer("inspection_id").references(() => rentalInspectionsTable.id, { onDelete: "cascade" }),
  evidenceKind: text("evidence_kind").notNull().default("incident"),
  contentType: text("content_type").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("rental_exception_evidence_reservation_idx").on(table.reservationId),
  unique("rental_exception_evidence_context_unique").on(table.token, table.reservationId),
  index("rental_exception_evidence_inspection_idx").on(table.inspectionId),
]);

export const rentalExceptionEventsTable = pgTable("rental_exception_events", {
  id: serial("id").primaryKey(),
  reservationId: integer("reservation_id").notNull().references(() => rentalReservationsTable.id, { onDelete: "cascade" }),
  incidentId: integer("incident_id").references(() => rentalIncidentsTable.id, { onDelete: "cascade" }),
  claimId: integer("claim_id").references(() => rentalClaimsTable.id, { onDelete: "cascade" }),
  claimItemId: integer("claim_item_id").references(() => rentalClaimItemsTable.id, { onDelete: "cascade" }),
  actorType: text("actor_type").notNull(),
  actorId: text("actor_id").notNull(),
  eventType: text("event_type").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("rental_exception_events_reservation_idx").on(table.reservationId, table.createdAt)]);

export const rentalReservationExceptionsTable = pgTable(
  "rental_reservation_exceptions",
  {
    id: serial("id").primaryKey(),
    reservationId: integer("reservation_id").notNull()
      .references(() => rentalReservationsTable.id, { onDelete: "cascade" }),
    operatorId: integer("operator_id").notNull()
      .references(() => rentalOperatorsTable.id),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("quoted"),
    quotedAmount: integer("quoted_amount"),
    quoteSnapshot: jsonb("quote_snapshot").$type<Record<string, unknown>>().notNull(),
    policySnapshot: jsonb("policy_snapshot").$type<Record<string, unknown>>().notNull(),
    targetVehicleId: integer("target_vehicle_id"),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeRefundId: text("stripe_refund_id"),
    refundAmount: integer("refund_amount"),
    providerStatus: text("provider_status"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consentAt: timestamp("consent_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("rental_reservation_exceptions_reservation_idx").on(table.reservationId, table.kind),
    index("rental_reservation_exceptions_operator_idx").on(table.operatorId, table.status),
    uniqueIndex("rental_reservation_exceptions_checkout_unique")
      .on(table.stripeCheckoutSessionId)
      .where(sql`${table.stripeCheckoutSessionId} IS NOT NULL`),
    check("rental_reservation_exceptions_kind_check", sql`${table.kind} IN ('cancellation', 'extension', 'alternative')`),
    check("rental_reservation_exceptions_status_check", sql`${table.status} IN ('quoted', 'refund_pending', 'operator_review', 'cancelled', 'checkout_pending', 'payment_verified', 'applied', 'refund_failed', 'declined', 'expired')`),
    check("rental_reservation_exceptions_amount_check", sql`${table.quotedAmount} IS NULL OR ${table.quotedAmount} >= 0`),
  ],
);