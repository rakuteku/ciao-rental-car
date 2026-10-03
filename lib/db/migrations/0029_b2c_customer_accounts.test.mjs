import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const up = await readFile(new URL("./0029_b2c_customer_accounts.up.sql", import.meta.url), "utf8");
const down = await readFile(new URL("./0029_b2c_customer_accounts.down.sql", import.meta.url), "utf8");

test("B2C migration adds required pricing windows and customer accounts", () => {
  for (const column of [
    "pickup_window_start",
    "pickup_window_end",
    "return_window_start",
    "return_window_end",
  ]) {
    assert.match(up, new RegExp(`ADD COLUMN IF NOT EXISTS ${column} text NOT NULL`));
  }
  assert.match(up, /CREATE TABLE IF NOT EXISTS rental_customer_accounts/);
  assert.match(up, /password_hash text NOT NULL/);
  assert.match(up, /CREATE UNIQUE INDEX IF NOT EXISTS rental_customer_accounts_email_unique/);
  assert.match(up, /^BEGIN;[\s\S]*COMMIT;\s*$/);
});

test("B2C migration has an explicit rollback", () => {
  assert.match(down, /DROP TABLE IF EXISTS rental_customer_accounts/);
  assert.match(down, /DROP COLUMN IF EXISTS pickup_window_start/);
  assert.match(down, /DROP COLUMN IF EXISTS return_window_end/);
  assert.match(down, /^BEGIN;[\s\S]*COMMIT;\s*$/);
});
