import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";

test("trip migration applies and backfills additional authorized drivers in an isolated schema", {
  skip: !process.env.DATABASE_URL && "DATABASE_URL is required for an execution test",
}, async () => {
  const schema = `rental_trip_migration_${randomUUID().replaceAll("-", "")}`;
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}", public`);
    await client.query("CREATE TYPE rental_reservation_status AS ENUM ('inquiry', 'return_completed')");
    await client.query("CREATE TYPE rental_inspection_type AS ENUM ('pickup', 'return')");
    await client.query("CREATE TABLE rental_drivers (id serial PRIMARY KEY, full_name text NOT NULL, email text NOT NULL, phone text NOT NULL)");
    await client.query("CREATE TABLE rental_vehicles (id serial PRIMARY KEY)");
    await client.query(`
      CREATE TABLE rental_reservations (
        id serial PRIMARY KEY, primary_driver_id integer REFERENCES rental_drivers(id),
        vehicle_id integer NOT NULL REFERENCES rental_vehicles(id), status rental_reservation_status NOT NULL,
        source text NOT NULL
      )
    `);
    await client.query("CREATE TABLE rental_inspections (id serial PRIMARY KEY, reservation_id integer NOT NULL REFERENCES rental_reservations(id), type rental_inspection_type NOT NULL)");
    await client.query("CREATE TABLE rental_inspection_photos (id serial PRIMARY KEY, inspection_id integer NOT NULL REFERENCES rental_inspections(id), url text NOT NULL)");
    await client.query(`
      CREATE TABLE rental_marketplace_requests (
        id serial PRIMARY KEY, reservation_id integer REFERENCES rental_reservations(id),
        additional_drivers jsonb NOT NULL DEFAULT '[]'::jsonb
      )
    `);
    const { rows: [primary] } = await client.query(
      "INSERT INTO rental_drivers(full_name,email,phone) VALUES('Primary','primary@example.invalid','1') RETURNING id",
    );
    await client.query("INSERT INTO rental_vehicles DEFAULT VALUES");
    const { rows: [reservation] } = await client.query(
      "INSERT INTO rental_reservations(primary_driver_id,vehicle_id,status,source) VALUES($1,1,'inquiry','marketplace_request') RETURNING id",
      [primary.id],
    );
    await client.query(
      "INSERT INTO rental_marketplace_requests(reservation_id,additional_drivers) VALUES($1,$2::jsonb)",
      [reservation.id, JSON.stringify([{ fullName: "Additional", email: "extra@example.invalid", phone: "2" }])],
    );

    const migration = await readFile(new URL("./0026_rental_trip_handover.up.sql", import.meta.url), "utf8");
    await client.query(migration);

    const { rows: drivers } = await client.query(`
      SELECT d.full_name, rd.is_primary
      FROM rental_reservation_drivers rd JOIN rental_drivers d ON d.id = rd.driver_id
      WHERE rd.reservation_id = $1 ORDER BY rd.is_primary DESC
    `, [reservation.id]);
    assert.deepEqual(drivers, [
      { full_name: "Primary", is_primary: true },
      { full_name: "Additional", is_primary: false },
    ]);
    const { rows: [closed] } = await client.query(`
      SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'rental_reservation_status' AND enumlabel = 'closed'
    `);
    assert.equal(closed.enumlabel, "closed");
    const { rows: [table] } = await client.query(`
      SELECT to_regclass('rental_trip_charge_approvals') AS name
    `);
    assert.equal(table.name, "rental_trip_charge_approvals");
  } finally {
    await client.query("SET search_path TO public");
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  }
});