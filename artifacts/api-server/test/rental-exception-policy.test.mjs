import assert from "node:assert/strict";
import test from "node:test";
import {
  canAcceptOperatorCancellationChoice,
  cancellationRefund,
  extensionQuoteMatches,
  isExtensionApproved,
  isQuoteLive,
  savedCancellationPercent,
} from "../src/lib/rental-exception-policy.mjs";

test("saved cancellation schedule selects highest applicable threshold without guessing free text", () => {
  const schedule = [{ daysBefore: 7, refundPercent: 100 }, { daysBefore: 3, refundPercent: 50 }, { daysBefore: 0, refundPercent: 0 }];
  const now = new Date("2030-01-01T00:00:00Z");
  assert.equal(savedCancellationPercent(schedule, new Date("2030-01-09T00:00:00Z"), now), 100);
  assert.equal(savedCancellationPercent(JSON.stringify(schedule), new Date("2030-01-05T00:00:00Z"), now), 50);
  assert.equal(savedCancellationPercent("Standard cancellation terms", new Date("2030-01-09T00:00:00Z"), now), null);
  assert.equal(savedCancellationPercent([{ daysBefore: 7, refundPercent: 100 }], new Date("2030-01-09T00:00:00Z"), now), null);
  assert.equal(savedCancellationPercent([{ daysBefore: 7, refundPercent: "unknown" }, { daysBefore: 0, refundPercent: 0 }], new Date("2030-01-09T00:00:00Z"), now), null);
});

test("refund quote rounds down and rejects invalid values", () => {
  assert.equal(cancellationRefund(1001, 50), 500);
  assert.throws(() => cancellationRefund(-1, 50), /invalid/);
});

test("exception quote expires at exact deadline", () => {
  const now = new Date("2030-01-01T00:00:00Z");
  assert.equal(isQuoteLive(new Date("2030-01-01T00:00:01Z"), now), true);
  assert.equal(isQuoteLive(now, now), false);
});

test("extension approval is bound to the quote version and changed reservation pricing invalidates it", () => {
  const snapshot = {
    quoteVersion: "ext-v1",
    vehicleId: 22,
    oldReturnAt: "2030-01-02T00:00:00.000Z",
    oldTotal: 10000,
    newTotal: 12000,
    additionalAmount: 2000,
    operatorApproval: {
      approved: true,
      quoteVersion: "ext-v1",
      approvedAt: "2030-01-01T00:00:00.000Z",
      staffId: 7,
    },
  };
  assert.equal(isExtensionApproved(snapshot), true);
  assert.equal(isExtensionApproved({ ...snapshot, quoteVersion: "ext-v2" }), false);
  assert.equal(isExtensionApproved({ ...snapshot, operatorApproval: { ...snapshot.operatorApproval, staffId: 0 } }), false);
  const current = {
    vehicleId: 22,
    returnAt: snapshot.oldReturnAt,
    finalTotal: 10000,
    newTotal: 12000,
    additionalAmount: 2000,
  };
  assert.equal(extensionQuoteMatches(snapshot, current), true);
  assert.equal(extensionQuoteMatches(snapshot, { ...current, finalTotal: 10500 }), false);
  assert.equal(extensionQuoteMatches(snapshot, { ...current, additionalAmount: 2500 }), false);
});

test("operator full-refund and alternate choices require customer consent and cannot switch after selection", () => {
  assert.equal(canAcceptOperatorCancellationChoice({ accepted: false, choice: "full_refund" }), false);
  assert.equal(canAcceptOperatorCancellationChoice({ accepted: true, choice: "full_refund" }), true);
  assert.equal(canAcceptOperatorCancellationChoice({ accepted: true, choice: "alternative" }), true);
  assert.equal(canAcceptOperatorCancellationChoice({
    accepted: true,
    choice: "full_refund",
    selectedChoice: "alternative",
  }), false);
  assert.equal(canAcceptOperatorCancellationChoice({
    accepted: true,
    choice: "alternative",
    selectedChoice: "full_refund",
  }), false);
});