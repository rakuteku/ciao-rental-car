import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const bundled = await build({
  entryPoints: [
    fileURLToPath(new URL("../src/lib/rental-events.ts", import.meta.url)),
  ],
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  external: ["drizzle-orm"],
  plugins: [
    {
      name: "notification-test-dependencies",
      setup(build) {
        build.onResolve({ filter: /^@workspace\/db$/ }, () => ({
          path: "database",
          namespace: "test",
        }));
        build.onResolve({ filter: /\/logger$/ }, () => ({
          path: "logger",
          namespace: "test",
        }));
        build.onLoad({ filter: /.*/, namespace: "test" }, ({ path }) => ({
          contents:
            path === "logger"
              ? "export const logger = { error() {}, info() {} };"
              : `export const db = { insert() { throw new Error('Global database must not be used inside a transaction'); } };
         export const rentalAuditLogTable = {}, rentalDriversTable = {}, rentalMarketplaceRequestsTable = {}, rentalNotificationsTable = {}, rentalOperatorsTable = {}, rentalReservationsTable = {};`,
          loader: "js",
        }));
      },
    },
  ],
});
const module = { exports: {} };
new Function("require", "module", "exports", bundled.outputFiles[0].text)(
  createRequire(import.meta.url),
  module,
  module.exports,
);
const { queueRentalNotification, smtpConfiguration } = module.exports;

test("SMTP sender uses the PrimoStay display name with configured address forms", () => {
  const original = { ...process.env };
  try {
    process.env.SMTP_HOST = "smtp.example.test";
    process.env.SMTP_FROM = "Operations <mail@example.test>";
    assert.equal(smtpConfiguration().from, "PrimoStay Car Rental <mail@example.test>");

    process.env.SMTP_FROM = "mail@example.test";
    assert.equal(smtpConfiguration().from, "PrimoStay Car Rental <mail@example.test>");
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in original)) delete process.env[key];
    }
    Object.assign(process.env, original);
  }
});

for (const eventType of [
  "new_booking",
  "booking_confirmed",
  "cancellation_confirmed",
]) {
  test(`${eventType} is stored through the booking transaction with all three languages`, async () => {
    let stored;
    const transaction = {
      insert() {
        return {
          values(value) {
            stored = value;
            return {
              onConflictDoNothing() {
                return { returning: async () => [{ id: 1, ...value }] };
              },
            };
          },
        };
      },
    };
    await queueRentalNotification(
      {
        email: " latest@example.test ",
        eventType,
        bookingId: 42,
        locale: "zh-TW",
        dispatch: false,
        extra: { panelUrl: "https://example.test/zh-TW/rentalcar/my-bookings" },
      },
      transaction,
    );
    assert.equal(stored.email, "latest@example.test");
    assert.equal(stored.deliveryStatus, "pending");
    assert.equal(stored.payload.locale, "zh-TW");
    for (const language of ["en", "ja", "zh-TW"]) {
      assert.ok(
        stored.payload.localeTemplates[language].subject.includes("42"),
      );
      assert.ok(stored.payload.localeTemplates[language].body.length > 0);
    }
    if (eventType === "new_booking")
      assert.ok(
        stored.payload.localeTemplates["zh-TW"].body.includes(
          "https://example.test/zh-TW/rentalcar/my-bookings",
        ),
      );
  });
}

test("customer notification subjects use the localized PrimoStay brand", async () => {
  const cases = [
    ["request", "en", "PrimoStay Car Rental:"],
    ["decline", "ja", "PrimoStay レンタカー："],
    ["pickup_reminder", "ja", "PrimoStay レンタカー："],
    ["return_reminder", "ja", "PrimoStay レンタカー："],
    ["overdue_alert", "ja", "PrimoStay レンタカー："],
    ["cancellation_confirmed", "zh-TW", "PrimoStay 租車："],
  ];
  for (const [eventType, locale, prefix] of cases) {
    let stored;
    await queueRentalNotification({
      email: "customer@example.test", eventType, bookingId: 42, locale, dispatch: false,
    }, {
      insert() {
        return { values(value) {
          stored = value;
          return { onConflictDoNothing() { return { returning: async () => [{ id: 1, ...value }] }; } };
        } };
      },
    });
    assert.ok(stored.payload.localeTemplates[locale].subject.startsWith(prefix), `${eventType} ${locale}`);
  }
});
