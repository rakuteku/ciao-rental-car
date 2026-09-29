-- Marketplace tenant foundation, version 0022.
-- Apply only after reviewing migrations/README.md and taking a database backup.
BEGIN;

CREATE TYPE rental_operator_status AS ENUM ('active', 'pending', 'suspended', 'closed');
CREATE TYPE rental_operator_staff_role AS ENUM ('owner', 'manager', 'counter', 'operations');
CREATE TYPE rental_operator_staff_status AS ENUM ('invited', 'active', 'suspended', 'removed');
CREATE TYPE rental_operator_verification_status AS ENUM (
  'draft', 'submitted', 'under_review', 'approved', 'rejected', 'needs_information'
);
CREATE TYPE rental_operator_document_status AS ENUM (
  'uploaded', 'under_review', 'accepted', 'rejected', 'expired'
);

CREATE TABLE rental_operators (
  id serial PRIMARY KEY,
  slug text NOT NULL,
  name text NOT NULL,
  legal_name text,
  status rental_operator_status NOT NULL DEFAULT 'pending',
  verification_status rental_operator_verification_status NOT NULL DEFAULT 'draft',
  is_platform boolean NOT NULL DEFAULT false,
  contact_email text,
  contact_phone text,
  address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rental_operators_slug_unique UNIQUE (slug)
);
CREATE UNIQUE INDEX rental_operators_platform_unique
  ON rental_operators (is_platform) WHERE is_platform;
CREATE INDEX rental_operators_status_idx ON rental_operators (status);

CREATE TABLE rental_operator_staff (
  id serial PRIMARY KEY,
  operator_id integer NOT NULL REFERENCES rental_operators(id) ON DELETE CASCADE,
  identity_subject text NOT NULL,
  email text NOT NULL,
  password_hash text NOT NULL,
  display_name text,
  role rental_operator_staff_role NOT NULL DEFAULT 'counter',
  status rental_operator_staff_status NOT NULL DEFAULT 'invited',
  active boolean NOT NULL DEFAULT false,
  invited_at timestamptz NOT NULL DEFAULT now(),
  joined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rental_operator_staff_identity_unique UNIQUE (operator_id, identity_subject),
  CONSTRAINT rental_operator_staff_active_status_check
    CHECK (active = (status = 'active'))
);
CREATE INDEX rental_operator_staff_operator_idx ON rental_operator_staff (operator_id);
CREATE INDEX rental_operator_staff_subject_idx ON rental_operator_staff (identity_subject);

