import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { test } from "node:test";

const requireDb = createRequire(new URL("../../../lib/db/package.json", import.meta.url));
const { Pool } = requireDb("pg");
const port = 26000 + process.pid % 1000;
const base = `http://127.0.0.1:${port}/api`;

async function startApi() {
  const child = spawn("node", ["dist/index.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, PORT: String(port), NODE_ENV: "test", RENTAL_MARKETPLACE_ENABLED: "false" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  for (let n = 0; n < 100; n += 1) {
    if (child.exitCode !== null) throw new Error(output);
    try {
      if ((await fetch(`${base}/healthz`)).ok) return child;
    } catch { /* still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill("SIGTERM");
  throw new Error(`API startup timed out: ${output}`);
}

async function stopApi(child) {
  if (!child) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("close", resolve));
}

async function post(path, body, cookie) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

test("customer session and hold token survive API restart", async () => {
  assert.ok(process.env.DATABASE_URL);
  assert.ok(process.env.SESSION_SECRET);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const unique = randomBytes(8).toString("hex");
  const ids = {};
  let child;
  try {
    // API startup requires the three legacy catalog cars even in a fresh database.
    for (const [name, price] of [["Alphard", 18000], ["Vellfire", 20000], ["Sienta", 9800]]) {
      const { rowCount } = await pool.query("SELECT 1 FROM cars WHERE name=$1", [name]);
      if (!rowCount) await pool.query(
        "INSERT INTO cars(name,passenger_capacity,price_per_day) VALUES($1,7,$2)", [name, price],
      );
    }
    child = await startApi();
    const { rows: [platform] } = await pool.query("SELECT id FROM rental_operators WHERE is_platform=true LIMIT 1");
    const { rows: [vehicle] } = await pool.query(
      "INSERT INTO rental_vehicles(operator_id,internal_name,public_title,slug,brand,model,year,status) VALUES($1,'Test car','Test car',$2,'Test','Car',2025,'published') RETURNING id",
      [platform.id, `session-${unique}`],
    );
    ids.vehicle = vehicle.id;
    await pool.query("INSERT INTO rental_vehicle_pricing(vehicle_id,base_price) VALUES($1,10000)", [vehicle.id]);
    const email = `session-${unique}@example.invalid`;
    const register = await post("/rental/account/register", {
      email, password: `password-${unique}`, fullName: "Test Customer",
    });
    assert.equal(register.status, 201, await register.clone().text());
    ids.account = (await register.clone().json()).account.id;
    const cookie = register.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie);

    const holdResponse = await post("/rental/reservations/hold", {
      vehicleId: vehicle.id,
      pickupAt: "2035-05-01T01:00:00Z",
      returnAt: "2035-05-02T01:00:00Z",
    });
    assert.equal(holdResponse.status, 201, await holdResponse.clone().text());
    const hold = await holdResponse.json();
    ids.hold = hold.holdId;
    assert.match(hold.holdToken, /^[a-f0-9]{64}$/);
    const { rows: [stored] } = await pool.query("SELECT hold_token_hash, session_token FROM rental_reservation_holds WHERE id=$1", [hold.holdId]);
    assert.notEqual(stored.hold_token_hash, hold.holdToken);
    assert.equal(stored.session_token, null);

    await stopApi(child);
    child = await startApi();
    const me = await fetch(`${base}/rental/account/me`, { headers: { cookie } });
    assert.equal(me.status, 200, await me.clone().text());
    assert.equal((await me.json()).account.email, email);

    const missingToken = await fetch(`${base}/rental/reservations/holds/${hold.holdId}`);
    assert.equal(missingToken.status, 400);
    const getHold = await fetch(`${base}/rental/reservations/holds/${hold.holdId}`, {
      headers: { "x-hold-token": hold.holdToken },
    });
    assert.equal(getHold.status, 200, await getHold.clone().text());
    assert.equal((await getHold.json()).holdToken, undefined);

    const reservation = {
      holdId: hold.holdId, vehicleId: vehicle.id,
      pickupLocation: "Sapporo", returnLocation: "Sapporo",
      driver: { fullName: "Test Customer", email, phone: "000-0000-0000" },
    };
    const wrong = await post("/rental/reservations", { ...reservation, holdToken: "0".repeat(64) }, cookie);
    assert.equal(wrong.status, 400, await wrong.clone().text());
    const valid = await post("/rental/reservations", { ...reservation, holdToken: hold.holdToken }, cookie);
    assert.equal(valid.status, 201, await valid.clone().text());
    ids.reservation = (await valid.json()).id;
    const { rows: [savedReservation] } = await pool.query(
      "SELECT primary_driver_id FROM rental_reservations WHERE id=$1", [ids.reservation],
    );
    ids.driver = savedReservation.primary_driver_id;
  } finally {
    await stopApi(child);
    if (ids.reservation) await pool.query("DELETE FROM rental_reservations WHERE id=$1", [ids.reservation]);
    if (ids.driver) await pool.query("DELETE FROM rental_drivers WHERE id=$1", [ids.driver]);
    if (ids.hold) await pool.query("DELETE FROM rental_reservation_holds WHERE id=$1", [ids.hold]);
    if (ids.account) await pool.query("DELETE FROM rental_customer_accounts WHERE id=$1", [ids.account]);
    if (ids.vehicle) {
      await pool.query("DELETE FROM rental_vehicle_pricing WHERE vehicle_id=$1", [ids.vehicle]);
      await pool.query("DELETE FROM rental_vehicles WHERE id=$1", [ids.vehicle]);
    }
    await pool.end();
  }
});
