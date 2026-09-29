BEGIN;
DROP TABLE rental_marketplace_requests;
DROP TYPE rental_marketplace_request_status;
ALTER TABLE rental_reservations
  DROP COLUMN attribution,
  DROP COLUMN marketing_consent,
  DROP COLUMN marketplace_offer_snapshot;
ALTER TABLE rental_vehicle_pricing DROP COLUMN billable_period_hours;
COMMIT;