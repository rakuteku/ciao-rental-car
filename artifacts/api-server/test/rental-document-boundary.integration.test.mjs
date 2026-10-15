import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { build } from "esbuild";
import express from "express";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const apiDir = new URL("..", import.meta.url);
const dbEntry = new URL("../../../lib/db/src/index.ts", import.meta.url);
const requireDb = createRequire(new URL("../../../lib/db/package.json", import.meta.url));
const requireApi = createRequire(new URL("../package.json", import.meta.url));
const { Pool } = requireDb("pg");

function packageRoot(resolvedFile, packageName) {
  let current = path.dirname(resolvedFile);
  while (current !== path.dirname(current)) {
    try {
      const { readFileSync } = requireApi("node:fs");
      if (JSON.parse(readFileSync(path.join(current, "package.json"), "utf8")).name === packageName) return current;
    } catch { /* Continue through package subdirectories. */ }
    current = path.dirname(current);
  }
  throw new Error(`Missing ${packageName}`);
}

test("legacy bookings reject document URLs and limit private uploads to their booking session", {
  skip: !process.env.DATABASE_URL && "DATABASE_URL is required",
}, async () => {
  const schema = `rental_documents_${randomUUID().replaceAll("-", "")}`;
  const root = new Pool({ connectionString: process.env.DATABASE_URL });
  const originalUrl = process.env.DATABASE_URL;
  const originalBucket = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  const originalDir = process.env.PRIVATE_OBJECT_DIR;
  const originalFlag = process.env.RENTAL_MARKETPLACE_ENABLED;
  const temp = await mkdtemp(path.join(apiDir.pathname, ".rental-documents-"));
  let routePool;
  let server;
  try {
    await root.query(`CREATE SCHEMA "${schema}"`);
    for (const table of ["rental_operators", "rental_drivers", "rental_vehicles", "rental_reservations", "rental_driver_documents"]) {
      await root.query(`CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
    }
    const id = 1_800_000_000 + (process.pid % 100_000);
    await root.query(`INSERT INTO "${schema}".rental_operators (id,name,slug) VALUES ($1,'Test operator',$2)`, [id, `docs-${schema}`]);
    await root.query(`INSERT INTO "${schema}".rental_drivers (id,full_name,email,phone) VALUES ($1,'Owner','owner@example.invalid','1234567890'),($2,'Other','other@example.invalid','1234567890')`, [id + 1, id + 2]);
    await root.query(`INSERT INTO "${schema}".rental_vehicles (id,operator_id,internal_name,public_title,slug,brand,model,year,status,moderation_status) VALUES ($1,$2,'Test car','Test car',$3,'Test','Car',2025,'published','approved')`, [id + 3, id, `car-${schema}`]);
    for (const [bookingId, driverId] of [[id + 4, id + 1], [id + 5, id + 2]]) {
      await root.query(`INSERT INTO "${schema}".rental_reservations (id,operator_id,vehicle_id,primary_driver_id,pickup_at,return_at,pickup_location,return_location,status,payment_status,final_total,source) VALUES ($1,$2,$3,$4,now()+interval '10 days',now()+interval '11 days','Pickup','Return','confirmed','pending',10000,'web')`, [bookingId, id, id + 3, driverId]);
    }
    const isolated = new URL(originalUrl);
    isolated.searchParams.set("options", `-csearch_path=${schema},public`);
    process.env.DATABASE_URL = isolated.toString();
    process.env.RENTAL_MARKETPLACE_ENABLED = "false";
    delete process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    delete process.env.PRIVATE_OBJECT_DIR;
    const entry = `
      import privateDocuments from ${JSON.stringify(new URL("../src/routes/rental-private-documents.ts", import.meta.url).pathname)};
      import reservations from ${JSON.stringify(new URL("../src/routes/rental-reservations.ts", import.meta.url).pathname)};
      import operators from ${JSON.stringify(new URL("../src/routes/operators.ts", import.meta.url).pathname)};
      import { pool } from ${JSON.stringify(dbEntry.pathname)};
      import { rentalDocumentStorage, rentalPrivateDocumentStorageConfigured } from ${JSON.stringify(new URL("../src/lib/rental-private-documents.ts", import.meta.url).pathname)};
      export { privateDocuments, reservations, operators, pool, rentalDocumentStorage, rentalPrivateDocumentStorageConfigured };
    `;
    const nodeModules = path.join(temp, "node_modules");
    await mkdir(nodeModules, { recursive: true });
    for (const [name, resolved, packageName] of [
      ["express", requireApi.resolve("express"), "express"],
      ["pg", requireDb.resolve("pg"), "pg"],
      ["drizzle-orm", requireDb.resolve("drizzle-orm"), "drizzle-orm"],
      ["drizzle-zod", requireDb.resolve("drizzle-zod"), "drizzle-zod"],
      ["zod", requireApi.resolve("zod/v4"), "zod"],
      ["@google-cloud/storage", requireApi.resolve("@google-cloud/storage"), "@google-cloud/storage"],
      ["stripe", requireApi.resolve("stripe"), "stripe"],
      ["pino", requireApi.resolve("pino"), "pino"],
    ]) {
      const target = path.join(nodeModules, name);
      await mkdir(path.dirname(target), { recursive: true });
      await symlink(packageRoot(resolved, packageName), target, "dir");
    }
    const bundle = path.join(temp, "routes.mjs");
    await build({
      stdin: { contents: entry, resolveDir: apiDir.pathname, sourcefile: "document-boundary-entry.ts" },
      outfile: bundle, bundle: true, packages: "external", platform: "node", format: "esm",
      plugins: [{ name: "isolated-db", setup(api) { api.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: dbEntry.pathname })); } }],
    });
    const routes = await import(pathToFileURL(bundle).href);
    routePool = routes.pool;
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      const actor = req.get("x-test-actor");
      req.session = actor === "owner" ? { rentalCustomerEmail: "owner@example.invalid", rentalCustomerBookingId: id + 4 } : actor === "other" ? { rentalCustomerEmail: "other@example.invalid", rentalCustomerBookingId: id + 5 } : actor === "admin" ? { admin: { username: "test-admin" } } : {};
      next();
    });
    app.use("/api", routes.privateDocuments, routes.reservations, routes.operators);
    server = app.listen(0);
    await new Promise(resolve => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const post = (route, actor, body) => fetch(`${base}${route}`, { method: "POST", headers: { "Content-Type": "application/json", "x-test-actor": actor }, body: JSON.stringify(body) });

    const legacyUrl = await post("/rental/reservations", "owner", { documents: [{ docType: "passport", fileUrl: "https://example.invalid/id.jpg" }] });
    assert.equal(legacyUrl.status, 400);
    const directUrl = await post(`/rental/my-bookings/${id + 4}/documents`, "owner", { docType: "passport", fileUrl: "https://example.invalid/id.jpg" });
    assert.equal(directUrl.status, 410);
    assert.equal(routes.rentalPrivateDocumentStorageConfigured(), false);
    assert.deepEqual(await (await fetch(`${base}/rental/marketplace/config`)).json(), { enabled: false, privateDocumentUploadAvailable: false });
    const uploadBody = { docType: "passport", contentType: "image/jpeg" };
    const unavailable = await post(`/rental/my-bookings/${id + 4}/documents/upload-request`, "owner", uploadBody);
    assert.equal(unavailable.status, 503);

    process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID = "private-test-bucket";
    process.env.PRIVATE_OBJECT_DIR = "/private-test-bucket/private";
    assert.equal(routes.rentalPrivateDocumentStorageConfigured(), true);
    assert.deepEqual(await (await fetch(`${base}/rental/marketplace/config`)).json(), { enabled: false, privateDocumentUploadAvailable: true });
    routes.rentalDocumentStorage.bucket = () => ({
      getFiles: async () => [[]],
      file: () => ({ createWriteStream: () => new Writable({ write(_chunk, _encoding, callback) { callback(); } }), createReadStream: () => Readable.from("fake-image"), getMetadata: async () => [{ contentType: "image/jpeg", size: 10 }], delete: async () => {} }),
    });
    const forbidden = await post(`/rental/my-bookings/${id + 4}/documents/upload-request`, "other", uploadBody);
    assert.equal(forbidden.status, 401);
    const unsupported = await post(`/rental/my-bookings/${id + 4}/documents/upload-request`, "owner", { ...uploadBody, contentType: "text/html" });
    assert.equal(unsupported.status, 400);
    const allowed = await post(`/rental/my-bookings/${id + 4}/documents/upload-request`, "owner", uploadBody);
    assert.equal(allowed.status, 201);
    const request = await allowed.json();
    assert.match(request.uploadPath, new RegExp(`^/api/rental/my-bookings/${id + 4}/documents/`));
    assert.equal(request.maxBytes, 10 * 1024 * 1024);
    const foreignPut = await fetch(`${base}${request.uploadPath.replace(/^\/api/, "")}`, { method: "PUT", headers: { "Content-Type": "image/jpeg", "x-test-actor": "other" }, body: "fake-image" });
    assert.equal(foreignPut.status, 401);
    const oversized = await fetch(`${base}${request.uploadPath.replace(/^\/api/, "")}`, { method: "PUT", headers: { "Content-Type": "image/jpeg", "x-test-actor": "owner" }, body: Buffer.alloc(10 * 1024 * 1024 + 1) });
    assert.equal(oversized.status, 413);
    const ownPut = await fetch(`${base}${request.uploadPath.replace(/^\/api/, "")}`, { method: "PUT", headers: { "Content-Type": "image/jpeg", "x-test-actor": "owner" }, body: "fake-image" });
    assert.equal(ownPut.status, 204);
    const { rows } = await root.query(`SELECT status,file_url FROM "${schema}".rental_driver_documents WHERE id=$1`, [request.documentId]);
    assert.equal(rows[0].status, "submitted");
    assert.match(rows[0].file_url, /^rental-private:\/\//);
    const staffPath = `/admin/rental/reservations/${id + 4}/driver-documents/${request.documentId}/content`;
    const directView = await fetch(`${base}${staffPath}`, { headers: { "x-test-actor": "admin" } });
    assert.equal(directView.status, 403);
    const linkResponse = await fetch(`${base}${staffPath}?link=1`, { headers: { "x-test-actor": "admin" } });
    assert.equal(linkResponse.status, 200);
    const { url: signedUrl } = await linkResponse.json();
    const badUrl = new URL(signedUrl, base);
    badUrl.searchParams.set("signature", "0".repeat(64));
    assert.equal((await fetch(badUrl, { headers: { "x-test-actor": "admin" } })).status, 403);
    const expiredUrl = new URL(signedUrl, base);
    expiredUrl.searchParams.set("expires", String(Date.now() - 1));
    assert.equal((await fetch(expiredUrl, { headers: { "x-test-actor": "admin" } })).status, 403);
    const anonymousView = await fetch(new URL(signedUrl, base));
    assert.equal(anonymousView.status, 401);
    const staffView = await fetch(new URL(signedUrl, base), { headers: { "x-test-actor": "admin" } });
    assert.equal(staffView.status, 200);
    assert.equal(await staffView.text(), "fake-image");
    assert.match(staffView.headers.get("cache-control"), /no-store/);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (routePool) await routePool.end();
    process.env.DATABASE_URL = originalUrl;
    for (const [key, value] of [["DEFAULT_OBJECT_STORAGE_BUCKET_ID", originalBucket], ["PRIVATE_OBJECT_DIR", originalDir], ["RENTAL_MARKETPLACE_ENABLED", originalFlag]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await root.end();
    await rm(temp, { recursive: true, force: true });
  }
});
