-- Retryable SMTP delivery state for rental notifications.
BEGIN;

ALTER TABLE rental_marketplace_requests
  ADD COLUMN locale text NOT NULL DEFAULT 'en'
  CONSTRAINT rental_marketplace_requests_locale_check CHECK (locale IN ('en', 'ja'));

ALTER TABLE rental_notifications
  ADD COLUMN delivery_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN last_attempt_at timestamptz,
  ADD COLUMN next_attempt_at timestamptz,
  ADD COLUMN delivery_lease_until timestamptz,
  ADD COLUMN data_submitted_at timestamptz,
  ADD COLUMN dedupe_key text,
  ADD COLUMN last_error text;

ALTER TABLE rental_notifications
  ADD CONSTRAINT rental_notifications_delivery_status_check
    CHECK (delivery_status IN ('pending', 'unconfigured', 'failed', 'sent')),
  ADD CONSTRAINT rental_notifications_attempt_count_check
    CHECK (attempt_count >= 0);

CREATE INDEX rental_notifications_delivery_idx
  ON rental_notifications (delivery_status, next_attempt_at);
CREATE INDEX rental_notifications_delivery_lease_idx
  ON rental_notifications (delivery_status, delivery_lease_until);
CREATE UNIQUE INDEX rental_notifications_dedupe_unique
  ON rental_notifications (dedupe_key);

COMMIT;