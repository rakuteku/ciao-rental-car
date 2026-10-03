BEGIN;

ALTER TABLE rental_vehicle_pricing
  ADD COLUMN IF NOT EXISTS pickup_window_start text NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS pickup_window_end text NOT NULL DEFAULT '19:00',
  ADD COLUMN IF NOT EXISTS return_window_start text NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS return_window_end text NOT NULL DEFAULT '19:30';

CREATE TABLE IF NOT EXISTS rental_customer_accounts (
  id serial PRIMARY KEY,
  email text NOT NULL,
  password_hash text NOT NULL,
  full_name text NOT NULL,
  phone text,
  preferred_language text NOT NULL DEFAULT 'en',
  status text NOT NULL DEFAULT 'active',
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS rental_customer_accounts_email_unique
  ON rental_customer_accounts (email);

COMMIT;
