import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { test } from "node:test";

const requireDb = createRequire(new URL("../../../lib/db/package.json", import.meta.url));
const { Pool } = requireDb("pg");

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
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const legacyIds = [];
  const createdLegacyIds = [];
  for (const [name, pricePerDay] of [["Alphard", 18000], ["Vellfire", 20000], ["Sienta", 9800]]) {
    let { rows: [car] } = await pool.query("SELECT id FROM cars WHERE name=$1 ORDER BY id LIMIT 1", [name]);
    if (!car) {
      ({ rows: [car] } = await pool.query(
        "INSERT INTO cars(model,name,year,passenger_capacity,price_per_day) VALUES('Toyota',$1,2024,6,$2) RETURNING id",
        [name, pricePerDay],
      ));
      createdLegacyIds.push(car.id);
    }
    legacyIds.push(car.id);
  }

  const child = spawn("node", ["dist/index.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      SESSION_SECRET: process.env.SESSION_SECRET ?? "rental-catalog-regression-test-secret",
      PUBLIC_BASE_URL: "https://rental-staging.example.test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForServer(child);

    const robots = await fetch(`${baseUrl}/api/robots.txt`);
    assert.equal(robots.ok, true);
    assert.match(await robots.text(), /Sitemap: https:\/\/rental-staging\.example\.test\/sitemap\.xml/);

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

    const rentalContent = await getJson("/api/content/rentalcar");
    assert.deepEqual(rentalContent.content.en.importantNotes, [
      "Insurance is included. Coverage details, deductibles and non-operation charges are shown before you confirm.",
      "Cancellation terms are shown before you confirm your booking.",
      "Driving-licence requirements depend on where your licence was issued. Taiwan licences need an official Japanese translation (JAF or the Taiwan–Japan Relations Association); many other countries need an International Driving Permit under the 1949 Geneva Convention. Bring your original licence and passport.",
    ]);
    assert.deepEqual(rentalContent.content.ja.importantNotes, [
      "保険は料金に含まれます。補償内容・免責額・ノンオペレーションチャージはご予約確定前にご案内します。",
      "キャンセル規定はご予約確定前にご案内します。",
      "必要な書類は免許証の発行国・地域によって異なります。台湾の免許証はJAFまたは台湾日本関係協会の日本語翻訳文が必要です。その他の多くの国は1949年ジュネーブ条約に基づく国際運転免許証が必要です。免許証の原本とパスポートをお持ちください。",
    ]);
    assert.deepEqual(rentalContent.content["zh-CN"].importantNotes, [
      "租金已含保險。保障內容、自負額及營業損失補償（NOC）將於確認預約前說明。",
      "取消規定將於確認預約前說明。",
      "所需文件依駕照核發國家或地區而定。台灣駕照需搭配 JAF 或台灣日本關係協會核發的日文譯本；其他多數國家需持 1949 年日內瓦公約國際駕照。取車時請攜帶駕照正本與護照。",
    ]);

    const homeSource = await readFile(
      new URL("../../ciao-rental/src/pages/rentalcar/index.tsx", import.meta.url),
      "utf8",
    );
    assert.match(homeSource, /rentalcar\/cars\/\$\{vehicle\.slug\}/);
    assert.doesNotMatch(homeSource, /useGetCars/);
  } finally {
    child.kill("SIGTERM");
    if (child.exitCode === null) await new Promise((resolve) => child.once("close", resolve));
    if (createdLegacyIds.length) {
      await pool.query("DELETE FROM rental_vehicles WHERE legacy_car_id = ANY($1::int[])", [createdLegacyIds]);
      await pool.query("DELETE FROM cars WHERE id = ANY($1::int[])", [createdLegacyIds]);
    }
    await pool.end();
  }
});
