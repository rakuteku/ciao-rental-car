-- Verified marketplace payment and reconciliation ledger, version 0024.
BEGIN;

CREATE TYPE rental_payment_ledger_status AS ENUM (
  'pending', 'creating_checkout', 'checkout_open', 'paid', 'failed', 'expired', 'refund_pending',
  'partially_refunded', 'refunded', 'disputed', 'chargeback', 'reconciliation_failed'
);
CREATE TYPE rental_refund_status AS ENUM ('pending', 'succeeded', 'failed', 'canceled');
CREATE TYPE rental_dispute_status AS ENUM ('needs_response', 'under_review', 'won', 'lost', 'closed');
CREATE TYPE rental_payout_status AS ENUM ('reported_manual', 'reversed');
CREATE TYPE rental_stripe_event_status AS ENUM ('processing', 'processed', 'failed');
ALTER TYPE rental_marketplace_request_status ADD VALUE 'confirmed';

CREATE TABLE rental_payments (
  id serial PRIMARY KEY,
  request_id integer NOT NULL REFERENCES rental_marketplace_requests(id),
  reservation_id integer NOT NULL UNIQUE REFERENCES rental_reservations(id),
  operator_id integer NOT NULL REFERENCES rental_operators(id),
  provider text NOT NULL DEFAULT 'stripe',
  status rental_payment_ledger_status NOT NULL DEFAULT 'pending',
  currency text NOT NULL DEFAULT 'jpy',
  amount integer NOT NULL CHECK (amount > 0),
  commission_amount integer NOT NULL CHECK (commission_amount >= 0),
  commission_basis_points integer NOT NULL CHECK (commission_basis_points BETWEEN 0 AND 10000),
  commission_policy_version text NOT NULL,
  operator_share_amount integer NOT NULL CHECK (operator_share_amount >= 0),
  provider_fee_amount integer CHECK (provider_fee_amount >= 0),
  refunded_amount integer NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0),
  charged_amount integer CHECK (charged_amount >= 0),
  charged_currency text,
  price_snapshot jsonb NOT NULL,
  policy_snapshot jsonb NOT NULL,
  stripe_checkout_session_id text,
  checkout_attempts integer NOT NULL DEFAULT 0,
  stripe_product_id text,
  stripe_price_id text,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  idempotency_key text NOT NULL UNIQUE,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX rental_payments_checkout_session_unique
  ON rental_payments (stripe_checkout_session_id) WHERE stripe_checkout_session_id IS NOT NULL;
CREATE UNIQUE INDEX rental_payments_stripe_price_unique
  ON rental_payments (stripe_price_id) WHERE stripe_price_id IS NOT NULL;
CREATE INDEX rental_payments_request_idx ON rental_payments (request_id);
CREATE INDEX rental_payments_operator_status_idx ON rental_payments (operator_id, status);

CREATE TABLE rental_refunds (
  id serial PRIMARY KEY,
  payment_id integer NOT NULL REFERENCES rental_payments(id),
  amount integer NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'jpy',
  reason text NOT NULL,
  status rental_refund_status NOT NULL DEFAULT 'pending',
  stripe_refund_id text,
  idempotency_key text NOT NULL UNIQUE,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX rental_refunds_stripe_id_unique
  ON rental_refunds (stripe_refund_id) WHERE stripe_refund_id IS NOT NULL;
CREATE INDEX rental_refunds_payment_idx ON rental_refunds (payment_id);

CREATE TABLE rental_disputes (
  id serial PRIMARY KEY,
  payment_id integer NOT NULL REFERENCES rental_payments(id),
  stripe_dispute_id text NOT NULL UNIQUE,
  amount integer NOT NULL CHECK (amount >= 0),
  currency text NOT NULL,
  reason text,
  status rental_dispute_status NOT NULL,
  evidence_due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rental_disputes_payment_idx ON rental_disputes (payment_id);

CREATE TABLE rental_payouts (
  id serial PRIMARY KEY,
  payment_id integer NOT NULL REFERENCES rental_payments(id),
  amount integer NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'jpy',
  status rental_payout_status NOT NULL DEFAULT 'reported_manual',
  reference text NOT NULL,
  notes text,
  reported_by text NOT NULL,
  reported_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rental_payouts_payment_reference_unique UNIQUE (payment_id, reference)
);
CREATE INDEX rental_payouts_payment_idx ON rental_payouts (payment_id);

CREATE TABLE rental_stripe_events (
  id text PRIMARY KEY,
  event_type text NOT NULL,
  object_id text,
  status rental_stripe_event_status NOT NULL DEFAULT 'processing',
  attempts integer NOT NULL DEFAULT 1,
  last_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE TABLE rental_reconciliation_failures (
  id serial PRIMARY KEY,
  payment_id integer REFERENCES rental_payments(id),
  stripe_event_id text,
  failure_type text NOT NULL,
  message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX rental_reconciliation_failures_payment_idx ON rental_reconciliation_failures (payment_id);
CREATE INDEX rental_reconciliation_failures_created_idx ON rental_reconciliation_failures (created_at);

COMMIT;