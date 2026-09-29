import {
  pgEnum,
  pgTable,
  serial,
  integer,
  text,
  jsonb,
  timestamp,
  index,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { rentalMarketplaceRequestsTable } from "./rental-reservations";
import { rentalOperatorsTable } from "./rental-marketplace";
import { rentalReservationsTable } from "./rental-reservations";

export const rentalPaymentLedgerStatusEnum = pgEnum("rental_payment_ledger_status", [
  "pending",
  "creating_checkout",
  "checkout_open",
  "paid",
  "failed",
  "expired",
  "refund_pending",
  "partially_refunded",
  "refunded",
  "disputed",
  "chargeback",
  "reconciliation_failed",
]);

export const rentalRefundStatusEnum = pgEnum("rental_refund_status", [
  "pending",
  "succeeded",
  "failed",
  "canceled",
]);

export const rentalDisputeStatusEnum = pgEnum("rental_dispute_status", [
  "needs_response",
  "under_review",
  "won",
  "lost",
  "closed",
]);

export const rentalPayoutStatusEnum = pgEnum("rental_payout_status", ["reported_manual", "reversed"]);

export const rentalStripeEventStatusEnum = pgEnum("rental_stripe_event_status", [
  "processing",
  "processed",
  "failed",
]);

export const rentalPaymentsTable = pgTable(
  "rental_payments",
  {
    id: serial("id").primaryKey(),
    requestId: integer("request_id").notNull()
      .references(() => rentalMarketplaceRequestsTable.id),
    reservationId: integer("reservation_id").notNull()
      .references(() => rentalReservationsTable.id),
    operatorId: integer("operator_id").notNull()
      .references(() => rentalOperatorsTable.id),
    provider: text("provider").notNull().default("stripe"),
    status: rentalPaymentLedgerStatusEnum("status").notNull().default("pending"),
    currency: text("currency").notNull().default("jpy"),
    amount: integer("amount").notNull(),
    commissionAmount: integer("commission_amount").notNull(),
    commissionBasisPoints: integer("commission_basis_points").notNull(),
    commissionPolicyVersion: text("commission_policy_version").notNull(),
    operatorShareAmount: integer("operator_share_amount").notNull(),
    providerFeeAmount: integer("provider_fee_amount"),
    refundedAmount: integer("refunded_amount").notNull().default(0),
    chargedAmount: integer("charged_amount"),
    chargedCurrency: text("charged_currency"),
    priceSnapshot: jsonb("price_snapshot").$type<Record<string, unknown>>().notNull(),
    policySnapshot: jsonb("policy_snapshot").$type<Record<string, unknown>>().notNull(),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    checkoutAttempts: integer("checkout_attempts").notNull().default(0),
    stripeProductId: text("stripe_product_id"),
    stripePriceId: text("stripe_price_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeChargeId: text("stripe_charge_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("rental_payments_reservation_unique").on(table.reservationId),
    unique("rental_payments_idempotency_unique").on(table.idempotencyKey),
    uniqueIndex("rental_payments_checkout_session_unique")
      .on(table.stripeCheckoutSessionId).where(sql`${table.stripeCheckoutSessionId} IS NOT NULL`),
    uniqueIndex("rental_payments_stripe_price_unique")
      .on(table.stripePriceId).where(sql`${table.stripePriceId} IS NOT NULL`),
    index("rental_payments_request_idx").on(table.requestId),
    index("rental_payments_operator_status_idx").on(table.operatorId, table.status),
  ],
);

export const rentalRefundsTable = pgTable(
  "rental_refunds",
  {
    id: serial("id").primaryKey(),
    paymentId: integer("payment_id").notNull()
      .references(() => rentalPaymentsTable.id),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull().default("jpy"),
    reason: text("reason").notNull(),
    status: rentalRefundStatusEnum("status").notNull().default("pending"),
    stripeRefundId: text("stripe_refund_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("rental_refunds_idempotency_unique").on(table.idempotencyKey),
    uniqueIndex("rental_refunds_stripe_id_unique")
      .on(table.stripeRefundId).where(sql`${table.stripeRefundId} IS NOT NULL`),
    index("rental_refunds_payment_idx").on(table.paymentId),
  ],
);

export const rentalDisputesTable = pgTable(
  "rental_disputes",
  {
    id: serial("id").primaryKey(),
    paymentId: integer("payment_id").notNull().references(() => rentalPaymentsTable.id),
    stripeDisputeId: text("stripe_dispute_id").notNull(),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull(),
    reason: text("reason"),
    status: rentalDisputeStatusEnum("status").notNull(),
    evidenceDueAt: timestamp("evidence_due_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("rental_disputes_stripe_id_unique").on(table.stripeDisputeId),
    index("rental_disputes_payment_idx").on(table.paymentId),
  ],
);

export const rentalPayoutsTable = pgTable(
  "rental_payouts",
  {
    id: serial("id").primaryKey(),
    paymentId: integer("payment_id").notNull().references(() => rentalPaymentsTable.id),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull().default("jpy"),
    status: rentalPayoutStatusEnum("status").notNull().default("reported_manual"),
    reference: text("reference").notNull(),
    notes: text("notes"),
    reportedBy: text("reported_by").notNull(),
    reportedAt: timestamp("reported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("rental_payouts_payment_reference_unique").on(table.paymentId, table.reference),
    index("rental_payouts_payment_idx").on(table.paymentId),
  ],
);

export const rentalStripeEventsTable = pgTable("rental_stripe_events", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  objectId: text("object_id"),
  status: rentalStripeEventStatusEnum("status").notNull().default("processing"),
  attempts: integer("attempts").notNull().default(1),
  lastError: text("last_error"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});

export const rentalReconciliationFailuresTable = pgTable(
  "rental_reconciliation_failures",
  {
    id: serial("id").primaryKey(),
    paymentId: integer("payment_id").references(() => rentalPaymentsTable.id),
    stripeEventId: text("stripe_event_id"),
    failureType: text("failure_type").notNull(),
    message: text("message").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    index("rental_reconciliation_failures_payment_idx").on(table.paymentId),
    index("rental_reconciliation_failures_created_idx").on(table.createdAt),
  ],
);

export type RentalPayment = typeof rentalPaymentsTable.$inferSelect;