BEGIN;
ALTER TABLE rental_reservation_holds DROP COLUMN hold_token_hash;
DROP TABLE app_sessions;
COMMIT;
