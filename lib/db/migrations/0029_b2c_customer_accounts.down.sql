BEGIN;

DROP TABLE IF EXISTS rental_customer_accounts;

ALTER TABLE rental_vehicle_pricing
  DROP COLUMN IF EXISTS return_window_end,
  DROP COLUMN IF EXISTS return_window_start,
  DROP COLUMN IF EXISTS pickup_window_end,
  DROP COLUMN IF EXISTS pickup_window_start;

COMMIT;
