import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("checkout pricing starts before the summary step and exposes an error retry", async () => {
  const source = await read("artifacts/ciao-rental/src/pages/rentalcar/checkout/index.tsx");
  assert.doesNotMatch(source, /draft && step >= 5/);
  assert.match(source, /if \(draft\) \{\s*priceQuote\.mutate/);
  assert.match(source, /priceQuote\.isError/);
});

test("direct and marketplace bookings require an active customer account", async () => {
  const [reservations, requests] = await Promise.all([
    read("artifacts/api-server/src/routes/rental-reservations.ts"),
    read("artifacts/api-server/src/routes/rental-requests.ts"),
  ]);
  for (const source of [reservations, requests]) {
    assert.match(source, /rentalCustomerAccountId/);
    assert.match(source, /Sign in to your customer account before booking/);
    assert.match(source, /The booking email must match your signed-in account/);
  }
});

test("Google customer sign-in verifies the token and remains configuration-gated", async () => {
  const source = await read("artifacts/api-server/src/routes/rental-customers.ts");
  assert.match(source, /GOOGLE_CLIENT_ID/);
  assert.match(source, /verifyIdToken/);
  assert.match(source, /email_verified/);
  assert.match(source, /\/rental\/account\/google\/config/);
});

test("reservation email contains the localized customer-panel link", async () => {
  const bundled = await build({
    entryPoints: [fileURLToPath(new URL("../src/lib/rental-events.ts", import.meta.url))],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    external: ["drizzle-orm"],
    plugins: [{
      name: "notification-test-dependencies",
      setup(buildContext) {
        buildContext.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "database", namespace: "test" }));
        buildContext.onResolve({ filter: /\/logger$/ }, () => ({ path: "logger", namespace: "test" }));
        buildContext.onLoad({ filter: /.*/, namespace: "test" }, ({ path }) => ({
          contents: path === "logger"
            ? "export const logger = { error() {}, info() {} };"
            : "export const db = {}; export const rentalAuditLogTable = {}, rentalDriversTable = {}, rentalMarketplaceRequestsTable = {}, rentalNotificationsTable = {}, rentalOperatorsTable = {}, rentalReservationsTable = {};",
          loader: "js",
        }));
      },
    }],
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", bundled.outputFiles[0].text)(
    createRequire(import.meta.url), module, module.exports,
  );
  let stored;
  await module.exports.queueRentalNotification({
    email: "customer@example.test",
    eventType: "new_booking",
    bookingId: 42,
    locale: "zh-TW",
    dispatch: false,
    extra: { panelUrl: "https://example.test/zh-TW/rentalcar/my-bookings" },
  }, {
    insert() {
      return { values(value) {
        stored = value;
        return { onConflictDoNothing() { return { returning: async () => [{ id: 1, ...value }] }; } };
      } };
    },
  });
  assert.equal(stored.payload.locale, "zh-TW");
  assert.ok(stored.payload.localeTemplates["zh-TW"].body.includes("https://example.test/zh-TW/rentalcar/my-bookings"));
});

test("checkout gate and customer panel include English, Japanese and Traditional Chinese", async () => {
  const [checkout, panel] = await Promise.all([
    read("artifacts/ciao-rental/src/pages/rentalcar/checkout/index.tsx"),
    read("artifacts/ciao-rental/src/pages/rentalcar/my-bookings/index.tsx"),
  ]);
  assert.match(checkout, /Sign in before booking/);
  assert.match(checkout, /予約にはログインが必要です/);
  assert.match(checkout, /請先登入再預訂/);
  assert.match(panel, /en: \{ title: "My bookings"/);
  assert.match(panel, /ja: \{ title: "予約の確認"/);
  assert.match(panel, /"zh-TW": \{ title: "我的預訂"/);
});
