import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import express from "express";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const apiDir = new URL("..", import.meta.url);
const schemaIndex = new URL("../../../lib/db/src/schema/index.ts", import.meta.url);

const drizzleMock = `
function field(column) {
  return Object.keys(column.table ?? {}).find((key) => column.table[key] === column) ?? column.name;
}
export const eq = (column, value) => ({ kind: "eq", field: field(column), value });
export const and = (...conditions) => ({ kind: "and", conditions: conditions.flat().filter(Boolean) });
export const or = (...conditions) => ({ kind: "or", conditions: conditions.flat().filter(Boolean) });
export const lte = (column, value) => ({ kind: "lte", field: field(column), value });
export const inArray = (column, values) => ({ kind: "inArray", field: field(column), values });
export const isNull = (column) => ({ kind: "isNull", field: field(column) });
export const asc = (column) => ({ kind: "sort", field: field(column), direction: 1 });
export const desc = (column) => ({ kind: "sort", field: field(column), direction: -1 });
export const sum = (column) => ({ kind: "sum", field: field(column) });
export const sql = (chunks, ...values) => ({ kind: "sql", text: chunks.join("?"), values });
sql.raw = (text) => ({ kind: "raw", text });
`;

function tableName(table) {
  return table[Symbol.for("drizzle:Name")];
}

function fieldName(column) {
  return Object.keys(column.table ?? {}).find((key) => column.table[key] === column) ?? column.name;
}

function matches(row, condition) {
  if (!condition) return true;
  if (condition.kind === "and") return condition.conditions.every((item) => matches(row, item));
  if (condition.kind === "or") return condition.conditions.some((item) => matches(row, item));
  if (condition.kind === "eq") return row[condition.field] === condition.value;
  if (condition.kind === "lte") return row[condition.field] <= condition.value;
  if (condition.kind === "inArray") return condition.values.includes(row[condition.field]);
  if (condition.kind === "isNull") return row[condition.field] == null;
  return false;
}

function makeMemoryDb() {
  const rows = new Map();
  const ids = new Map();
  const tableRows = (table) => {
    const name = tableName(table);
    if (!rows.has(name)) rows.set(name, []);
    return rows.get(name);
  };
  const project = (row, selection, sourceRows = [row]) => selection
    ? Object.fromEntries(Object.entries(selection).map(([key, column]) => [
      key,
      column.kind === "sum"
        ? sourceRows.reduce((total, item) => total + Number(item[column.field] ?? 0), 0) || null
        : row[fieldName(column)],
    ]))
    : { ...row };
  const conflicts = (name, existing, value) => {
    const fields = name === "rental_stripe_events" ? ["id"]
      : name === "rental_notifications" ? ["dedupeKey"]
        : name === "rental_refunds" ? ["stripeRefundId", "idempotencyKey"]
          : name === "rental_payments" ? ["idempotencyKey"] : [];
    return fields.some((field) => value[field] != null && existing[field] === value[field]);
  };
  const applyInsert = (table, values, ignoreConflicts = false) => {
    const name = tableName(table);
    const inserted = [];
    for (const value of (Array.isArray(values) ? values : [values])) {
      const record = { ...value };
      if (record.id == null && name !== "rental_settings") {
        const id = (ids.get(name) ?? 0) + 1;
        ids.set(name, id);
        record.id = id;
      }
      if (name === "rental_stripe_events") {
        record.attempts ??= 1;
        record.status ??= "processing";
        record.receivedAt ??= new Date();
      }
      if (ignoreConflicts && tableRows(table).some((row) => conflicts(name, row, record))) continue;
      tableRows(table).push(record);
      inserted.push({ ...record });
    }
    return inserted;
  };
  const db = {
    select: (selection) => ({
      source: null,
      condition: null,
      from(table) { this.source = table; return this; },
      where(condition) { this.condition = condition; return this; },
      limit() { return this; },
      for() { return this; },
      then(resolve, reject) {
        try {
          const filtered = tableRows(this.source).filter((row) => matches(row, this.condition));
          if (selection && Object.values(selection).some((column) => column.kind === "sum")) {
            resolve([project({}, selection, filtered)]);
          } else {
            resolve(filtered.map((row) => project(row, selection)));
          }
        } catch (error) { reject(error); }
      },
    }),
    insert: (table) => ({
      values(value) { this.value = value; return this; },
      onConflictDoNothing() { this.ignoreConflicts = true; return this; },
      returning(selection) { this.selection = selection; return this; },
      then(resolve, reject) {
        try {
          resolve(applyInsert(table, this.value, this.ignoreConflicts)
            .map((row) => project(row, this.selection)));
        } catch (error) { reject(error); }
      },
    }),
    update: (table) => ({
      set(values) { this.values = values; return this; },
      where(condition) { this.condition = condition; return this; },
      returning(selection) { this.selection = selection; return this; },
      then(resolve, reject) {
        try {
          const updated = [];
          for (const row of tableRows(table)) {
            if (!matches(row, this.condition)) continue;
            Object.assign(row, this.values);
            updated.push(project(row, this.selection));
          }
          resolve(updated);
        } catch (error) { reject(error); }
      },
    }),
    transaction: async (callback) => callback(db),
    execute: async () => undefined,
  };
  return {
    db,
    rows,
    seed(name, entries) { rows.set(name, entries.map((entry) => ({ ...entry }))); },
  };
}

