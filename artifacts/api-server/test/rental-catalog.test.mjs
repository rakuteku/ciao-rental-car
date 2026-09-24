import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { test } from "node:test";

const port = 20000 + (process.pid % 1000);
const baseUrl = `http://127.0.0.1:${port}`;

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

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`);
  assert.equal(response.ok, true, `${path} should return 2xx (got ${response.status})`);
  return response.json();
}

test("published rental catalog, live add-ons, pricing, slugs, and CMS cleanup are stable", async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for the rental catalog test");

  const child = spawn("node", ["dist/index.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      SESSION_SECRET: process.env.SESSION_SECRET ?? "rental-catalog-regression-test-secret",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForServer(child);

    const vehicles = await getJson("/api/rental/vehicles");
    assert.deepEqual(
      vehicles.map((vehicle) => vehicle.slug),
      ["toyota-alphard", "toyota-vellfire", "toyota-sienta"],
    );
    assert.deepEqual(
      vehicles.map((vehicle) => vehicle.basePrice),
      [18000, 20000, 9800],
    );
    assert.ok(vehicles.every((vehicle) => vehicle.status === "published"));
    assert.ok(vehicles.every((vehicle) => vehicle.featured));
    assert.ok(vehicles.every((vehicle) => vehicle.images.length > 0));
    assert.ok(vehicles.every((vehicle) => vehicle.publicTitleJa));
    assert.ok(vehicles.every((vehicle) => vehicle.publicTitleZhTw));
    assert.ok(vehicles.every((vehicle) => vehicle.descriptionJa));
    assert.ok(vehicles.every((vehicle) => vehicle.descriptionZhTw));

    for (const slug of ["toyota-alphard", "toyota-vellfire", "toyota-sienta"]) {
      const detail = await getJson(`/api/rental/vehicles/${slug}`);
      assert.equal(detail.slug, slug);
      assert.ok(detail.pricing);
      assert.ok(detail.pricing.basePrice > 0);
    }

    const addons = await getJson("/api/rental/addons");
    assert.deepEqual(
      addons.map((addon) => [addon.name, addon.perDayFee]),
      [
        ["Child Safety Seat", 800],
        ["Winter Tire Upgrade", 1000],
        ["Portable Wi-Fi Router", 600],
      ],
    );
    assert.ok(addons.every((addon) => addon.published));
    assert.ok(addons.every((addon) => addon.pricingType === "flat" || addon.pricingType === "per_day"));
    assert.ok(addons.every((addon) => addon.nameJa && addon.nameZhTw));
    assert.ok(addons.every((addon) => addon.descriptionJa && addon.descriptionZhTw));

    const childSeat = addons.find((addon) => addon.name === "Child Safety Seat");
    const priceResponse = await fetch(`${baseUrl}/api/rental/pricing/calculate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        vehicleId: vehicles[0].id,
        pickupAt: "2026-10-01T10:00:00.000Z",
        returnAt: "2026-10-03T10:00:00.000Z",
        pickupLocation: "New Chitose Airport",
        returnLocation: "New Chitose Airport",
        addons: [{ addonId: childSeat.id, qty: 2 }],
      }),
    });
    assert.equal(priceResponse.status, 200);
    const price = await priceResponse.json();
    assert.deepEqual(price.addons[0], {
      addonId: childSeat.id,
      name: "Child Safety Seat",
      qty: 2,
      unitPrice: 1600,
      totalPrice: 3200,
      pricingType: "per_day",
    });
    assert.equal(price.addonsTotal, 3200);
    assert.equal(price.finalTotal, 58800);

    const home = await getJson("/api/content/home");
    assert.equal(home.content.en.hero.title, "All-in-one stay in Hokkaido");

    const homeSource = await readFile(
      new URL("../../ciao-rental/src/pages/rentalcar/index.tsx", import.meta.url),
      "utf8",
    );
    assert.match(homeSource, /rentalcar\/cars\/\$\{vehicle\.slug\}/);
    assert.doesNotMatch(homeSource, /useGetCars/);
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("close", resolve));
  }
});
