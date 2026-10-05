import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const up = await readFile(new URL("./0030_time_based_rental_pricing.up.sql", import.meta.url), "utf8");
const down = await readFile(new URL("./0030_time_based_rental_pricing.down.sql", import.meta.url), "utf8");

test("time-based pricing migration contains the required rate and rule fields", () => {
  for (const field of ["rate_12_hours", "rate_24_hours", "additional_24_hours", "additional_hour", "grace_period_minutes", "special_peak_overlap"]) {
    assert.match(up, new RegExp(field));
    assert.match(down, new RegExp(field));
  }
  assert.match(up, /UPDATE rental_vehicle_pricing/);
  assert.match(up, /rental_addon_pricing_type ADD VALUE IF NOT EXISTS 'per_started_24_hours'/);
});
