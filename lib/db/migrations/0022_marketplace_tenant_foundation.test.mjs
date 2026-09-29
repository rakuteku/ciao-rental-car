import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const up = await readFile(new URL("./0022_marketplace_tenant_foundation.up.sql", import.meta.url), "utf8");
const down = await readFile(new URL("./0022_marketplace_tenant_foundation.down.sql", import.meta.url), "utf8");
const readme = await readFile(new URL("./README.md", import.meta.url), "utf8");
const backfill = await readFile(new URL("../src/rental-catalog-backfill.ts", import.meta.url), "utf8");
const vehicleSchema = await readFile(new URL("../src/schema/rental-vehicles.ts", import.meta.url), "utf8");
const reservationSchema = await readFile(new URL("../src/schema/rental-reservations.ts", import.meta.url), "utf8");
const addonSchema = await readFile(new URL("../src/schema/rental-addons.ts", import.meta.url), "utf8");
const driverDocumentSchema = await readFile(new URL("../src/schema/rental-driver-documents.ts", import.meta.url), "utf8");

test("version 0022 backfills the stable platform owner before enforcing ownership", () => {
  assert.match(up, /VALUES\s*\('platform',\s*'Platform',\s*'active',\s*'approved',\s*true\)\s*ON CONFLICT \(slug\) DO NOTHING/i);
  for (const table of ["rental_vehicles", "rental_addons", "rental_reservations", "rental_driver_documents"]) {
    assert.match(up, new RegExp(`UPDATE ${table}\\s+SET operator_id =`, "i"));
    assert.match(up, new RegExp(`ALTER TABLE ${table}[\\s\\S]*?ALTER COLUMN operator_id SET NOT NULL`, "i"));
    assert.match(down, new RegExp(`ALTER TABLE ${table}[\\s\\S]*?DROP COLUMN operator_id`, "i"));
  }
  for (const table of ["rental_vehicles", "rental_addons", "rental_reservations", "rental_driver_documents"]) {
    const addColumnAt = up.indexOf(`ALTER TABLE ${table} ADD COLUMN operator_id integer`);
    const backfillAt = up.indexOf(`UPDATE ${table}\nSET operator_id =`);
    const constraintAt = up.indexOf(`ALTER TABLE ${table}\n  ALTER COLUMN operator_id SET NOT NULL`);
    assert.ok(addColumnAt >= 0 && backfillAt > addColumnAt && constraintAt > backfillAt);
  }
});

test("legacy catalog reconciliation is nullable, unique, and narrowly scoped", () => {
  assert.match(up, /ADD COLUMN legacy_car_id integer/i);
  assert.match(up, /FOREIGN KEY \(legacy_car_id\) REFERENCES cars\(id\) ON DELETE SET NULL/i);
  assert.match(up, /CREATE UNIQUE INDEX rental_vehicles_legacy_car_unique ON rental_vehicles \(legacy_car_id\)/i);
  assert.match(up, /known_mapping[\s\S]*'alphard'[\s\S]*'vellfire'[\s\S]*'sienta'/i);
  assert.match(down, /DROP COLUMN legacy_car_id/i);
  assert.doesNotMatch(up, /DELETE\s+FROM\s+(cars|rental_vehicles|rental_addons|rental_reservations)/i);
});

test("legacy mapping selects at most one row per car, preferring canonical slugs", () => {
  const start = up.indexOf("-- Narrow seed reconciliation");
  const end = up.indexOf("ALTER TABLE rental_vehicles\n  ALTER COLUMN operator_id", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const reconciliation = up.slice(start, end);

  assert.match(reconciliation, /'alphard',\s*'toyota-alphard',\s*0/);
  assert.match(reconciliation, /'alphard',\s*'toyota-alphard-01',\s*1/);
  assert.match(reconciliation, /'vellfire',\s*'toyota-vellfire',\s*0/);
  assert.match(reconciliation, /'vellfire',\s*'toyota-alphard-02',\s*1/);
  assert.match(reconciliation, /'sienta',\s*'toyota-sienta',\s*0/);
  assert.match(reconciliation, /'sienta',\s*'toyota-sienta-01',\s*1/);
  assert.match(reconciliation, /PARTITION BY legacy_seed\.id\s+ORDER BY known_mapping\.slug_priority, vehicle\.id/i);
  assert.match(reconciliation, /WHERE candidate_rank = 1/i);
  assert.match(reconciliation, /SET legacy_car_id = preferred_vehicle_match\.legacy_car_id/i);
  assert.doesNotMatch(reconciliation, /\b(?:published|status)\s*=/i);
});

test("new tenant, staff, verification, and document structures have rollback counterparts", () => {
  for (const name of [
    "rental_operators",
    "rental_operator_staff",
    "rental_operator_verifications",
    "rental_operator_documents",
  ]) {
    assert.match(up, new RegExp(`CREATE TABLE ${name} \\(`, "i"));
    assert.match(down, new RegExp(`DROP TABLE ${name}`, "i"));
  }
  assert.match(up, /BEGIN;[\s\S]*COMMIT;/i);
  assert.match(down, /BEGIN;[\s\S]*COMMIT;/i);
});

test("operator auth fields match the route contract and require staff password hashes", () => {
  assert.match(up, /verification_status rental_operator_verification_status NOT NULL DEFAULT 'draft'/i);
  assert.match(up, /password_hash text NOT NULL/i);
  assert.match(up, /active boolean NOT NULL DEFAULT false/i);
  assert.match(up, /CREATE TYPE rental_operator_staff_role AS ENUM \('owner', 'manager', 'counter', 'operations'\)/i);
  assert.match(up, /CHECK \(active = \(status = 'active'\)\)/i);
});

test("managed production guidance uses staged Publish diff and startup seeds platform tenant", () => {
  assert.match(readme, /Publish flow computes and applies the production schema diff/i);
  assert.match(readme, /Do not connect to managed production with `psql`/i);
  assert.match(readme, /nullable `operator_id` columns/i);
  assert.match(readme, /later schema release/i);
  assert.match(readme, /backfill does/i);
});

test("Drizzle ownership stays nullable for Publish and startup backfills transactionally before flag checks", () => {
  for (const schema of [vehicleSchema, addonSchema, reservationSchema, driverDocumentSchema]) {
    assert.match(schema, /operatorId: integer\("operator_id"\)\.references\(\(\) => rentalOperatorsTable\.id\)/);
  }
  assert.match(backfill, /await db\.transaction\(async \(tx\) =>/);
  for (const table of [
    "rentalVehiclesTable",
    "rentalAddonsTable",
    "rentalReservationsTable",
    "rentalDriverDocumentsTable",
  ]) {
    assert.match(backfill, new RegExp(`update\\(${table}\\)[\\s\\S]*?where\\(isNull\\(${table}\\.operatorId\\)\\)`));
  }
  assert.match(backfill, /RENTAL_MARKETPLACE_ENABLED\?\.trim\(\)\.toLowerCase\(\) === "true"/);
  assert.match(backfill, /Marketplace startup blocked: null operator ownership remains after platform backfill/);
  assert.match(backfill, /eq\(rentalAddonsTable\.operatorId, platformOperator\.id\)[\s\S]*?eq\(rentalAddonsTable\.name, addonDefault\.name\)/);
  assert.doesNotMatch(backfill, /\b(?:CREATE|ALTER)\s+TABLE\b/i);
});