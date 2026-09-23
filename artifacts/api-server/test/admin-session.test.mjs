import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";

const port = 19000 + (process.pid % 1000);
const baseUrl = `http://127.0.0.1:${port}`;
const testAdminPassword = "test-admin-password-123";

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

  const child = spawn("node", ["dist/index.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      SESSION_SECRET: process.env.SESSION_SECRET ?? "admin-session-regression-test-secret",
      ADMIN_PASSWORD: testAdminPassword,
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

    const me = await fetch(`${baseUrl}/api/admin/me`, {
      headers: {
        cookie: sessionCookie.split(";", 1)[0],
        "x-forwarded-proto": "https",
      },
    });

    assert.equal(me.status, 200);
    assert.deepEqual(await me.json(), {
      authenticated: true,
      username: "admin",
    });
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("close", resolve));
  }
});