import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";

const port = 19000 + (process.pid % 1000);
const baseUrl = `http://127.0.0.1:${port}`;
const testAdminPassword = "test-admin-password-123";
const execFileAsync = promisify(execFile);

async function runPsql(query) {
  return execFileAsync("psql", [
    process.env.DATABASE_URL,
    "-v",
    "ON_ERROR_STOP=1",
    "-qAt",
    "-c",
    query,
  ]);
}

async function insertMissingLegacyCars() {
  const cars = [
    ["Alphard", 6, 18000],
    ["Vellfire", 6, 20000],
    ["Sienta", 6, 9800],
  ];
  const insertedIds = [];

  for (const [name, passengerCapacity, pricePerDay] of cars) {
    const { stdout } = await runPsql(
      `INSERT INTO cars (name, passenger_capacity, price_per_day)\n` +
      `SELECT '${name}', ${passengerCapacity}, ${pricePerDay}\n` +
      `WHERE NOT EXISTS (SELECT 1 FROM cars WHERE name = '${name}')\n` +
      "RETURNING id;",
    );
    const returnedId = stdout.trim();
    if (returnedId) {
      const id = Number(returnedId);
      if (Number.isInteger(id)) insertedIds.push(id);
    }
  }

  return async () => {
    for (const id of insertedIds) {
      await runPsql(`DELETE FROM cars WHERE id = ${id};`);
    }
  };
}

async function deleteCustomerAccount(email) {
  await runPsql(`DELETE FROM rental_customer_accounts WHERE email = '${email}';`);
}

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

function responseCookies(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }

  const cookie = response.headers.get("set-cookie");
  return cookie ? [cookie] : [];
}

test("production proxy trust preserves the admin session cookie", async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for the API server test");
  const removeLegacyCars = await insertMissingLegacyCars();

  const child = spawn("node", ["dist/index.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      SESSION_SECRET: process.env.SESSION_SECRET ?? "admin-session-regression-test-secret",
      ADMIN_PASSWORD: testAdminPassword,
      CORS_ALLOWED_ORIGINS: "https://app.example.test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForServer(child);

    const login = await fetch(`${baseUrl}/api/admin/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-proto": "https",
      },
       body: JSON.stringify({ username: "admin", password: testAdminPassword }),
    });

    assert.equal(login.status, 200);
    assert.deepEqual(await login.json(), {
      authenticated: true,
      username: "admin",
    });

    const sessionCookie = responseCookies(login).find((cookie) =>
      cookie.startsWith("connect.sid="),
    );
    assert.ok(
      sessionCookie,
      "login should emit the application connect.sid cookie behind the HTTPS proxy",
    );
    assert.match(sessionCookie, /; HttpOnly(?:;|$)/);
    assert.match(sessionCookie, /; Secure(?:;|$)/);
    assert.match(sessionCookie, /; SameSite=Lax(?:;|$)/);

    const secondLogin = await fetch(`${baseUrl}/api/admin/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: sessionCookie.split(";", 1)[0],
        "x-forwarded-proto": "https",
      },
      body: JSON.stringify({ username: "admin", password: testAdminPassword }),
    });
    assert.equal(secondLogin.status, 200);
    const regeneratedCookie = responseCookies(secondLogin).find((cookie) => cookie.startsWith("connect.sid="));
    assert.ok(regeneratedCookie, "a repeated login should issue a replacement session cookie");
    assert.notEqual(
      regeneratedCookie.split(";", 1)[0],
      sessionCookie.split(";", 1)[0],
      "admin login must regenerate the session ID",
    );

    const allowedOrigin = await fetch(`${baseUrl}/api/healthz`, {
      headers: { origin: "https://app.example.test" },
    });
    assert.equal(allowedOrigin.headers.get("access-control-allow-origin"), "https://app.example.test");
    assert.equal(allowedOrigin.headers.get("access-control-allow-credentials"), "true");

    const disallowedOrigin = await fetch(`${baseUrl}/api/healthz`, {
      headers: { origin: "https://evil.example" },
    });
    assert.equal(disallowedOrigin.headers.get("access-control-allow-origin"), null);

    const me = await fetch(`${baseUrl}/api/admin/me`, {
      headers: {
        cookie: regeneratedCookie.split(";", 1)[0],
        "x-forwarded-proto": "https",
      },
    });

    assert.equal(me.status, 200);
    assert.deepEqual(await me.json(), {
      authenticated: true,
      username: "admin",
    });
  } finally {
    if (child.exitCode === null) {
      const closed = new Promise((resolve) => child.once("close", resolve));
      child.kill("SIGTERM");
      await closed;
    }
    await removeLegacyCars();
  }
});

test("customer login regenerates the session and logout destroys it", async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for the API server test");
  const removeLegacyCars = await insertMissingLegacyCars();
  const email = `customer-session-${process.pid}-${Date.now()}@example.test`;
  const password = "customer-session-password";
  const child = spawn("node", ["dist/index.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      SESSION_SECRET: process.env.SESSION_SECRET ?? "customer-session-regression-test-secret",
      ADMIN_PASSWORD: testAdminPassword,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForServer(child);

    const registration = await fetch(`${baseUrl}/api/rental/account/register`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-proto": "https" },
      body: JSON.stringify({ email, password, fullName: "Session Test Customer" }),
    });
    assert.equal(registration.status, 201);
    const registrationCookie = responseCookies(registration).find((cookie) => cookie.startsWith("connect.sid="));
    assert.ok(registrationCookie, "registration should establish a customer session");

    const login = await fetch(`${baseUrl}/api/rental/account/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: registrationCookie.split(";", 1)[0],
        "x-forwarded-proto": "https",
      },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(login.status, 200);
    const loginCookie = responseCookies(login).find((cookie) => cookie.startsWith("connect.sid="));
    assert.ok(loginCookie, "customer login should issue a replacement session cookie");
    assert.notEqual(loginCookie.split(";", 1)[0], registrationCookie.split(";", 1)[0]);

    const logout = await fetch(`${baseUrl}/api/rental/account/logout`, {
      method: "POST",
      headers: { cookie: loginCookie.split(";", 1)[0], "x-forwarded-proto": "https" },
    });
    assert.equal(logout.status, 204);

    const me = await fetch(`${baseUrl}/api/rental/account/me`, {
      headers: { cookie: loginCookie.split(";", 1)[0], "x-forwarded-proto": "https" },
    });
    assert.equal(me.status, 401);
  } finally {
    if (child.exitCode === null) {
      const closed = new Promise((resolve) => child.once("close", resolve));
      child.kill("SIGTERM");
      await closed;
    }
    await deleteCustomerAccount(email);
    await removeLegacyCars();
  }
});
