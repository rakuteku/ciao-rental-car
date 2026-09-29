import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";

test("rental reservation exception migration creates isolated quote and provider ledger fields", {
  skip: !process.env.DATABASE_URL && "DATABASE_URL is required for migration execution test",
}, async () => {
  const schema = `rental_exception_quote_${randomUUID().replaceAll("-", "")}`;
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}", public`);
    await client.query("CREATE TABLE rental_operators (id serial PRIMARY KEY)");
    await client.query("CREATE TABLE rental_vehicles (id serial PRIMARY KEY)");
    await client.query("CREATE TABLE rental_reservations (id serial PRIMARY KEY)");
    const migration = await readFile(new URL("./0027_rental_exceptions.up.sql", import.meta.url), "utf8");
    await client.query(migration);
    const { rows: [table] } = await client.query(
      "SELECT to_regclass('rental_reservation_exceptions') AS name",
    );
    assert.equal(table.name, "rental_reservation_exceptions");
    const { rows: columns } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'rental_reservation_exceptions'
    `, [schema]);
    const names = new Set(columns.map((column) => column.column_name));
    for (const required of [
      "quote_snapshot", "policy_snapshot", "consent_at", "stripe_checkout_session_id",
      "stripe_payment_intent_id", "stripe_refund_id", "expires_at", "target_vehicle_id",
    ]) assert.equal(names.has(required), true, `missing ${required}`);
    const { rows: indexes } = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = $1 AND tablename = 'rental_reservation_exceptions'
    `, [schema]);
    assert.ok(indexes.some((index) => index.indexname === "rental_reservation_exceptions_checkout_unique"));
  } finally {
    await client.query("SET search_path TO public");
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  }
});

test("reservation exception migration has a reversible explicit down migration", async () => {
  const up = await readFile(new URL("./0027_rental_exceptions.up.sql", import.meta.url), "utf8");
  const down = await readFile(new URL("./0027_rental_exceptions.down.sql", import.meta.url), "utf8");
  assert.match(up, /BEGIN;[\s\S]*COMMIT;/);
  assert.match(down, /DROP TABLE IF EXISTS rental_reservation_exceptions/);
});