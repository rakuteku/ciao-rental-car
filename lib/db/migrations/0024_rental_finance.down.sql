BEGIN;
ALTER TABLE rental_marketplace_requests ALTER COLUMN status DROP DEFAULT;
ALTER TABLE rental_marketplace_requests
  ALTER COLUMN status TYPE text USING status::text;
UPDATE rental_marketplace_requests SET status = 'awaiting_payment' WHERE status = 'confirmed';
CREATE TYPE rental_marketplace_request_status_without_confirmed AS ENUM (
  'requested', 'offer_pending', 'awaiting_payment', 'declined', 'expired'
);
ALTER TABLE rental_marketplace_requests
  ALTER COLUMN status TYPE rental_marketplace_request_status_without_confirmed
  USING status::rental_marketplace_request_status_without_confirmed;
ALTER TABLE rental_marketplace_requests
  ALTER COLUMN status SET DEFAULT 'requested';
DROP TYPE rental_marketplace_request_status;
ALTER TYPE rental_marketplace_request_status_without_confirmed RENAME TO rental_marketplace_request_status;
DROP TABLE rental_reconciliation_failures;
DROP TABLE rental_stripe_events;
DROP TABLE rental_payouts;
DROP TABLE rental_disputes;
DROP TABLE rental_refunds;
DROP TABLE rental_payments;
DROP TYPE rental_stripe_event_status;
DROP TYPE rental_payout_status;
DROP TYPE rental_dispute_status;
DROP TYPE rental_refund_status;
DROP TYPE rental_payment_ledger_status;
COMMIT;