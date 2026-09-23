import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";

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

test("API startup completes the rental backfill before serving routes", async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for the startup backfill test");

  const child = spawn("node", ["dist/index.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      SESSION_SECRET: process.env.SESSION_SECRET ?? "rental-startup-backfill-test-secret",
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
      ["Child Safety Seat", "Winter Tire Upgrade", "Portable Wi-Fi Router"],
    );

    const legacyCars = await getJson("/api/cars");
    assert.deepEqual(
      legacyCars.map((car) => car.name),
      ["Alphard", "Vellfire", "Sienta"],
      "legacy cars remain available after the backfill",
    );

    const home = await getJson("/api/content/home");
    assert.equal(home.content.en.hero.title, "All-in-one stay in Hokkaido");
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("close", resolve));
  }
});