CREATE TABLE rental_operator_verifications (
  id serial PRIMARY KEY,
  operator_id integer NOT NULL REFERENCES rental_operators(id) ON DELETE CASCADE,
  verification_type text NOT NULL,
  status rental_operator_verification_status NOT NULL DEFAULT 'draft',
  submitted_by_staff_id integer REFERENCES rental_operator_staff(id) ON DELETE SET NULL,
  reviewed_by text,
  review_notes text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rental_operator_verifications_operator_idx
  ON rental_operator_verifications (operator_id);
CREATE INDEX rental_operator_verifications_status_idx
  ON rental_operator_verifications (status);

CREATE TABLE rental_operator_documents (
  id serial PRIMARY KEY,
  operator_id integer NOT NULL REFERENCES rental_operators(id) ON DELETE CASCADE,
  verification_id integer REFERENCES rental_operator_verifications(id) ON DELETE SET NULL,
  uploaded_by_staff_id integer REFERENCES rental_operator_staff(id) ON DELETE SET NULL,
  document_type text NOT NULL,
  storage_key text NOT NULL,
  original_file_name text,
  content_type text,
  status rental_operator_document_status NOT NULL DEFAULT 'uploaded',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rental_operator_documents_operator_idx ON rental_operator_documents (operator_id);
CREATE INDEX rental_operator_documents_verification_idx
  ON rental_operator_documents (verification_id);

-- The platform row's stable key is its slug, not a database-specific serial ID.
INSERT INTO rental_operators (slug, name, status, verification_status, is_platform)
VALUES ('platform', 'Platform', 'active', 'approved', true)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE rental_vehicles ADD COLUMN operator_id integer;
ALTER TABLE rental_vehicles ADD COLUMN legacy_car_id integer;
ALTER TABLE rental_addons ADD COLUMN operator_id integer;
ALTER TABLE rental_reservations ADD COLUMN operator_id integer;
ALTER TABLE rental_driver_documents ADD COLUMN operator_id integer;

-- Existing platform-owned records retain their ids and all non-ownership fields.
UPDATE rental_vehicles
SET operator_id = (SELECT id FROM rental_operators WHERE slug = 'platform');
UPDATE rental_addons
SET operator_id = (SELECT id FROM rental_operators WHERE slug = 'platform');
UPDATE rental_reservations
SET operator_id = (SELECT id FROM rental_operators WHERE slug = 'platform');
UPDATE rental_driver_documents
SET operator_id = (SELECT id FROM rental_operators WHERE slug = 'platform');

-- Narrow seed reconciliation only: populate one nullable legacy link per
-- known car. Prefer canonical slugs if both canonical and old rows exist;
-- otherwise choose one known old-slug row deterministically. Other rows remain
-- unmapped, and catalog status/publication fields are never changed here.
WITH legacy_seed AS (
  SELECT id, lower(btrim(name)) AS normalized_name,
         row_number() OVER (PARTITION BY lower(btrim(name)) ORDER BY id DESC) AS row_number
  FROM cars
  WHERE lower(btrim(name)) IN ('alphard', 'vellfire', 'sienta')
),
known_mapping (legacy_name, vehicle_slug, slug_priority) AS (
  VALUES
    ('alphard', 'toyota-alphard', 0),
    ('alphard', 'toyota-alphard-01', 1),
    ('vellfire', 'toyota-vellfire', 0),
    ('vellfire', 'toyota-alphard-02', 1),
    ('sienta', 'toyota-sienta', 0),
    ('sienta', 'toyota-sienta-01', 1)
),
ranked_vehicle_matches AS (
  SELECT
    legacy_seed.id AS legacy_car_id,
    vehicle.id AS rental_vehicle_id,
    row_number() OVER (
      PARTITION BY legacy_seed.id
      ORDER BY known_mapping.slug_priority, vehicle.id
    ) AS candidate_rank
  FROM legacy_seed
  JOIN known_mapping
    ON known_mapping.legacy_name = legacy_seed.normalized_name
  JOIN rental_vehicles AS vehicle
    ON vehicle.slug = known_mapping.vehicle_slug
  WHERE legacy_seed.row_number = 1
    AND vehicle.legacy_car_id IS NULL
),
preferred_vehicle_match AS (
  SELECT legacy_car_id, rental_vehicle_id
  FROM ranked_vehicle_matches
  WHERE candidate_rank = 1
)
UPDATE rental_vehicles AS vehicle
SET legacy_car_id = preferred_vehicle_match.legacy_car_id
FROM preferred_vehicle_match
WHERE vehicle.id = preferred_vehicle_match.rental_vehicle_id;

ALTER TABLE rental_vehicles
  ALTER COLUMN operator_id SET NOT NULL,
  ADD CONSTRAINT rental_vehicles_operator_fk
    FOREIGN KEY (operator_id) REFERENCES rental_operators(id);
ALTER TABLE rental_vehicles
  ADD CONSTRAINT rental_vehicles_legacy_car_fk
  FOREIGN KEY (legacy_car_id) REFERENCES cars(id) ON DELETE SET NULL;
ALTER TABLE rental_addons
  ALTER COLUMN operator_id SET NOT NULL,
  ADD CONSTRAINT rental_addons_operator_fk
    FOREIGN KEY (operator_id) REFERENCES rental_operators(id);
ALTER TABLE rental_reservations
  ALTER COLUMN operator_id SET NOT NULL,
  ADD CONSTRAINT rental_reservations_operator_fk
    FOREIGN KEY (operator_id) REFERENCES rental_operators(id);
ALTER TABLE rental_driver_documents
  ALTER COLUMN operator_id SET NOT NULL,
  ADD CONSTRAINT rental_driver_documents_operator_fk
    FOREIGN KEY (operator_id) REFERENCES rental_operators(id);

CREATE INDEX rental_vehicles_operator_idx ON rental_vehicles (operator_id);
CREATE UNIQUE INDEX rental_vehicles_legacy_car_unique ON rental_vehicles (legacy_car_id);
CREATE INDEX rental_addons_operator_idx ON rental_addons (operator_id);
CREATE INDEX rental_reservations_operator_idx ON rental_reservations (operator_id);
CREATE INDEX rental_driver_docs_operator_idx ON rental_driver_documents (operator_id);

COMMIT;