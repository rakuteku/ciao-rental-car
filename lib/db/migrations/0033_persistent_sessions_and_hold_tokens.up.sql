BEGIN;
CREATE TABLE app_sessions (
  sid text PRIMARY KEY,
  sess jsonb NOT NULL,
  expire timestamptz NOT NULL
);
CREATE INDEX app_sessions_expire_idx ON app_sessions (expire);
ALTER TABLE rental_reservation_holds ADD COLUMN hold_token_hash text;
COMMIT;
