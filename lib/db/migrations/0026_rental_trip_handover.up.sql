-- Safe to apply with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/migrations/0026_rental_trip_handover.up.sql
-- This additive/backfill migration is wrapped in a transaction; failures roll back all schema/data changes.
BEGIN;

ALTER TYPE rental_reservation_status ADD VALUE 'closed';

ALTER TABLE rental_inspections
  ADD COLUMN agreement_accepted boolean NOT NULL DEFAULT false,
  ADD COLUMN signature_reference text,
  ADD COLUMN vehicle_identity text,
  ADD COLUMN actual_at timestamptz,
  ADD COLUMN location text,
  ADD COLUMN equipment jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN discrepancies jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN retention_until timestamptz;

ALTER TABLE rental_inspection_photos
  ADD COLUMN storage_key text,
  ADD COLUMN retention_until timestamptz;

CREATE TABLE rental_reservation_drivers (
  id serial PRIMARY KEY,
  reservation_id integer NOT NULL REFERENCES rental_reservations(id) ON DELETE CASCADE,
  driver_id integer NOT NULL REFERENCES rental_drivers(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  originals_verified_at timestamptz,
  originals_verified_by text,
  original_license_verified_at timestamptz,
  original_identity_verified_at timestamptz,
  original_international_permit_verified_at timestamptz,
  originals_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rental_reservation_drivers_unique UNIQUE (reservation_id, driver_id)
);
CREATE INDEX rental_reservation_drivers_reservation_idx ON rental_reservation_drivers(reservation_id);
INSERT INTO rental_reservation_drivers (reservation_id, driver_id, is_primary)
SELECT id, primary_driver_id, true
FROM rental_reservations
WHERE source = 'marketplace_request' AND primary_driver_id IS NOT NULL
ON CONFLICT (reservation_id, driver_id) DO NOTHING;

DO $$
DECLARE
  authorized_driver record;
  created_driver_id integer;
BEGIN
  FOR authorized_driver IN
    SELECT r.id AS reservation_id, extra.value AS driver
    FROM rental_reservations r
    JOIN rental_marketplace_requests request ON request.reservation_id = r.id
    CROSS JOIN LATERAL jsonb_array_elements(request.additional_drivers) AS extra(value)
    WHERE r.source = 'marketplace_request'
  LOOP
    INSERT INTO rental_drivers (full_name, email, phone)
    VALUES (
      COALESCE(authorized_driver.driver->>'fullName', 'Authorized driver'),
      COALESCE(authorized_driver.driver->>'email', ''),
      COALESCE(authorized_driver.driver->>'phone', '')
    )
    RETURNING id INTO created_driver_id;
    INSERT INTO rental_reservation_drivers (reservation_id, driver_id, is_primary)
    VALUES (authorized_driver.reservation_id, created_driver_id, false)
    ON CONFLICT (reservation_id, driver_id) DO NOTHING;
  END LOOP;
END $$;

CREATE TABLE rental_inspection_access (
  id serial PRIMARY KEY,
  inspection_id integer NOT NULL REFERENCES rental_inspections(id) ON DELETE CASCADE,
  actor_type text NOT NULL,
  actor_id text NOT NULL,
  accessed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rental_inspection_access_inspection_idx ON rental_inspection_access(inspection_id);

CREATE TABLE rental_trip_ledger (
  id serial PRIMARY KEY,
  reservation_id integer NOT NULL REFERENCES rental_reservations(id) ON DELETE CASCADE,
  operator_id integer NOT NULL,
  entry_type text NOT NULL,
  amount integer NOT NULL,
  currency text NOT NULL DEFAULT 'jpy',
  status text NOT NULL DEFAULT 'posted',
  description text NOT NULL,
  saved_terms jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rental_trip_ledger_reservation_idx ON rental_trip_ledger(reservation_id);
CREATE INDEX rental_trip_ledger_operator_idx ON rental_trip_ledger(operator_id);

CREATE TABLE rental_trip_uploads (
  token text PRIMARY KEY,
  reservation_id integer NOT NULL REFERENCES rental_reservations(id) ON DELETE CASCADE,
  operator_id integer NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png')),
  uploaded_at timestamptz,
  expires_at timestamptz NOT NULL
);
CREATE INDEX rental_trip_uploads_reservation_idx ON rental_trip_uploads(reservation_id);

CREATE TABLE rental_trip_charge_approvals (
  id serial PRIMARY KEY,
  reservation_id integer NOT NULL REFERENCES rental_reservations(id) ON DELETE CASCADE,
  customer_driver_id integer NOT NULL REFERENCES rental_drivers(id),
  code text NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rental_trip_charge_approvals_unique UNIQUE (reservation_id, code)
);
CREATE INDEX rental_trip_charge_approvals_reservation_idx ON rental_trip_charge_approvals(reservation_id);

COMMIT;