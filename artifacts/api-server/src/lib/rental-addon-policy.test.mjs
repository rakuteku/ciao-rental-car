import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addonCategory,
  validateProtectionSelection,
} from "./rental-addon-policy.mjs";

test("winter tires are excluded even for legacy translated records", () => {
  assert.equal(addonCategory({ name: "Winter Tires" }), "winter_tires");
  assert.equal(
    addonCategory({ name: "Winter Tire Upgrade", category: "equipment" }),
    "winter_tires",
  );
  assert.equal(
    addonCategory({ name: "Seasonal equipment", nameJa: "スタッドレスタイヤ" }),
    "winter_tires",
  );
  assert.equal(
    addonCategory({ name: "Seat", category: "equipment" }),
    "equipment",
  );
});
test("CDW and NOC can be selected together but not with a full or basic plan", () => {
  const cdw = { category: "insurance", insuranceKind: "cdw" };
  const noc = { category: "insurance", insuranceKind: "noc" };
  assert.doesNotThrow(() => validateProtectionSelection([cdw, noc]));
  assert.throws(
    () =>
      validateProtectionSelection([
        cdw,
        { category: "insurance", insuranceKind: "full" },
      ]),
    /protection package/,
  );
  assert.throws(
    () =>
      validateProtectionSelection([
        noc,
        { category: "insurance", insuranceKind: "basic" },
      ]),
    /protection package/,
  );
  assert.throws(
    () => validateProtectionSelection([cdw, cdw]),
    /protection package/,
  );
});