test("checkout and webhook enforce Stripe credentials and signatures", async (t) => {
  const fixture = await createFinanceFixture(t);
  process.env.RENTAL_MARKETPLACE_ENABLED = "true";
  process.env.RENTAL_PUBLIC_BASE_URL = "https://rentals.example.invalid";
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;

  const checkout = await fixture.request(
    "/rental/requests/55/checkout?accessCode=customer-token",
    "POST",
    {},
  );
  assert.equal(checkout.status, 503);
  assert.match((await checkout.json()).error, /both STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET/);

  process.env.STRIPE_SECRET_KEY = "sk_test_mock";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_mock";
  const invalidWebhook = await fixture.webhook({ id: "evt-invalid", type: "ignored" }, "bad-signature");
  assert.equal(invalidWebhook.status, 400);
  assert.deepEqual(await invalidWebhook.json(), { error: "Invalid Stripe webhook signature" });
});

test("provider webhook is idempotent, ignores stale checkout events, and reconciles refunds", async (t) => {
  const fixture = await createFinanceFixture(t);
  process.env.STRIPE_SECRET_KEY = "sk_test_mock";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_mock";
  process.env.RENTAL_PUBLIC_BASE_URL = "https://rentals.example.invalid";
  const event = {
    id: "evt-checkout-paid",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_55",
        payment_intent: "pi_test_55",
        payment_status: "paid",
        amount_total: 1000,
        currency: "jpy",
        metadata: { rentalPaymentId: "55" },
      },
    },
  };
  const paidResponse = await fixture.webhook(event);
  assert.equal(paidResponse.status, 200);
  assert.equal(fixture.row("rental_payments", 55).status, "paid");
  assert.equal(fixture.row("rental_reservations", 65).status, "confirmed");

  const duplicateResponse = await fixture.webhook(event);
  assert.equal(duplicateResponse.status, 200);
  assert.deepEqual(await duplicateResponse.json(), { received: true, duplicate: true });
  assert.equal(fixture.memory.rows.get("rental_notifications").length, 3);

  const staleFailure = await fixture.webhook({
    id: "evt-checkout-failure-late",
    type: "checkout.session.async_payment_failed",
    data: { object: event.data.object },
  });
  assert.equal(staleFailure.status, 200);
  assert.equal(fixture.row("rental_payments", 55).status, "paid");
  assert.equal(fixture.row("rental_reservations", 65).status, "confirmed");

  const refundResponse = await fixture.webhook({
    id: "evt-refund-succeeded",
    type: "refund.created",
    data: {
      object: {
        id: "re_test_55",
        payment_intent: "pi_test_55",
        charge: "ch_test_55",
        amount: 250,
        currency: "jpy",
        status: "succeeded",
        metadata: { rentalPaymentId: "55" },
      },
    },
  });
  assert.equal(refundResponse.status, 200);
  assert.equal(
    fixture.row("rental_payments", 55).status,
    "partially_refunded",
    JSON.stringify({
      payment: fixture.row("rental_payments", 55),
      refunds: fixture.memory.rows.get("rental_refunds"),
      failures: fixture.memory.rows.get("rental_reconciliation_failures"),
    }),
  );
  assert.equal(fixture.row("rental_payments", 55).refundedAmount, 250);
  assert.equal(fixture.row("rental_reservations", 65).paymentStatus, "partially_refunded");
  assert.equal(fixture.memory.rows.get("rental_refunds").length, 1);
  assert.equal(fixture.memory.rows.get("rental_notifications").length, 5);
});

