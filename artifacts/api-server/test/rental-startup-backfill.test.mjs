import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { test } from "node:test";

const requireDb = createRequire(new URL("../../../lib/db/package.json", import.meta.url));
const { Pool } = requireDb("pg");

const port = 21000 + (process.pid % 1000);
const baseUrl = `http://127.0.0.1:${port}`;

async function waitForText(child, outputRef, text) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`API server exited before "${text}" appeared (code ${child.exitCode})\n${outputRef.value}`);
    }
    if (outputRef.value.includes(text)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for "${text}"\n${outputRef.value}`);
}

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`);
  assert.equal(response.ok, true, `${path} should return 2xx (got ${response.status})`);
  return response.json();
}

test("API starts and reports healthy when no legacy cars exist", async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for the startup backfill test");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { rows: [{ count }] } = await pool.query("SELECT count(*)::int AS count FROM cars");
  assert.equal(count, 0, "this fresh-database test must run before any legacy car fixture is created");
  const child = spawn("node", ["dist/index.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      SESSION_SECRET: process.env.SESSION_SECRET ?? "rental-empty-startup-test-secret",
      ADMIN_PASSWORD: "rental-empty-startup-admin-password",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const outputRef = { value: "" };
  child.stdout.on("data", (chunk) => { outputRef.value += chunk.toString(); });
  child.stderr.on("data", (chunk) => { outputRef.value += chunk.toString(); });
  try {
    await waitForText(child, outputRef, "Server listening");
    const health = await fetch(`${baseUrl}/api/healthz`);
    assert.equal(health.status, 200);
    for (const name of ["Alphard", "Vellfire", "Sienta"]) {
      assert.ok(outputRef.value.includes(`legacy car \\"${name}\\" was not found; skipping it`));
    }
  } finally {
    child.kill("SIGTERM");
    if (child.exitCode === null) await new Promise((resolve) => child.once("close", resolve));
    await pool.end();
  }
});

test("API startup completes the rental backfill before serving routes", async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for the startup backfill test");
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
      NODE_ENV: "production",
      PORT: String(port),
      SESSION_SECRET: process.env.SESSION_SECRET ?? "rental-startup-backfill-test-secret",
      ADMIN_PASSWORD: "rental-startup-admin-password",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const outputRef = { value: "" };
  child.stdout.on("data", (chunk) => {
    outputRef.value += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    outputRef.value += chunk.toString();
  });

  try {
    await waitForText(child, outputRef, "Rental catalog backfill complete.");
    await waitForText(child, outputRef, "Server listening");

    const backfillIndex = outputRef.value.indexOf("Rental catalog backfill complete.");
    const listeningIndex = outputRef.value.indexOf("Server listening");
    assert.ok(backfillIndex >= 0);
    assert.ok(listeningIndex > backfillIndex, "routes must not listen before backfill completes");

    const vehicles = await getJson("/api/rental/vehicles");
    assert.deepEqual(
      vehicles.map((vehicle) => vehicle.slug),
      ["toyota-alphard", "toyota-vellfire", "toyota-sienta"],
    );
    assert.ok(vehicles.every((vehicle) => vehicle.status === "published" && vehicle.featured));

    const addons = await getJson("/api/rental/addons");
    assert.deepEqual(
      addons.map((addon) => addon.name),
      ["Child Safety Seat", "Portable Wi-Fi Router"],
    );

    const legacyCars = await getJson("/api/cars");
    assert.ok(
      legacyIds.every((id) => legacyCars.some((car) => car.id === id)),
      "legacy cars remain available after the backfill",
    );

    const home = await getJson("/api/content/home");
    assert.equal(home.content.en.hero.title, "All-in-one stay in Hokkaido");
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
