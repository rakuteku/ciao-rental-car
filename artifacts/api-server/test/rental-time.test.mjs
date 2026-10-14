import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

const instant = "2026-11-20T01:00:00Z";
const serverModule = new URL("../src/lib/rental-time.mjs", import.meta.url).href;
const webModule = new URL("../../ciao-rental/src/lib/rental-marketplace.ts", import.meta.url).href;
const check = `
  import assert from "node:assert/strict";
  import { formatTokyo as serverFormatTokyo, tokyoHour as serverTokyoHour } from ${JSON.stringify(serverModule)};
  import { formatTokyo as webFormatTokyo, tokyoHour as webTokyoHour } from ${JSON.stringify(webModule)};
  const instant = ${JSON.stringify(instant)};
  for (const [formatTokyo, tokyoHour] of [[serverFormatTokyo, serverTokyoHour], [webFormatTokyo, webTokyoHour]]) {
    assert.equal(tokyoHour(instant), 10);
    assert.match(formatTokyo(instant, "en"), /10:00.*JST/);
    assert.match(formatTokyo(instant, "ja"), /10:00.*日本時間/);
    assert.match(formatTokyo(instant, "zh-TW"), /10:00.*日本時間/);
  }
`;

test("Tokyo formatters do not depend on the process timezone", () => {
  for (const TZ of ["America/Los_Angeles", "Asia/Taipei"]) {
    execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", check], {
      env: { ...process.env, TZ },
      stdio: "pipe",
    });
  }
});
