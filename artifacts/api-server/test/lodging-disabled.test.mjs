import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";

const port = 28000 + process.pid % 1000;
const origin = `http://127.0.0.1:${port}`;

async function startApi(lodgingEnabled) {
  const child = spawn("node", ["dist/index.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, PORT: String(port), NODE_ENV: "test", LODGING_ENABLED: lodgingEnabled },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(output);
    try {
      if ((await fetch(`${origin}/api/healthz`)).ok) return child;
    } catch { /* Server is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill("SIGTERM");
  throw new Error(`API startup timed out: ${output}`);
}

async function stopApi(child) {
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("close", resolve));
}

test("disabled lodging routes redirect and sitemap omits lodging URLs", async () => {
  assert.ok(process.env.DATABASE_URL);
  assert.ok(process.env.SESSION_SECRET);
  const child = await startApi("false");
  try {
    for (const path of ["/lodging", "/lodging/sapporo-room", "/ja/lodging", "/zh-TW/lodging/sapporo-room"]) {
      const response = await fetch(`${origin}${path}`, { redirect: "manual" });
      assert.equal(response.status, 301, path);
      assert.equal(response.headers.get("location"), "https://primostay.jp", path);
    }

    const sitemap = await fetch(`${origin}/api/sitemap.xml`);
    assert.equal(sitemap.status, 200);
    assert.doesNotMatch(await sitemap.text(), /lodging/i);
  } finally {
    await stopApi(child);
  }
});

test("enabled lodging routes are not redirected and sitemap includes lodging URLs", async () => {
  assert.ok(process.env.DATABASE_URL);
  assert.ok(process.env.SESSION_SECRET);
  const child = await startApi("true");
  try {
    const response = await fetch(`${origin}/lodging`, { redirect: "manual" });
    assert.notEqual(response.status, 301);

    const sitemap = await fetch(`${origin}/api/sitemap.xml`);
    assert.equal(sitemap.status, 200);
    assert.match(await sitemap.text(), /\/lodging/);
  } finally {
    await stopApi(child);
  }
});