test("an older pending refund event cannot undo a succeeded refund or restore payout share", async (t) => {
  const fixture = await createFinanceFixture(t);
  process.env.STRIPE_SECRET_KEY = "sk_test_mock";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_mock";
  process.env.RENTAL_MARKETPLACE_ENABLED = "true";
  const paid = await fixture.webhook({
    id: "evt-payment-before-refund-order",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_55",
        payment_intent: "pi_test_55",
        payment_status: "paid",
        amount_total: 1000,
        currency: "jpy",
        metadata: { rentalPaymentId: "55" },
      },
    },
  });
  assert.equal(paid.status, 200);
  const refund = {
    id: "re_ordered_55",
    payment_intent: "pi_test_55",
    charge: "ch_test_55",
    amount: 250,
    currency: "jpy",
    metadata: { rentalPaymentId: "55" },
  };

  const succeeded = await fixture.webhook({
    id: "evt-refund-succeeded-first",
    type: "refund.updated",
    data: { object: { ...refund, status: "succeeded" } },
  });
  assert.equal(succeeded.status, 200);
  const stalePending = await fixture.webhook({
    id: "evt-refund-pending-later",
    type: "refund.created",
    data: { object: { ...refund, status: "pending" } },
  });
  assert.equal(stalePending.status, 200);

  const storedRefund = fixture.memory.rows.get("rental_refunds")
    .find((row) => row.stripeRefundId === refund.id);
  assert.equal(storedRefund.amount, 250);
  assert.equal(storedRefund.status, "succeeded");
  assert.equal(fixture.row("rental_payments", 55).refundedAmount, 250);
  assert.equal(fixture.row("rental_payments", 55).status, "partially_refunded");

  const payoutResponse = await fixture.request(
    "/admin/rental/finance/55/payout",
    "POST",
    { reference: "reduced-share-after-refund" },
  );
  assert.equal(payoutResponse.status, 201);
  const payout = await payoutResponse.json();
  assert.equal(payout.payout.amount, 675, "the 25% refund must reduce a JPY 900 operator share by JPY 225");
});

test("conflicting refund metadata and provider references reconcile without changing either ledger", async (t) => {
  const fixture = await createFinanceFixture(t);
  process.env.STRIPE_SECRET_KEY = "sk_test_mock";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_mock";
  fixture.memory.rows.get("rental_payments").push({
    ...fixture.row("rental_payments", 55),
    id: 56,
    requestId: 46,
    reservationId: 66,
    stripeCheckoutSessionId: "cs_test_56",
    stripePaymentIntentId: "pi_test_56",
    stripeChargeId: "ch_test_56",
  });
  const mismatch = await fixture.webhook({
    id: "evt-refund-reference-conflict",
    type: "refund.created",
    data: {
      object: {
        id: "re_conflicting_refs",
        payment_intent: "pi_test_56",
        charge: "ch_test_56",
        amount: 100,
        currency: "jpy",
        status: "succeeded",
        metadata: { rentalPaymentId: "55" },
      },
    },
  });

  assert.equal(mismatch.status, 200);
  assert.equal(fixture.row("rental_payments", 55).status, "checkout_open");
  assert.equal(fixture.row("rental_payments", 55).refundedAmount, 0);
  assert.equal(fixture.row("rental_payments", 56).status, "checkout_open");
  assert.equal(fixture.row("rental_payments", 56).refundedAmount, 0);
  assert.equal(fixture.memory.rows.get("rental_refunds").length, 0);
  assert.ok(fixture.memory.rows.get("rental_reconciliation_failures")
    .some((failure) => failure.stripeEventId === "evt-refund-reference-conflict"));
});

