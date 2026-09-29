import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("rental exceptions migration protects claim statuses and provider charging", async () => {
  const migration = await readFile(new URL("./0028_rental_exceptions.up.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE rental_incidents/);
  assert.match(migration, /unsafe_vehicle boolean NOT NULL DEFAULT false/);
  assert.match(migration, /CREATE TABLE rental_claims/);
  assert.match(migration, /CREATE TABLE rental_claim_items/);
  assert.match(migration, /pending_platform_review/);
  assert.match(migration, /provider_charge_status text NOT NULL DEFAULT 'not_configured'/);
  assert.match(migration, /CHECK \(provider_charge_status IN \('not_configured','not_charged'\)\)/);
  assert.match(migration, /CREATE TABLE rental_exception_evidence/);
  assert.match(migration, /CREATE TABLE rental_exception_events/);
  assert.match(migration, /evidence_kind IN \('incident','pickup','return','invoice','insurer','customer_response'\)/);
});

test("exception routes keep evidence private and never fabricate a charge", async () => {
  const route = await readFile(new URL("../../../artifacts/api-server/src/routes/rental-exceptions.ts", import.meta.url), "utf8");
  assert.match(route, /receiveRentalDocumentUpload/);
  assert.match(route, /streamRentalDocument/);
  assert.match(route, /actorFor\(req, reservation\)/);
  assert.match(route, /requireAdminAuth/);
  assert.match(route, /blocked_pending_platform_approval/);
  assert.match(route, /Each claim item needs uploaded private evidence before platform approval/);
  assert.match(route, /providerChargeStatus: "not_configured"/);
  assert.match(route, /eq\(rentalOperatorsTable\.isPlatform, true\)/);
  assert.match(route, /next\("router"\)/);
  assert.doesNotMatch(route, /stripe\.paymentIntents\.create|stripe\.charges\.create/);
});