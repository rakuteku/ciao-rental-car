import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("marketplace requests preserve consent, attribution, immutable offers and deadlines", async () => {
  const sql = await readFile(new URL("./0023_marketplace_requests.up.sql", import.meta.url), "utf8");
  for (const fragment of [
    "'requested', 'offer_pending', 'awaiting_payment', 'declined', 'expired'",
    "UNIQUE (hold_id)",
    "marketing_consent boolean NOT NULL DEFAULT false",
    "attribution jsonb",
    "initial_offer jsonb NOT NULL",
    "current_offer jsonb NOT NULL",
    "offer_hold_id integer REFERENCES rental_reservation_holds(id)",
    "accepted_offer jsonb",
    "respond_by timestamptz NOT NULL",
    "payment_deadline timestamptz",
    "marketplace_offer_snapshot jsonb",
  ]) assert.ok(sql.includes(fragment), `missing schema fragment: ${fragment}`);
});