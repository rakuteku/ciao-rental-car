-- Timed marketplace requests and immutable offer snapshots, version 0023.
BEGIN;

CREATE TYPE rental_marketplace_request_status AS ENUM (
  'requested', 'offer_pending', 'awaiting_payment', 'declined', 'expired'
);

ALTER TABLE rental_reservations
  ADD COLUMN attribution jsonb,
  ADD COLUMN marketing_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN marketplace_offer_snapshot jsonb;
ALTER TABLE rental_vehicle_pricing
  ADD COLUMN billable_period_hours integer NOT NULL DEFAULT 24;

CREATE TABLE rental_marketplace_requests (
  id serial PRIMARY KEY,
  operator_id integer NOT NULL REFERENCES rental_operators(id),
  vehicle_id integer NOT NULL REFERENCES rental_vehicles(id),
  hold_id integer NOT NULL REFERENCES rental_reservation_holds(id),
  offer_hold_id integer REFERENCES rental_reservation_holds(id),
  reservation_id integer REFERENCES rental_reservations(id),
  status rental_marketplace_request_status NOT NULL DEFAULT 'requested',
  customer_access_token text NOT NULL,
  driver jsonb NOT NULL,
  additional_drivers jsonb NOT NULL DEFAULT '[]'::jsonb,
  addons jsonb NOT NULL DEFAULT '[]'::jsonb,
  travel_notes text,
  marketing_consent boolean NOT NULL DEFAULT false,
  attribution jsonb,
  initial_offer jsonb NOT NULL,
  current_offer jsonb NOT NULL,
  offer_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  accepted_offer jsonb,
  requested_at timestamptz NOT NULL DEFAULT now(),
  respond_by timestamptz NOT NULL,
  payment_deadline timestamptz,
  declined_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rental_marketplace_requests_hold_unique UNIQUE (hold_id)
);

CREATE INDEX rental_marketplace_requests_operator_idx
  ON rental_marketplace_requests (operator_id, status);
CREATE INDEX rental_marketplace_requests_vehicle_idx
  ON rental_marketplace_requests (vehicle_id, status);
CREATE INDEX rental_marketplace_requests_respond_by_idx
  ON rental_marketplace_requests (respond_by);

COMMIT;