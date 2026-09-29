import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const { outputFiles } = await build({
  entryPoints: [new URL("../src/lib/rental-trip-settlement.ts", import.meta.url).pathname],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const settlementModule = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`);

test("settlement allocates acknowledged extras and refunds from saved basis points", () => {
  const result = settlementModule.calculateTripSettlement({
    baseTotal: 10_000,
    baseCommission: 1_200,
    baseOperatorShare: 8_800,
    commissionBasisPoints: 1_200,
    approvedExtras: { damage: 1_000, fuel: 500 },
    processedRefund: 1_000,
    approvedRefund: 500,
  });
  assert.equal(result.extraTotal, 1_500);
  assert.equal(result.extraCommission, 180);
  assert.equal(result.extraOperatorShare, 1_320);
  assert.equal(result.processedRefundCommission, 120);
  assert.equal(result.processedRefundOperatorShare, 880);
  assert.equal(result.refundCommission, 60);
  assert.equal(result.refundOperatorShare, 440);
  assert.equal(result.finalTotal, 10_000);
  assert.equal(result.finalCommission, 1_200);
  assert.equal(result.finalOperatorShare, 8_800);
  assert.equal(result.finalCommission + result.finalOperatorShare, result.finalTotal);
});

test("settlement rejects unbalanced saved booking terms", () => {
  assert.throws(() => settlementModule.calculateTripSettlement({
    baseTotal: 10_000,
    baseCommission: 1_000,
    baseOperatorShare: 8_000,
    commissionBasisPoints: 1_000,
    approvedExtras: {},
    processedRefund: 0,
    approvedRefund: 0,
  }), /do not reconcile/);
});