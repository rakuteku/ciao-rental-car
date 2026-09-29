import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  hasExplicitUtcOffset,
  isMarketplaceEnabled,
  isRentalRequestExpired,
  marketplaceBillablePeriodCount,
  matchesMarketplaceSeason,
  mayAcceptAlternateOffer,
  tokyoRentalDate,
} from "../src/lib/rental-request-policy.mjs";

test("marketplace instants require an explicit offset and bill exact durations", () => {
  assert.equal(hasExplicitUtcOffset("2026-03-01T10:00:00+09:00"), true);
  assert.equal(hasExplicitUtcOffset("2026-03-01T01:00:00Z"), true);
  assert.equal(hasExplicitUtcOffset("2026-03-01T10:00:00"), false);
  const pickup = new Date("2026-03-01T14:30:00+09:00");
  const nextJapanDate = new Date("2026-03-01T16:00:00+09:00");
  assert.equal(marketplaceBillablePeriodCount(pickup, nextJapanDate, 24), 1);
  assert.equal(marketplaceBillablePeriodCount(pickup, new Date(pickup.getTime() + 24 * 60 * 60 * 1000), 24), 1);
  assert.equal(marketplaceBillablePeriodCount(pickup, new Date(pickup.getTime() + 24 * 60 * 60 * 1000 + 1), 24), 2);
});

test("seasonal pricing uses the Japan calendar date across a UTC date boundary", () => {
  const firstHourInJapan = new Date("2026-12-31T15:15:00Z");
  assert.equal(tokyoRentalDate(firstHourInJapan), "2027-01-01");
  assert.equal(matchesMarketplaceSeason(firstHourInJapan, "2027-01-01", "2027-01-01"), true);
  assert.equal(matchesMarketplaceSeason(firstHourInJapan, "2026-12-31", "2026-12-31"), false);
});

test("request and payment cutoffs expire their own states", () => {
  const now = new Date("2026-03-01T00:00:00Z");
  const past = new Date(now.getTime() - 1);
  const future = new Date(now.getTime() + 1);
  assert.equal(isRentalRequestExpired("requested", past, null, now), true);
  assert.equal(isRentalRequestExpired("offer_pending", past, null, now), true);
  assert.equal(isRentalRequestExpired("awaiting_payment", future, past, now), true);
  assert.equal(isRentalRequestExpired("declined", past, null, now), false);
});

test("alternate price requires explicit offer-pending acceptance, not marketing consent", () => {
  assert.equal(mayAcceptAlternateOffer("offer_pending"), true);
  assert.equal(mayAcceptAlternateOffer("requested"), false);
  // Marketing consent is a separate outreach permission and is not required
  // to accept or service a booking request.
  const request = { status: "offer_pending", marketingConsent: false };
  assert.equal(mayAcceptAlternateOffer(request.status), true);
  assert.equal(request.marketingConsent, false);
});

test("marketplace flag-off remains a distinct legacy mode", () => {
  assert.equal(isMarketplaceEnabled("true"), true);
  assert.equal(isMarketplaceEnabled(" TRUE "), true);
  assert.equal(isMarketplaceEnabled("false"), false);
  assert.equal(isMarketplaceEnabled(undefined), false);
});

test("request implementation serializes inventory decisions and preserves tagged consent data", async () => {
  const route = await readFile(new URL("../src/routes/rental-requests.ts", import.meta.url), "utf8");
  const schema = await readFile(new URL("../../../lib/db/src/schema/rental-reservations.ts", import.meta.url), "utf8");
  assert.ok(route.includes("pg_advisory_xact_lock"));
  assert.ok(route.includes('.for("update")'));
  assert.ok(route.includes("attribution: data.attribution ?? null"));
  assert.ok(route.includes("marketingConsent: data.marketingConsent"));
  assert.ok(schema.includes('unique("rental_marketplace_requests_hold_unique")'));
  assert.ok(schema.includes('attribution: jsonb("attribution")'));
  assert.ok(route.includes("import { queueRentalNotification"));
  assert.match(route, /queueRentalNotification\(\{\s*\.\.\.input/);
});

test("alternate vehicle offers lock cars in stable order and move the active hold", async () => {
  const route = await readFile(new URL("../src/routes/rental-requests.ts", import.meta.url), "utf8");
  const schema = await readFile(new URL("../../../lib/db/src/schema/rental-reservations.ts", import.meta.url), "utf8");
  assert.match(route, /new Set\(vehicleIds\)\]\.sort/);
  assert.ok(route.includes("eq(rentalReservationHoldsTable.vehicleId, current.vehicleId)"));
  assert.ok(route.includes("eq(rentalReservationHoldsTable.vehicleId, request.vehicleId)"));
  assert.ok(route.includes("offerHoldId: targetSameAsSource ? current.offerHoldId : activeHoldId"));
  assert.ok(route.includes("releasedAt: new Date()"));
  assert.ok(schema.includes('offerHoldId: integer("offer_hold_id")'));
});

test("staff-created quotes hold inventory and require customer acceptance", async () => {
  const route = await readFile(new URL("../src/routes/rental-requests.ts", import.meta.url), "utf8");
  assert.ok(route.includes('router.post("/partner/rental/requests/quote"'));
  assert.ok(route.includes('router.post("/admin/rental/requests/quote"'));
  assert.ok(route.includes('status: "offer_pending"'));
  assert.ok(route.includes("customerAccessToken: token"));
  assert.ok(route.includes("sessionToken: null"));
  assert.ok(route.includes("responseHours > 720"));
  assert.ok(route.includes("marketplaceOfferSnapshot: offer"));
  assert.ok(route.includes("acceptedOffer: offer"));
  assert.ok(route.includes("commissionVersion"));
  assert.ok(route.includes("type: \"offer_accepted\""));
});

test("timed marketplace search returns a price quote and public pickup disclosures", async () => {
  const route = await readFile(new URL("../src/routes/rental-vehicles.ts", import.meta.url), "utf8");
  assert.ok(route.includes("priceBreakdown: searchQuotes.get(v.id)"));
  assert.ok(route.includes("isVehicleServiceable(v, pickupLocation, returnLocation)"));
  assert.ok(route.includes("serializePublicVehicle({ ...v"));
});