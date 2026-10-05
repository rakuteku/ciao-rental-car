ALTER TYPE rental_addon_pricing_type ADD VALUE IF NOT EXISTS 'per_started_24_hours';
ALTER TYPE rental_addon_pricing_type ADD VALUE IF NOT EXISTS 'per_rental';
ALTER TYPE rental_addon_pricing_type ADD VALUE IF NOT EXISTS 'per_handover';
ALTER TYPE rental_addon_pricing_type ADD VALUE IF NOT EXISTS 'included';

BEGIN;

ALTER TABLE rental_vehicle_pricing
  ADD COLUMN IF NOT EXISTS rate_plan_name text NOT NULL DEFAULT 'Standard rate',
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'JPY',
  ADD COLUMN IF NOT EXISTS effective_start_date text,
  ADD COLUMN IF NOT EXISTS effective_end_date text,
  ADD COLUMN IF NOT EXISTS rate_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS rate_6_hours integer,
  ADD COLUMN IF NOT EXISTS rate_12_hours integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rate_24_hours integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS additional_24_hours integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS additional_hour integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grace_period_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cheapest_rate_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS additional_day_cap_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS late_return_requires_approval boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS early_return_refund boolean NOT NULL DEFAULT false;

UPDATE rental_vehicle_pricing
SET rate_12_hours = CASE WHEN rate_12_hours = 0 THEN ROUND(base_price)::integer ELSE rate_12_hours END,
    rate_24_hours = CASE WHEN rate_24_hours = 0 THEN ROUND(base_price)::integer ELSE rate_24_hours END,
    additional_24_hours = CASE WHEN additional_24_hours = 0 THEN ROUND(base_price)::integer ELSE additional_24_hours END,
    additional_hour = CASE WHEN additional_hour = 0 AND base_price > 0 THEN CEIL(base_price / 24.0)::integer ELSE additional_hour END;

ALTER TABLE rental_seasonal_pricing_rules
  ADD COLUMN IF NOT EXISTS rate_6_hours integer,
  ADD COLUMN IF NOT EXISTS rate_12_hours integer,
  ADD COLUMN IF NOT EXISTS rate_24_hours integer,
  ADD COLUMN IF NOT EXISTS additional_24_hours integer,
  ADD COLUMN IF NOT EXISTS additional_hour integer,
  ADD COLUMN IF NOT EXISTS special_peak_overlap boolean NOT NULL DEFAULT false;

COMMIT;
