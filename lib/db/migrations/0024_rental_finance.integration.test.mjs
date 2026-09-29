import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";

// This creates and removes only its own isolated schema in the development
// database. Production credentials must never be passed to this test.
test("finance and notification migrations execute against PostgreSQL", {
  skip: !process.env.DATABASE_URL && "DATABASE_URL is required for an execution test",
}, async () => {
  const schema = `migration_check_${randomUUID().replaceAll("-", "")}`;
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}", public`);
    // 0023's already-existing request storage and the notification outbox are
    // represented locally; external FK targets resolve to public.
    await client.query("CREATE TYPE rental_marketplace_request_status AS ENUM ('requested', 'offer_pending', 'awaiting_payment', 'declined', 'expired')");
    await client.query("CREATE TABLE rental_marketplace_requests (id serial PRIMARY KEY, status rental_marketplace_request_status NOT NULL DEFAULT 'requested')");
    await client.query("CREATE TABLE rental_notifications (id serial PRIMARY KEY)");
    for (const migration of ["0024_rental_finance.up.sql", "0025_rental_notification_delivery.up.sql"]) {
      const sql = await readFile(new URL(migration, import.meta.url), "utf8");
      await client.query(sql);
    }
    const { rows } = await client.query(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = $1 AND (
        (table_name = 'rental_payments' AND column_name = 'checkout_attempts')
        OR (table_name = 'rental_notifications' AND column_name = 'delivery_status')
        OR (table_name = 'rental_marketplace_requests' AND column_name = 'locale')
      )
    `, [schema]);
    assert.deepEqual(
      rows.map(({ table_name, column_name }) => `${table_name}.${column_name}`).sort(),
      ["rental_marketplace_requests.locale", "rental_notifications.delivery_status", "rental_payments.checkout_attempts"],
    );
  } finally {
    await client.query("SET search_path TO public");
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  }
});