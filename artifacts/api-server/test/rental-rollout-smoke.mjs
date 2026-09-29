/**
 * Compare public legacy surfaces across two separately started API configurations.
 * Run with RENTAL_MARKETPLACE_ENABLED unset first (MODE=baseline), then true
 * (MODE=compare), against the same database and SNAPSHOT_FILE.
 * Never write to the production database for this check.
 */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

const base = process.env.TEST_API_BASE_URL;
const mode = process.env.MODE;
const path = process.env.SNAPSHOT_FILE;
if (!base || !path || !["baseline", "compare"].includes(mode)) {
  throw new Error("Set TEST_API_BASE_URL, SNAPSHOT_FILE and MODE=baseline|compare");
}

async function request(route) {
  const response = await fetch(new URL(route, `${base.replace(/\/$/, "")}/`));
  assert.equal(response.status, 200, `${route} returned ${response.status}`);
  return response.json();
}

const [cars, rooms, home, jaHome, seo, config] = await Promise.all([
  request("cars"), request("rooms"), request("content/home"),
  request("content/home?language=ja"), request("seo/home"),
  request("rental/marketplace/config"),
]);
const carDetails = await Promise.all(cars.map((car) => request(`cars/${car.id}`)));
const roomDetails = await Promise.all(rooms.map((room) => request(`rooms/${encodeURIComponent(room.slug)}`)));
const bookingStatus = (await fetch(new URL("rental/my-bookings/0", `${base.replace(/\/$/, "")}/`))).status;
assert.ok([401, 404].includes(bookingStatus), "anonymous booking detail must remain private");
const adminStatus = (await fetch(new URL("admin/content", `${base.replace(/\/$/, "")}/`))).status;
assert.equal(adminStatus, 401, "content editing must remain protected");
const sitemapResponse = await fetch(new URL("sitemap.xml", `${base.replace(/\/$/, "")}/`));
assert.equal(sitemapResponse.status, 200);
const sitemap = await sitemapResponse.text();
const robotsResponse = await fetch(new URL("robots.txt", `${base.replace(/\/$/, "")}/`));
assert.equal(robotsResponse.status, 200);
const robots = await robotsResponse.text();
// The two API processes can be reached through different hosts. Sitemap and
// robots generate absolute links from the incoming host, so compare paths and
// content while ignoring only that expected transport-origin difference.
const normalizeOrigin = (value) => value.replace(/(<loc>|Sitemap: )https?:\/\/[^/]+/g, "$1<origin>");
const snapshot = {
  cars, carDetails, rooms, roomDetails, home, jaHome, seo,
  sitemap: normalizeOrigin(sitemap), robots: normalizeOrigin(robots),
};
assert.equal(config.enabled, mode === "compare", "server flag does not match smoke mode");
if (mode === "baseline") {
  await writeFile(path, JSON.stringify(snapshot, null, 2));
  process.stdout.write(`Flag-off baseline saved to ${path}\n`);
} else {
  const previous = JSON.parse(await readFile(path, "utf8"));
  assert.deepEqual(snapshot, previous, "legacy fleet/prices, lodging, content/locales or SEO changed across flags");
  process.stdout.write("Flag-on public legacy surfaces match the flag-off baseline\n");
}