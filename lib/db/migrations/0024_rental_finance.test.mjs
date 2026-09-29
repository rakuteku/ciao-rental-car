import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const up = await readFile(new URL("./0024_rental_finance.up.sql", import.meta.url), "utf8");
const down = await readFile(new URL("./0024_rental_finance.down.sql", import.meta.url), "utf8");
const handler = await readFile(
  new URL("../../../artifacts/api-server/src/routes/rental-finance.ts", import.meta.url),
  "utf8",
);
const app = await readFile(new URL("../../../artifacts/api-server/src/app.ts", import.meta.url), "utf8");

test("rental finance schema supports idempotent payment, refund, dispute and manual payout records", () => {
  for (const fragment of [
    "reservation_id integer NOT NULL UNIQUE",
    "idempotency_key text NOT NULL UNIQUE",
    "commission_basis_points integer NOT NULL",
    "operator_share_amount integer NOT NULL",
    "stripe_checkout_session_id text",
    "CREATE TABLE rental_refunds",
    "stripe_refund_id text",
    "CREATE TABLE rental_disputes",
    "stripe_dispute_id text NOT NULL UNIQUE",
    "CREATE TABLE rental_payouts",
    "'reported_manual'",
    "CREATE TABLE rental_stripe_events",
    "CREATE TABLE rental_reconciliation_failures",
  ]) assert.ok(up.includes(fragment), `missing finance migration fragment: ${fragment}`);
  assert.match(up, /BEGIN;[\s\S]*COMMIT;/i);
});

test("finance rollback drops only the finance ledger and its enums", () => {
  for (const table of [
    "rental_reconciliation_failures",
    "rental_stripe_events",
    "rental_payouts",
    "rental_disputes",
    "rental_refunds",
    "rental_payments",
  ]) assert.match(down, new RegExp(`DROP TABLE ${table}`, "i"));
  assert.match(down, /BEGIN;[\s\S]*COMMIT;/i);
});

test("Stripe webhook is registered with raw bytes before JSON body parsing", () => {
  const rawRoute = app.indexOf('"/api/rental/stripe/webhook"');
  const rawBody = app.indexOf('express.raw({ type: "application/json" })');
  const jsonBody = app.indexOf("app.use(express.json())");
  assert.ok(rawRoute >= 0 && rawBody > rawRoute && jsonBody > rawBody);
  assert.match(handler, /constructEvent\(req\.body,\s*signature,\s*secret\)/);
  assert.match(handler, /session\.payment_status === "paid"/);
  assert.match(handler, /isVehicleAvailable\(/);
  assert.match(handler, /rental-auto-refund-payment-/);
  assert.match(handler, /transferInitiated: false/);
});