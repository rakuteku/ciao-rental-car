BEGIN;
ALTER TABLE rental_addons DROP COLUMN IF EXISTS insurance_kind;
ALTER TABLE rental_addons DROP COLUMN IF EXISTS category;
-- Restore publication settings from a pre-migration backup if required.
COMMIT;