test("async Stripe refunds reconcile linked cancellation exceptions and reject cross-linked metadata", async (t) => {
  const fixture = await createFinanceFixture(t);
  process.env.STRIPE_SECRET_KEY = "sk_test_mock";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_mock";
  process.env.RENTAL_MARKETPLACE_ENABLED = "true";
  const paid = await fixture.webhook({
    id: "evt-cancellation-payment-paid",
    type: "checkout.session.completed",
    data: { object: {
      id: "cs_test_55",
      payment_intent: "pi_test_55",
      payment_status: "paid",
      amount_total: 1000,
      currency: "jpy",
      metadata: { rentalPaymentId: "55" },
    } },
  });
  assert.equal(paid.status, 200);

  fixture.memory.seed("rental_reservation_exceptions", [
    {
      id: 88, reservationId: 65, operatorId: 7, kind: "cancellation",
      status: "refund_pending", quotedAmount: 250, refundAmount: 250,
      stripeRefundId: null, providerStatus: "pending",
      quoteSnapshot: { paymentId: 55, refundAmount: 250 },
    },
    {
      id: 89, reservationId: 65, operatorId: 7, kind: "cancellation",
      status: "refund_pending", quotedAmount: 150, refundAmount: 150,
      stripeRefundId: null, providerStatus: "pending",
      quoteSnapshot: { paymentId: 55, refundAmount: 150 },
    },
    {
      id: 90, reservationId: 65, operatorId: 7, kind: "cancellation",
      status: "refund_pending", quotedAmount: 250, refundAmount: 250,
      stripeRefundId: null, providerStatus: "pending",
      quoteSnapshot: { paymentId: 55, refundAmount: 250 },
    },
    {
      id: 91, reservationId: 65, operatorId: 7, kind: "cancellation",
      status: "refund_pending", quotedAmount: 50, refundAmount: 50,
      stripeRefundId: "re_cancel_by_provider_ref", providerStatus: "pending",
      quoteSnapshot: { paymentId: 55, refundAmount: 50 },
    },
    {
      id: 92, reservationId: 65, operatorId: 7, kind: "cancellation",
      status: "cancelled", quotedAmount: 100, refundAmount: 0,
      stripeRefundId: null, providerStatus: "operator_waived_refund",
      quoteSnapshot: { paymentId: 55, refundAmount: 0 },
    },
    {
      id: 93, reservationId: 65, operatorId: 7, kind: "cancellation",
      status: "refund_pending", quotedAmount: 75, refundAmount: 75,
      stripeRefundId: null, providerStatus: "pending",
      quoteSnapshot: { paymentId: 55, refundAmount: 75, operatorInitiated: true },
    },
  ]);
  fixture.memory.seed("rental_refunds", [
    {
      id: 901, paymentId: 55, amount: 250, currency: "jpy", status: "pending",
      stripeRefundId: null, idempotencyKey: "rental-cancellation-exception-88",
    },
    {
      id: 902, paymentId: 55, amount: 150, currency: "jpy", status: "pending",
      stripeRefundId: null, idempotencyKey: "rental-cancellation-exception-89",
    },
    {
      id: 903, paymentId: 55, amount: 250, currency: "jpy", status: "pending",
      stripeRefundId: null, idempotencyKey: "rental-cancellation-exception-90",
    },
    {
      id: 904, paymentId: 55, amount: 50, currency: "jpy", status: "pending",
      stripeRefundId: "re_cancel_by_provider_ref", idempotencyKey: "rental-cancellation-exception-91",
    },
    {
      id: 905, paymentId: 55, amount: 100, currency: "jpy", status: "pending",
      stripeRefundId: null, idempotencyKey: "rental-cancellation-exception-92",
    },
    {
      id: 906, paymentId: 55, amount: 75, currency: "jpy", status: "pending",
      stripeRefundId: null, idempotencyKey: "rental-cancellation-operator-93",
    },
  ]);
  const sendRefund = (eventId, refund) => fixture.webhook({
    id: eventId,
    type: "refund.updated",
    data: { object: refund },
  });
  const successRefund = {
    id: "re_cancel_success",
    payment_intent: "pi_test_55",
    charge: "ch_test_55",
    amount: 250,
    currency: "jpy",
    metadata: { rentalPaymentId: "55", rentalRefundId: "901", rentalExceptionId: "88" },
  };
  const failureRefund = {
    id: "re_cancel_failure",
    payment_intent: "pi_test_55",
    charge: "ch_test_55",
    amount: 150,
    currency: "jpy",
    metadata: { rentalPaymentId: "55", rentalRefundId: "902", rentalExceptionId: "89" },
  };

  assert.equal((await sendRefund("evt-cancel-refund-success", { ...successRefund, status: "succeeded" })).status, 200);
  assert.equal((await sendRefund("evt-cancel-refund-failure", { ...failureRefund, status: "failed" })).status, 200);
  assert.equal(fixture.row("rental_reservation_exceptions", 88).status, "cancelled");
  assert.equal(fixture.row("rental_reservation_exceptions", 88).providerStatus, "succeeded");
  assert.equal(fixture.row("rental_reservation_exceptions", 89).status, "refund_failed");
  assert.equal(fixture.row("rental_reservation_exceptions", 89).providerStatus, "failed");

  assert.equal((await sendRefund("evt-cancel-success-stale-pending", { ...successRefund, status: "pending" })).status, 200);
  assert.equal((await sendRefund("evt-cancel-failure-stale-pending", { ...failureRefund, status: "pending" })).status, 200);
  assert.equal(fixture.row("rental_reservation_exceptions", 88).status, "cancelled");
  assert.equal(fixture.row("rental_reservation_exceptions", 89).status, "refund_failed");

  assert.equal((await sendRefund("evt-cancel-refund-provider-link", {
    id: "re_cancel_by_provider_ref",
    payment_intent: "pi_test_55",
    charge: "ch_test_55",
    amount: 50,
    currency: "jpy",
    status: "succeeded",
    metadata: { rentalPaymentId: "55" },
  })).status, 200);
  assert.equal(fixture.row("rental_reservation_exceptions", 91).status, "cancelled");

  const crossLinked = await sendRefund("evt-cancel-refund-cross-link", {
    ...successRefund,
    id: "re_cancel_cross_link",
    metadata: { rentalPaymentId: "55", rentalRefundId: "901", rentalExceptionId: "90" },
  });
  assert.equal(crossLinked.status, 200);
  assert.equal(fixture.row("rental_reservation_exceptions", 90).status, "refund_pending");
  assert.equal(fixture.row("rental_reservation_exceptions", 90).stripeRefundId, null);

  assert.equal((await sendRefund("evt-cancel-waiver-preserved", {
    id: "re_cancel_after_waiver",
    payment_intent: "pi_test_55",
    charge: "ch_test_55",
    amount: 100,
    currency: "jpy",
    status: "succeeded",
    metadata: { rentalPaymentId: "55", rentalRefundId: "905", rentalExceptionId: "92" },
  })).status, 200);
  assert.equal(fixture.row("rental_reservation_exceptions", 92).status, "cancelled");
  assert.equal(fixture.row("rental_reservation_exceptions", 92).providerStatus, "operator_waived_refund");

  const operatorRefund = {
    id: "re_operator_cancel", payment_intent: "pi_test_55", charge: "ch_test_55",
    amount: 75, currency: "jpy",
    metadata: { rentalPaymentId: "55", rentalRefundId: "906", rentalExceptionId: "93" },
  };
  assert.equal((await sendRefund("evt-operator-cancel-failed", { ...operatorRefund, status: "failed" })).status, 200);
  assert.equal(fixture.row("rental_reservation_exceptions", 93).status, "refund_failed");
  assert.equal((await sendRefund("evt-operator-cancel-success", { ...operatorRefund, status: "succeeded" })).status, 200);
  assert.equal(fixture.row("rental_reservation_exceptions", 93).status, "cancelled");
  assert.equal((await sendRefund("evt-operator-cancel-pending-late", { ...operatorRefund, status: "pending" })).status, 200);
  assert.equal(fixture.row("rental_reservation_exceptions", 93).status, "cancelled");
});

