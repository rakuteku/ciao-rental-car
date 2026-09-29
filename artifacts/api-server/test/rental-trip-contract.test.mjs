import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../src/routes/rental-trip.ts", import.meta.url), "utf8");
const storage = await readFile(new URL("../src/lib/rental-private-documents.ts", import.meta.url), "utf8");
const privateRoutes = await readFile(new URL("../src/routes/rental-private-documents.ts", import.meta.url), "utf8");
const legacy = await readFile(new URL("../src/routes/rental-reservations.ts", import.meta.url), "utf8");
const finance = await readFile(new URL("../src/routes/rental-finance.ts", import.meta.url), "utf8");
const schema = await readFile(new URL("../../../lib/db/src/schema/rental-operations.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../../../lib/db/migrations/0026_rental_trip_handover.up.sql", import.meta.url), "utf8");

test("trip pickup blocks missing payment, every original-driver check, agreement and private photos", () => {
  assert.match(route, /reservation\.paymentStatus !== "paid"/);
  assert.match(route, /driver\.licenseOriginalVerified \?\? driver\.originalsVerified/);
  assert.match(route, /driver\.identityOriginalVerified \?\? driver\.originalsVerified/);
  assert.match(route, /driver\.idpOriginalVerified \?\? driver\.originalsVerified/);
  assert.match(route, /driver:\$\{driver\.driverId\}:originalLicense/);
  assert.match(route, /driver:\$\{driver\.driverId\}:originalIdentity/);
  assert.match(route, /agreementAccepted: z\.literal\(true\)/);
  assert.match(route, /signatureReference: z\.string\(\)\.trim\(\)\.min\(1\)/);
  assert.match(route, /exteriorPhotos: z\.array\(z\.string\(\)\.uuid\(\)\)\.min\(1\)/);
  assert.match(route, /interiorPhotos: z\.array\(z\.string\(\)\.uuid\(\)\)\.min\(1\)/);
  assert.match(route, /Every photo must be uploaded privately before inspection submission/);
  assert.match(schema, /originalsVerifiedAt: timestamp\("originals_verified_at"/);
  assert.doesNotMatch(route, /approvedDriversLicense/);
});

test("disabling marketplace trip routes does not intercept legacy rental routes", () => {
  assert.match(route, /if \(!isRentalMarketplaceEnabled\(\)\) \{\s*\/\/[^\n]*\n\s*next\("router"\)/);
  assert.doesNotMatch(route, /if \(!isRentalMarketplaceEnabled\(\)\) \{\s*res\.status\(404\)/);
});

test("tenant, admin, and customer reads are explicitly scoped", () => {
  assert.match(route, /eq\(rentalReservationsTable\.operatorId, current\.operatorId\)/);
  assert.match(route, /reservation\.operatorId !== partnerIdentity\(req\)\.operatorId/);
  assert.match(route, /eq\(rentalOperatorStaffTable\.operatorId, partner\.operatorId\)/);
  assert.match(route, /session\.rentalCustomerBookingId === id\.data/);
  assert.match(route, /eq\(rentalDriversTable\.id, reservation\.primaryDriverId\)/);
  assert.match(route, /router\.get\("\/admin\/rental\/reservations\/:id\/trip", requireAdminAuth/);
  assert.match(route, /This staff role is read-only for rental handover and settlement/);
  assert.match(privateRoutes, /driverId: z\.number\(\)\.int\(\)\.positive\(\)\.optional\(\)/);
  assert.match(privateRoutes, /driverAuthorizedForReservation\(reservationId, document\.driverId\)/);
  assert.match(privateRoutes, /commitDriverId !== document\.driverId/);
});

test("photo upload is server-issued private evidence, never a public URL", () => {
  assert.match(route, /inspection-photos\/upload-request/);
  assert.match(route, /inspection-photos\/:token\/content/);
  assert.match(route, /receiveRentalInspectionUpload\(rentalInspectionObjectName/);
  assert.match(route, /storageKey: token/);
  assert.match(route, /contentPath: photo\.storageKey \? `\/api\/rental\/inspection-evidence/);
  assert.match(storage, /\/rental-inspection-evidence\/\$\{reservationId\}\/\$\{token\}/);
  assert.match(storage, /RENTAL_INSPECTION_EVIDENCE_RETENTION_DAYS/);
});

test("partner document review and private stream are tenant-scoped and role-gated", () => {
  assert.match(route, /documents: publicDocumentMetadata/);
  assert.match(route, /fileAvailable: hasPrivateFile/);
  assert.match(route, /operatorNotes: document\.adminNotes/);
  assert.match(route, /driver-documents\/:documentId\/content/);
  assert.match(route, /driver-documents\/:documentId\/review/);
  assert.match(route, /z\.enum\(\["approved", "rejected", "resubmit_required"\]\)/);
  assert.match(route, /partnerCanManageTrip\(req, res\)/);
  assert.match(route, /eq\(rentalDriverDocumentsTable\.operatorId, current\.operatorId\)/);
  assert.match(route, /streamRentalDocument\(rentalDocumentObjectName/);
  assert.doesNotMatch(route, /fileUrl: document\.fileUrl/);
});

test("trip progression locks reservation and rejects incomplete or repeated inspections", () => {
  assert.ok((route.match(/\.for\("update"\)/g) ?? []).length >= 3);
  assert.match(route, /Pickup inspection is immutable and already completed/);
  assert.match(route, /Return inspection is immutable and already completed/);
  assert.match(route, /A completed pickup inspection is required before return/);
  assert.match(route, /A completed return inspection is required before close/);
  assert.match(legacy, /Marketplace trip status must be changed through the gated trip workflow/);
});

test("unreviewed extras remain provisional and settlement uses persisted commission snapshot", () => {
  assert.match(route, /kind: "provisional_charge", code, amount, status: "provisional"/);
  assert.match(route, /if \(amount > \(provisional\.get\(code\) \?\? 0\)\)/);
  assert.match(route, /const savedCommission = payment\.commissionAmount/);
  assert.match(route, /const savedShare = payment\.operatorShareAmount/);
  assert.match(route, /customer acknowledges the exact amount/);
  assert.match(route, /charges\/acknowledge/);
  assert.match(route, /kind: "condition_difference"/);
  assert.match(route, /entryType: "platform_commission"/);
  assert.match(route, /entryType: "operator_share"/);
  assert.match(route, /status: "pending_collection"/);
  assert.match(route, /status: "pending_payment"/);
  assert.match(route, /sharesReconcile: commission \+ operatorShare === finalTotal/);
  assert.match(finance, /eq\(rentalTripLedgerTable\.operatorId, operatorId\)/);
  assert.match(finance, /tripSettlement: \{/);
});

test("trip migration is transactional and backfills existing authorized drivers", () => {
  assert.match(migration, /^--.*\n--.*\nBEGIN;[\s\S]*COMMIT;\s*$/);
  assert.match(migration, /CREATE TABLE rental_reservation_drivers/);
  assert.match(migration, /jsonb_array_elements\(request\.additional_drivers\)/);
  assert.match(migration, /CREATE TABLE rental_trip_ledger/);
});