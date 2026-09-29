-- Rollback for 0022. This drops tenant tables and ownership data; see README
-- for required backup/verification steps before execution.
BEGIN;

DROP INDEX rental_driver_docs_operator_idx;
DROP INDEX rental_reservations_operator_idx;
DROP INDEX rental_addons_operator_idx;
DROP INDEX rental_vehicles_legacy_car_unique;
DROP INDEX rental_vehicles_operator_idx;

ALTER TABLE rental_driver_documents
  DROP CONSTRAINT rental_driver_documents_operator_fk,
  DROP COLUMN operator_id;
ALTER TABLE rental_reservations
  DROP CONSTRAINT rental_reservations_operator_fk,
  DROP COLUMN operator_id;
ALTER TABLE rental_addons
  DROP CONSTRAINT rental_addons_operator_fk,
  DROP COLUMN operator_id;
ALTER TABLE rental_vehicles
  DROP CONSTRAINT rental_vehicles_operator_fk,
  DROP CONSTRAINT rental_vehicles_legacy_car_fk,
  DROP COLUMN operator_id,
  DROP COLUMN legacy_car_id;

DROP TABLE rental_operator_documents;
DROP TABLE rental_operator_verifications;
DROP TABLE rental_operator_staff;
DROP TABLE rental_operators;

DROP TYPE rental_operator_document_status;
DROP TYPE rental_operator_verification_status;
DROP TYPE rental_operator_staff_status;
DROP TYPE rental_operator_staff_role;
DROP TYPE rental_operator_status;

COMMIT;