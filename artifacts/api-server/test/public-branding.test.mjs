import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the public HTML entry point titles the site PrimoStay Car Rental", async () => {
  const html = await readFile(new URL("../../ciao-rental/index.html", import.meta.url), "utf8");
  assert.ok(html.includes("<title>PrimoStay Car Rental</title>"));
});
