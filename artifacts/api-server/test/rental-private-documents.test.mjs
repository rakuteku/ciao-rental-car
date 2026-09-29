import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isAllowedRentalDocumentContentType,
  parseRentalPrivateReference,
  rentalMarketplaceEnabled,
  rentalPrivateReference,
} from "../src/lib/rental-private-document-policy.mjs";

test("rental document access is off unless explicitly enabled", () => {
  const original = process.env.RENTAL_MARKETPLACE_ENABLED;
  delete process.env.RENTAL_MARKETPLACE_ENABLED;
  assert.equal(rentalMarketplaceEnabled(), false);
  process.env.RENTAL_MARKETPLACE_ENABLED = "true";
  assert.equal(rentalMarketplaceEnabled(), true);
  process.env.RENTAL_MARKETPLACE_ENABLED = "TRUE";
  assert.equal(rentalMarketplaceEnabled(), true);
  if (original === undefined) delete process.env.RENTAL_MARKETPLACE_ENABLED;
  else process.env.RENTAL_MARKETPLACE_ENABLED = original;
});

test("only opaque UUID storage references are accepted", () => {
  const token = "40f33f55-b920-4f90-9cae-cb4c2497e5b6";
  assert.equal(parseRentalPrivateReference(rentalPrivateReference(token)), token);
  assert.equal(parseRentalPrivateReference("https://example.com/driver-license.pdf"), null);
  assert.equal(parseRentalPrivateReference("rental-private://../../public/file"), null);
});

test("private rental uploads accept only supported document MIME types", () => {
  assert.equal(isAllowedRentalDocumentContentType("application/pdf"), true);
  assert.equal(isAllowedRentalDocumentContentType("image/jpeg"), true);
  assert.equal(isAllowedRentalDocumentContentType("image/png"), true);
  assert.equal(isAllowedRentalDocumentContentType("text/html"), false);
  assert.equal(isAllowedRentalDocumentContentType("image/svg+xml"), false);
});