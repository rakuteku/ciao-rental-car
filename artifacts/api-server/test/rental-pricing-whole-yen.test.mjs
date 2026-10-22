import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { test } from "node:test";

const requireDb = createRequire(new URL("../../../lib/db/package.json", import.meta.url));
const { Pool } = requireDb("pg");

const port = 21000 + (process.pid % 1000);
const baseUrl = `http://127.0.0.1:${port}`;

const MONEY_FIELDS = [
  "subtotal",
  "deliveryFee",
  "airportPickupFee",
  "airportDropoffFee",
  "pickupLocationFee",
  "returnLocationFee",
  "oneWayFee",
  "addonsTotal",
  "discount",
  "tax",
  "securityDeposit",
  "finalTotal",
];

async function waitForServer(child) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`API server exited before the test started (code ${child.exitCode})`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/healthz`);
      if (response.ok) return;
    } catch {
      // The server may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for the API server");
}

function assertWholeYen(pricing, label) {
  for (const field of MONEY_FIELDS) {
    const value = pricing[field];
    assert.equal(
      Number.isInteger(value),
      true,
      `${label}: ${field} must be a whole yen integer, got ${value}`,
    );
  }
  for (const addon of pricing.addons ?? []) {
    assert.equal(Number.isInteger(addon.unitPrice), true, `${label}: addon unitPrice must be whole yen, got ${addon.unitPrice}`);
    assert.equal(Number.isInteger(addon.totalPrice), true, `${label}: addon totalPrice must be whole yen, got ${addon.totalPrice}`);
  }
}

// JPY has no minor unit. A percentage of a yen amount, and any fee that reaches
// us from a `real` column or the free-form settings JSON, must be rounded before
// it lands in a total the customer is shown or charged.
test("pricing returns whole yen with discounts, tax and fractional add-on fees", async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for the whole-yen pricing test");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const suffix = `wholeyen-${process.pid}`;
  const cleanup = { vehicleId: null, addonId: null };

  try {
    // A ¥8,880 daily rate makes the 7% weekly discount land on a fraction
    // (8880 * 3 = 26640; 26640 * 0.07 = 1864.8) unless it is rounded.
    const { rows: [vehicle] } = await pool.query(
      `INSERT INTO rental_vehicles(internal_name, public_title, slug, brand, model, year, vehicle_class, seats, status)
       VALUES($1, 'Whole Yen Test Car', $2, 'Toyota', 'Test', 2026, 'compact', 5, 'published')
       RETURNING id`,
      [`Whole Yen ${suffix}`, `whole-yen-${suffix}`],
    );
    cleanup.vehicleId = vehicle.id;

    await pool.query(
      `INSERT INTO rental_vehicle_pricing(vehicle_id, base_price, rate_12_hours, rate_24_hours,
         additional_24_hours, additional_hour, weekly_discount_pct, monthly_discount_pct,
         tax_included, tax_rate, security_deposit)
       VALUES($1, 8880, 6000, 8880, 8880, 370, 7, 13, false, 10, 50000)`,
      [vehicle.id],
    );

    // A deliberately fractional add-on fee: `per_day_fee` is a `real` column, so
    // an operator can save ¥550.5 and it must not reach the total as a fraction.
    const { rows: [addon] } = await pool.query(
      `INSERT INTO rental_addons(name, category, pricing_type, per_day_fee, max_qty, published)
       VALUES($1, 'equipment', 'per_day', 550.5, 2, true)
       RETURNING id`,
      [`Whole Yen Addon ${suffix}`],
    );
    cleanup.addonId = addon.id;

    const child = spawn("node", ["dist/index.mjs"], {
      cwd: new URL("..", import.meta.url),
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORT: String(port),
        SESSION_SECRET: process.env.SESSION_SECRET ?? "whole-yen-pricing-test-secret",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    try {
      await waitForServer(child);

      const calculate = async (body, label) => {
        const response = await fetch(`${baseUrl}/api/rental/pricing/calculate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        assert.equal(response.ok, true, `${label}: calculate should return 2xx (got ${response.status})`);
        const pricing = await response.json();
        assertWholeYen(pricing, label);
        return pricing;
      };

      // 3 days: long enough for nothing, short enough to carry no discount.
      const plain = await calculate({
        vehicleId: vehicle.id,
        pickupAt: "2026-11-02T10:00:00+09:00",
        returnAt: "2026-11-05T10:00:00+09:00",
        pickupLocation: "Sapporo Station",
        returnLocation: "Sapporo Station",
        addons: [],
      }, "3-day rental");
      assert.equal(plain.days, 3);
      assert.equal(plain.discount, 0);

      // 7 days triggers the 7% weekly discount, the case that produced ¥1,864.8.
      const weekly = await calculate({
        vehicleId: vehicle.id,
        pickupAt: "2026-11-02T10:00:00+09:00",
        returnAt: "2026-11-09T10:00:00+09:00",
        pickupLocation: "Sapporo Station",
        returnLocation: "Sapporo Station",
        addons: [],
      }, "weekly discount");
      assert.equal(weekly.days, 7);
      assert.ok(weekly.discount > 0, "a 7-day rental should receive the weekly discount");

      // 30 days triggers the 13% monthly discount instead.
      const monthly = await calculate({
        vehicleId: vehicle.id,
        pickupAt: "2026-11-02T10:00:00+09:00",
        returnAt: "2026-12-02T10:00:00+09:00",
        pickupLocation: "Sapporo Station",
        returnLocation: "Sapporo Station",
        addons: [],
      }, "monthly discount");
      assert.equal(monthly.days, 30);
      assert.ok(monthly.discount > 0, "a 30-day rental should receive the monthly discount");

      // tax_included is false here, so tax is a percentage of the pre-tax total.
      assert.ok(weekly.tax > 0, "a tax-exclusive rate plan should add tax");
      assert.equal(weekly.taxIncluded, false);

      // The fractional add-on fee must not reintroduce a fraction.
      const withAddon = await calculate({
        vehicleId: vehicle.id,
        pickupAt: "2026-11-02T10:00:00+09:00",
        returnAt: "2026-11-09T10:00:00+09:00",
        pickupLocation: "Sapporo Station",
        returnLocation: "Sapporo Station",
        addons: [{ addonId: addon.id, qty: 2 }],
      }, "fractional add-on fee");
      assert.ok(withAddon.addonsTotal > 0, "the add-on should be charged");
      assert.equal(
        withAddon.finalTotal,
        withAddon.subtotal - withAddon.discount + withAddon.addonsTotal
          + withAddon.airportPickupFee + withAddon.airportDropoffFee
          + withAddon.pickupLocationFee + withAddon.returnLocationFee
          + withAddon.oneWayFee + withAddon.deliveryFee + withAddon.tax,
        "finalTotal should be the sum of its parts",
      );
    } finally {
      child.kill();
    }
  } finally {
    if (cleanup.addonId) await pool.query("DELETE FROM rental_addons WHERE id=$1", [cleanup.addonId]);
    if (cleanup.vehicleId) {
      await pool.query("DELETE FROM rental_vehicle_pricing WHERE vehicle_id=$1", [cleanup.vehicleId]);
      await pool.query("DELETE FROM rental_vehicles WHERE id=$1", [cleanup.vehicleId]);
    }
    await pool.end();
  }
});
