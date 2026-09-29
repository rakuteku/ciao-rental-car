BEGIN;

ALTER TABLE rental_marketplace_requests DROP COLUMN IF EXISTS locale;

DROP INDEX rental_notifications_delivery_idx;
DROP INDEX rental_notifications_delivery_lease_idx;
DROP INDEX rental_notifications_dedupe_unique;
ALTER TABLE rental_notifications
  DROP CONSTRAINT rental_notifications_delivery_status_check,
  DROP CONSTRAINT rental_notifications_attempt_count_check,
  DROP COLUMN delivery_status,
  DROP COLUMN attempt_count,
  DROP COLUMN last_attempt_at,
  DROP COLUMN next_attempt_at,
  DROP COLUMN delivery_lease_until,
  DROP COLUMN data_submitted_at,
  DROP COLUMN dedupe_key,
  DROP COLUMN last_error;

COMMIT;