test("a delayed pending exception-payment refund cannot undo a completed refund", async (t) => {
  const fixture = await createFinanceFixture(t);
  process.env.STRIPE_SECRET_KEY = "sk_test_mock";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_mock";
  process.env.RENTAL_MARKETPLACE_ENABLED = "true";
  const completedAt = new Date("2026-01-01T00:00:00Z");
  fixture.memory.seed("rental_reservation_exceptions", [{
    id: 94, reservationId: 65, operatorId: 7, kind: "extension",
    status: "cancelled", quotedAmount: 80, refundAmount: 80,
    stripePaymentIntentId: "pi_exception_94", stripeRefundId: "re_exception_94",
    providerStatus: "succeeded", completedAt,
  }]);
  const refund = {
    id: "re_exception_94", payment_intent: "pi_exception_94",
    amount: 80, currency: "jpy",
    metadata: { rentalExceptionId: "94", rentalReservationId: "65" },
  };
  const response = await fixture.webhook({
    id: "evt-old-exception-pending",
    type: "refund.updated",
    data: { object: { ...refund, status: "pending" } },
  });
  assert.equal(response.status, 200);
  const exception = fixture.row("rental_reservation_exceptions", 94);
  assert.equal(exception.status, "cancelled");
  assert.equal(exception.providerStatus, "succeeded");
  assert.equal(new Date(exception.completedAt).toISOString(), completedAt.toISOString());
});

