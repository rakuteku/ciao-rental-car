-- Safe to apply with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/migrations/0027_rental_exceptions.up.sql
BEGIN;

CREATE TABLE rental_reservation_exceptions (
  id serial PRIMARY KEY,
  reservation_id integer NOT NULL REFERENCES rental_reservations(id) ON DELETE CASCADE,
  operator_id integer NOT NULL REFERENCES rental_operators(id),
  kind text NOT NULL CHECK (kind IN ('cancellation', 'extension', 'alternative')),
  status text NOT NULL DEFAULT 'quoted' CHECK (status IN (
    'quoted', 'refund_pending', 'operator_review', 'cancelled',
    'checkout_pending', 'payment_verified', 'applied', 'refund_failed',
    'declined', 'expired'
  )),
  quoted_amount integer CHECK (quoted_amount IS NULL OR quoted_amount >= 0),
  quote_snapshot jsonb NOT NULL,
  policy_snapshot jsonb NOT NULL,
  target_vehicle_id integer REFERENCES rental_vehicles(id),
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  stripe_refund_id text,
  refund_amount integer CHECK (refund_amount IS NULL OR refund_amount >= 0),
  provider_status text,
  expires_at timestamptz NOT NULL,
  consent_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rental_reservation_exceptions_reservation_idx
  ON rental_reservation_exceptions(reservation_id, kind);
CREATE INDEX rental_reservation_exceptions_operator_idx
  ON rental_reservation_exceptions(operator_id, status);
CREATE UNIQUE INDEX rental_reservation_exceptions_checkout_unique
  ON rental_reservation_exceptions(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

COMMIT;