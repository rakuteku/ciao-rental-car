import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { usesMarketplaceExceptions } from "../../ciao-rental/src/lib/rental-exception-rollout.mjs";

test("marketplace flag does not replace cancellation for an existing legacy booking", async () => {
  for (const source of ["website", "manual"]) {
    assert.equal(usesMarketplaceExceptions(true, source), false, `${source} retains legacy actions with flag on`);
    assert.equal(usesMarketplaceExceptions(false, source), false);
  }
  assert.equal(usesMarketplaceExceptions(true, "marketplace_request"), true);
  assert.equal(usesMarketplaceExceptions(false, "marketplace_request"), false);

  const page = await readFile(new URL("../../ciao-rental/src/pages/rentalcar/my-bookings/detail.tsx", import.meta.url), "utf8");
  assert.match(page, /!\s*marketplaceBookingEnabled\s*&&\s*\(/, "legacy cancel action stays available");
  assert.match(page, /marketplaceBookingEnabled\s*&&\s*<RentalExceptionsPanel/, "exception actions are limited to marketplace reservations");
});