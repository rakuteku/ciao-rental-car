BEGIN;
ALTER TABLE rental_seasonal_pricing_rules
  DROP COLUMN IF EXISTS special_peak_overlap,
  DROP COLUMN IF EXISTS additional_hour,
  DROP COLUMN IF EXISTS additional_24_hours,
  DROP COLUMN IF EXISTS rate_24_hours,
  DROP COLUMN IF EXISTS rate_12_hours,
  DROP COLUMN IF EXISTS rate_6_hours;
ALTER TABLE rental_vehicle_pricing
  DROP COLUMN IF EXISTS early_return_refund,
  DROP COLUMN IF EXISTS late_return_requires_approval,
  DROP COLUMN IF EXISTS additional_day_cap_enabled,
  DROP COLUMN IF EXISTS cheapest_rate_enabled,
  DROP COLUMN IF EXISTS grace_period_minutes,
  DROP COLUMN IF EXISTS additional_hour,
  DROP COLUMN IF EXISTS additional_24_hours,
  DROP COLUMN IF EXISTS rate_24_hours,
  DROP COLUMN IF EXISTS rate_12_hours,
  DROP COLUMN IF EXISTS rate_6_hours,
  DROP COLUMN IF EXISTS rate_status,
  DROP COLUMN IF EXISTS effective_end_date,
  DROP COLUMN IF EXISTS effective_start_date,
  DROP COLUMN IF EXISTS currency,
  DROP COLUMN IF EXISTS rate_plan_name;
COMMIT;