async function createFinanceFixture(t) {
  const temporaryDir = await mkdtemp(path.join(apiDir.pathname, ".payment-boundaries-"));
  const bundlePath = path.join(temporaryDir, "rental-finance.mjs");
  const memory = makeMemoryDb();
  globalThis.__paymentBoundaryTestDb = memory.db;
  const originalEnv = Object.fromEntries([
    "RENTAL_MARKETPLACE_ENABLED",
    "RENTAL_PUBLIC_BASE_URL",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
  ].map((key) => [key, process.env[key]]));

  const entry = `
    import finance, { rentalStripeWebhookHandler } from ${JSON.stringify(new URL("./src/routes/rental-finance.ts", apiDir).pathname)};
    export { finance, rentalStripeWebhookHandler };
  `;
  await build({
    stdin: { contents: entry, resolveDir: new URL("./src", apiDir).pathname, sourcefile: "payment-boundaries-entry.ts" },
    outfile: bundlePath,
    bundle: true,
    platform: "node",
    format: "esm",
    external: ["express"],
    plugins: [{
      name: "isolated-payment-dependencies",
      setup(buildApi) {
        buildApi.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "mock-db", namespace: "payment-test" }));
        buildApi.onLoad({ filter: /^mock-db$/, namespace: "payment-test" }, () => ({
          contents: `export * from ${JSON.stringify(schemaIndex.pathname)}; export const db = globalThis.__paymentBoundaryTestDb;`,
          loader: "js",
          resolveDir: path.dirname(schemaIndex.pathname),
        }));
        buildApi.onResolve({ filter: /^drizzle-orm$/ }, (args) =>
          args.importer.includes("/node_modules/") ? undefined : ({ path: "mock-drizzle", namespace: "payment-test" }));
        buildApi.onLoad({ filter: /^mock-drizzle$/, namespace: "payment-test" }, () => ({
          contents: drizzleMock,
          loader: "js",
        }));
        buildApi.onResolve({ filter: /^stripe$/ }, () => ({ path: "mock-stripe", namespace: "payment-test" }));
        buildApi.onLoad({ filter: /^mock-stripe$/, namespace: "payment-test" }, () => ({
          contents: `
            export default class Stripe {
              constructor() {
                this.webhooks = {
                  constructEvent(body, signature, secret) {
                    if (signature !== "valid-signature" || secret !== "whsec_mock") throw new Error("signature mismatch");
                    return JSON.parse(body.toString("utf8"));
                  },
                };
                this.paymentIntents = { retrieve: async () => ({ latest_charge: null }) };
                this.refunds = { create: async () => ({ id: "re_auto", status: "succeeded" }) };
                this.disputes = { retrieve: async (id) => ({ id, status: "needs_response" }) };
                this.charges = { retrieve: async () => ({ refunds: { data: [] } }) };
              }
            }
          `,
          loader: "js",
        }));
        buildApi.onResolve({ filter: /rental-events$/ }, () => ({ path: "mock-events", namespace: "payment-test" }));
        buildApi.onLoad({ filter: /^mock-events$/, namespace: "payment-test" }, () => ({
          contents: "export const retryRentalNotification = async () => null; export const logRentalAudit = async () => null; export const queueRentalNotification = async () => null;",
          loader: "js",
        }));
        buildApi.onResolve({ filter: /middlewares\/admin-auth$/ }, () => ({ path: "mock-admin", namespace: "payment-test" }));
        buildApi.onLoad({ filter: /^mock-admin$/, namespace: "payment-test" }, () => ({
          contents: "export const requireAdminAuth = (_req, _res, next) => next();",
          loader: "js",
        }));
        buildApi.onResolve({ filter: /lib\/logger$/ }, () => ({ path: "mock-logger", namespace: "payment-test" }));
        buildApi.onLoad({ filter: /^mock-logger$/, namespace: "payment-test" }, () => ({
          contents: "export const logger = { error() {}, warn() {}, info() {} };",
          loader: "js",
        }));
        buildApi.onResolve({ filter: /^\.\/partner$/ }, (args) => args.importer.includes("/src/routes/")
          ? ({ path: "mock-partner", namespace: "payment-test" }) : undefined);
        buildApi.onLoad({ filter: /^mock-partner$/, namespace: "payment-test" }, () => ({
          contents: "export const authenticatePartner = (_req, _res, next) => next(); export const partnerIdentity = () => null;",
          loader: "js",
        }));
        buildApi.onResolve({ filter: /^\.\/rental-vehicles$/ }, (args) => args.importer.includes("/src/routes/")
          ? ({ path: "mock-vehicles", namespace: "payment-test" }) : undefined);
        buildApi.onLoad({ filter: /^mock-vehicles$/, namespace: "payment-test" }, () => ({
          contents: "export const isVehicleAvailable = async () => true;",
          loader: "js",
        }));
      },
    }],
  });

  t.after(async () => {
    delete globalThis.__paymentBoundaryTestDb;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(temporaryDir, { recursive: true, force: true });
  });

  const { finance, rentalStripeWebhookHandler } = await import(pathToFileURL(bundlePath).href);
  const app = express();
  app.use((req, _res, next) => {
    req.log = { warn() {}, error() {} };
    req.session = { admin: { username: "payment-test-admin" } };
    next();
  });
  app.use("/api", express.json(), finance);
  app.post("/webhook", express.raw({ type: "application/json" }), rentalStripeWebhookHandler);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  memory.seed("rental_payments", [{
    id: 55,
    requestId: 45,
    reservationId: 65,
    operatorId: 7,
    status: "checkout_open",
    currency: "jpy",
    amount: 1000,
    commissionAmount: 100,
    commissionBasisPoints: 1000,
    operatorShareAmount: 900,
    refundedAmount: 0,
    stripeCheckoutSessionId: "cs_test_55",
    stripePaymentIntentId: null,
    stripeChargeId: null,
    policySnapshot: { cancellationPolicy: "Standard", depositPolicy: "None", payoutTerms: "Weekly" },
  }]);
  memory.seed("rental_reservations", [{
    id: 65,
    operatorId: 7,
    vehicleId: 77,
    status: "pending_payment",
    paymentStatus: "pending",
    pickupAt: new Date("2035-08-01T01:00:00.000Z"),
    returnAt: new Date("2035-08-02T01:00:00.000Z"),
    pickupLocation: "Sapporo Station",
    returnLocation: "Sapporo Station",
    marketplaceOfferSnapshot: { totalPrice: 1000 },
  }]);
  memory.seed("rental_marketplace_requests", [{
    id: 45,
    operatorId: 7,
    vehicleId: 77,
    reservationId: 65,
    status: "awaiting_payment",
    paymentDeadline: new Date(Date.now() + 60 * 60 * 1000),
    customerAccessToken: "customer-token",
    acceptedOffer: { totalPrice: 1000, vehicleName: "Test car" },
    driver: { fullName: "Test Customer", email: "customer@example.invalid", phone: "+81000000000" },
  }]);
  memory.seed("rental_operators", [{ id: 7, name: "Test Operator", contactEmail: "operator@example.invalid" }]);
  for (const table of [
    "rental_refunds", "rental_stripe_events", "rental_notifications",
    "rental_reconciliation_failures", "rental_disputes", "rental_payouts", "rental_reservation_exceptions",
  ]) {
    memory.seed(table, []);
  }

  return {
    memory,
    row(table, id) { return memory.rows.get(table).find((row) => row.id === id); },
    request(route, method, body) {
      return fetch(`${base}/api${route}`, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    },
    webhook(event, signature = "valid-signature") {
      return fetch(`${base}/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Stripe-Signature": signature },
        body: JSON.stringify(event),
      });
    },
  };
}