import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { test } from "node:test";

const requireDb = createRequire(new URL("../../../lib/db/package.json", import.meta.url));
const { Pool } = requireDb("pg");

test("approved staff see only their operator's IDs, writes and private files", async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const ids = { operators: [], vehicles: [], reservations: [], addons: [] };
  const unique = randomBytes(8).toString("hex");
  const password = `test-${unique}`;
  const salt = randomBytes(16).toString("hex");
  const passwordHash = `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
  let child;
  try {
    for (const suffix of ["a", "b"]) {
      const { rows: [operator] } = await pool.query(
        "INSERT INTO rental_operators(slug,name,status,verification_status) VALUES($1,$2,'active','approved') RETURNING id",
        [`tenant-test-${unique}-${suffix}`, "Temporary isolation test"],
      );
      ids.operators.push(operator.id);
      await pool.query(
        "INSERT INTO rental_operator_staff(operator_id,identity_subject,email,password_hash,role,status,active) VALUES($1,$2,$3,$4,'owner','active',true)",
        [operator.id, `test-${unique}-${suffix}`, `${unique}@example.invalid`, passwordHash],
      );
      const { rows: [vehicle] } = await pool.query(
        "INSERT INTO rental_vehicles(operator_id,internal_name,public_title,slug,brand,model,year,status) VALUES($1,'Test car','Test car',$2,'Test','Car',2025,$3) RETURNING id",
        [operator.id, `tenant-test-${unique}-${suffix}`, suffix === "a" ? "published" : "draft"],
      );
      ids.vehicles.push(vehicle.id);
      const { rows: [reservation] } = await pool.query(
        "INSERT INTO rental_reservations(operator_id,vehicle_id,pickup_at,return_at,pickup_location,return_location) VALUES($1,$2,$3,$4,'Test','Test') RETURNING id",
        [operator.id, vehicle.id, "2035-01-02T00:00:00Z", "2035-01-03T00:00:00Z"],
      );
      ids.reservations.push(reservation.id);
    }
    const { rows: [addon] } = await pool.query(
      "INSERT INTO rental_addons(operator_id,name,published,flat_fee) VALUES($1,$2,true,100) RETURNING id",
      [ids.operators[1], `tenant-test-${unique}`],
    );
    ids.addons.push(addon.id);

    const port = 24000 + process.pid % 1000;
    const base = `http://127.0.0.1:${port}/api`;
    child = spawn("node", ["dist/index.mjs"], {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, PORT: String(port), NODE_ENV: "development", RENTAL_MARKETPLACE_ENABLED: "true", ADMIN_PASSWORD: `admin-${unique}` },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    for (let n = 0; n < 100 && !output.includes("Server listening"); n++) {
      if (child.exitCode !== null) throw new Error(output);
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    assert.match(output, /Server listening/);

    const sharedEmail = `${unique}@example.invalid`;
    const ambiguousLogin = await fetch(`${base}/operator/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: sharedEmail, password }),
    });
    assert.equal(ambiguousLogin.status, 400);
    const login = await fetch(`${base}/operator/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: sharedEmail, password, operatorSlug: `tenant-test-${unique}-a` }),
    });
    assert.equal(login.status, 200);
    const secondLogin = await fetch(`${base}/operator/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: sharedEmail, password, operatorSlug: `tenant-test-${unique}-b` }),
    });
    assert.equal(secondLogin.status, 200);
    const secondCookie = secondLogin.headers.get("set-cookie")?.split(";")[0];
    assert.ok(secondCookie);
    assert.equal((await fetch(`${base}/operator/rental/vehicles/${ids.vehicles[1]}`, { headers: { Cookie: secondCookie } })).status, 200);
    assert.equal((await fetch(`${base}/operator/rental/vehicles/${ids.vehicles[0]}`, { headers: { Cookie: secondCookie } })).status, 404);
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie);
    const request = (path, method = "GET", body) => fetch(`${base}${path}`, {
      method, headers: { Cookie: cookie, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    assert.equal((await request(`/operator/rental/vehicles/${ids.vehicles[0]}`)).status, 200);
    assert.equal((await request(`/operator/rental/vehicles/${ids.vehicles[1]}`)).status, 404);
    assert.equal((await request(`/operator/rental/reservations/${ids.reservations[0]}`)).status, 200);
    assert.equal((await request(`/operator/rental/reservations/${ids.reservations[1]}`)).status, 404);
    assert.equal((await request(`/operator/rental/vehicles/${ids.vehicles[1]}`, "PATCH", { internalNotes: "cross tenant" })).status, 404);
    assert.equal((await request(`/operator/rental/reservations/${ids.reservations[1]}`, "PATCH", { internalNotes: "cross tenant" })).status, 404);
    assert.equal((await request(`/operator/rental/reservations/${ids.reservations[1]}/driver-documents/1/content`)).status, 404);
    const list = await (await request("/operator/rental/vehicles")).json();
    assert.ok(list.some((row) => row.id === ids.vehicles[0]));
    assert.ok(!list.some((row) => row.id === ids.vehicles[1]));
    const crossAddonPrice = await fetch(`${base}/rental/pricing/calculate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicleId: ids.vehicles[0],
        pickupAt: "2035-02-02T00:00:00Z",
        returnAt: "2035-02-03T00:00:00Z",
        addons: [{ addonId: ids.addons[0], qty: 1 }],
      }),
    });
    assert.equal(crossAddonPrice.status, 400);

    const { rows: [mapped] } = await pool.query("SELECT id FROM rental_vehicles WHERE legacy_car_id IS NOT NULL LIMIT 1");
    assert.ok(mapped, "a platform vehicle must be mapped to a legacy car");
    const adminLogin = await fetch(`${base}/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: `admin-${unique}` }),
    });
    assert.equal(adminLogin.status, 200);
    const adminCookie = adminLogin.headers.get("set-cookie")?.split(";")[0];
    assert.ok(adminCookie);
    const duplicateResponse = await fetch(`${base}/admin/rental/vehicles/${mapped.id}/duplicate`, {
      method: "POST",
      headers: { Cookie: adminCookie },
    });
    assert.equal(duplicateResponse.status, 201);
    const duplicate = await duplicateResponse.json();
    assert.equal(duplicate.legacyCarId, null);
    assert.equal(duplicate.plate, null);
    assert.equal(duplicate.vin, null);
    assert.equal(duplicate.status, "draft");
    ids.vehicles.push(duplicate.id);
  } finally {
    child?.kill("SIGTERM");
    for (const id of ids.reservations) await pool.query("DELETE FROM rental_reservations WHERE id=$1", [id]);
    for (const id of ids.addons) await pool.query("DELETE FROM rental_addons WHERE id=$1", [id]);
    for (const id of ids.vehicles) {
      await pool.query("DELETE FROM rental_vehicle_images WHERE vehicle_id=$1", [id]);
      await pool.query("DELETE FROM rental_vehicle_pricing WHERE vehicle_id=$1", [id]);
      await pool.query("DELETE FROM rental_vehicles WHERE id=$1", [id]);
    }
    for (const id of ids.operators) await pool.query("DELETE FROM rental_operators WHERE id=$1", [id]);
    await pool.end();
  }
});