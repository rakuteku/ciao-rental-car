import assert from "node:assert/strict";
import test from "node:test";
import { tokyoHour } from "../src/lib/rental-time.mjs";

test("Tokyo hour does not depend on the process timezone", () => {
  assert.equal(tokyoHour("2026-11-20T01:00:00Z"), 10);
});
