import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { build } from "esbuild";
import express from "express";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const requireDb = createRequire(new URL("../../../lib/db/package.json", import.meta.url));
const requireApi = createRequire(new URL("../package.json", import.meta.url));
const { Pool } = requireDb("pg");
const apiDir = new URL("..", import.meta.url);
const dbEntry = new URL("../../../lib/db/src/index.ts", import.meta.url);

function packageRoot(resolvedFile, packageName) {
  let current = path.dirname(resolvedFile);
  while (current !== path.dirname(current)) {
    try {
      const metadata = JSON.parse(requireApi("node:fs").readFileSync(path.join(current, "package.json"), "utf8"));
      if (metadata.name === packageName) return current;
    } catch {
      // Continue up through scoped packages and package subdirectories.
    }
    current = path.dirname(current);
  }
  throw new Error(`Could not locate package root for ${packageName}`);
}

// Run with: pnpm --filter @workspace/api-server run test:rental-trip-integration
// DATABASE_URL must point at a development/test PostgreSQL database, never production.
test("customer acknowledgements gate close and the same payload persists reconciled trip finance", {
  skip: !process.env.DATABASE_URL && "DATABASE_URL is required for PostgreSQL integration",
}, async (t) => {
  const schema = `rental_trip_close_${randomUUID().replaceAll("-", "")}`;
  const rootPool = new Pool({ connectionString: process.env.DATABASE_URL });
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalMarketplaceFlag = process.env.RENTAL_MARKETPLACE_ENABLED;
  const temporaryDir = await mkdtemp(path.join(apiDir.pathname, ".rental-trip-close-"));
  let routePool;
  let server;
  try {
    await rootPool.query(`CREATE SCHEMA "${schema}"`);
    const tables = [
      "rental_operators",
      "rental_operator_staff",
      "rental_drivers",
      "rental_vehicles",
      "rental_reservations",
      "rental_inspections",
      "rental_inspection_photos",
      "rental_inspection_access",
      "rental_damages",
      "rental_reservation_drivers",
      "rental_driver_documents",
      "rental_trip_charge_approvals",
      "rental_payments",
      "rental_trip_ledger",
    ];
    for (const table of tables) {
      await rootPool.query(`CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
      await rootPool.query(`CREATE SEQUENCE "${schema}"."${table}_test_id_seq"`);
      await rootPool.query(
        `ALTER TABLE "${schema}"."${table}" ALTER COLUMN id SET DEFAULT nextval('"${schema}"."${table}_test_id_seq"'::regclass)`,
      );
      await rootPool.query(`ALTER SEQUENCE "${schema}"."${table}_test_id_seq" OWNED BY "${schema}"."${table}".id`);
    }

    const operatorId = 1_600_000_000 + (process.pid % 100_000);
    const staffId = operatorId + 1;
    const driverId = operatorId + 2;
    const reservationId = operatorId + 3;
    const requestId = operatorId + 4;
    const paymentId = operatorId + 5;
    const inspectionId = operatorId + 6;
    await rootPool.query(`
      INSERT INTO "${schema}".rental_operators
        (id,slug,name,status,verification_status,is_platform)
      VALUES ($1,$2,'Trip integration operator','active','approved',false)
    `, [operatorId, `trip-close-${schema}`]);
    await rootPool.query(`
      INSERT INTO "${schema}".rental_operator_staff
        (id,operator_id,identity_subject,email,password_hash,role,status,active)
      VALUES ($1,$2,$3,$4,'integration-test-hash','owner','active',true)
    `, [staffId, operatorId, `trip-close-${schema}`, `staff-${schema}@example.invalid`]);
    await rootPool.query(`
      INSERT INTO "${schema}".rental_drivers(id,full_name,email,phone)
      VALUES ($1,'Trip Test Customer',$2,'+81000000000')
    `, [driverId, `customer-${schema}@example.invalid`]);
    await rootPool.query(`
      INSERT INTO "${schema}".rental_reservations
        (id,operator_id,vehicle_id,primary_driver_id,pickup_at,return_at,pickup_location,return_location,
         status,payment_status,paid_amount,outstanding,refund_amount,final_total,source,marketplace_offer_snapshot)
      VALUES ($1,$2,1,$3,'2035-01-01T00:00:00Z','2035-01-02T00:00:00Z','Test pickup','Test return',
        'return_completed','partially_refunded',10000,0,1000,10000,'marketplace_request',$4::jsonb)
    `, [reservationId, operatorId, driverId, JSON.stringify({ totalPrice: 10_000 })]);
    await rootPool.query(`
      INSERT INTO "${schema}".rental_payments
        (id,request_id,reservation_id,operator_id,status,currency,amount,commission_amount,
        commission_basis_points,commission_policy_version,operator_share_amount,refunded_amount,price_snapshot,
         policy_snapshot,idempotency_key,paid_at)
      VALUES ($1,$2,$3,$4,'partially_refunded','jpy',10000,1500,1500,'trip-test-v1',8500,1000,
        '{"amount":10000}'::jsonb,'{}'::jsonb,$5,now())
    `, [paymentId, requestId, reservationId, operatorId, `trip-close-${schema}`]);
    await rootPool.query(`
      INSERT INTO "${schema}".rental_inspections(id,reservation_id,type,discrepancies)
      VALUES ($1,$2,'return',$3::jsonb)
    `, [inspectionId, reservationId, JSON.stringify([
      { kind: "provisional_charge", code: "cleaning", amount: 500, status: "provisional" },
      { kind: "provisional_charge", code: "fuel", amount: 200, status: "provisional" },
    ])]);

    const isolatedUrl = new URL(originalDatabaseUrl);
    isolatedUrl.searchParams.set("options", `-csearch_path=${schema},public`);
    process.env.DATABASE_URL = isolatedUrl.toString();
    process.env.RENTAL_MARKETPLACE_ENABLED = "true";
    const entry = `
      import rentalTrip from ${JSON.stringify(new URL("../src/routes/rental-trip.ts", import.meta.url).pathname)};
      import { pool } from ${JSON.stringify(dbEntry.pathname)};
      export { rentalTrip, pool };
    `;
    const bundlePath = path.join(temporaryDir, "rental-trip.mjs");
    const isolatedNodeModules = path.join(temporaryDir, "node_modules");
    await mkdir(isolatedNodeModules, { recursive: true });
    const packages = [
      ["express", requireApi.resolve("express"), "express"],
      ["pg", requireDb.resolve("pg"), "pg"],
      ["drizzle-orm", requireDb.resolve("drizzle-orm"), "drizzle-orm"],
      ["drizzle-zod", requireDb.resolve("drizzle-zod"), "drizzle-zod"],
      ["zod", requireApi.resolve("zod/v4"), "zod"],
      ["@google-cloud/storage", requireApi.resolve("@google-cloud/storage"), "@google-cloud/storage"],
    ];
    for (const [moduleName, resolvedFile, packageName] of packages) {
      const target = path.join(isolatedNodeModules, moduleName);
      await mkdir(path.dirname(target), { recursive: true });
      await symlink(packageRoot(resolvedFile, packageName), target, "dir");
    }
    await build({
      stdin: { contents: entry, resolveDir: apiDir.pathname, sourcefile: "rental-trip-integration-entry.ts" },
      outfile: bundlePath,
      bundle: true,
      packages: "external",
      platform: "node",
      format: "esm",
      plugins: [{
        name: "real-isolated-db",
        setup(buildApi) {
          buildApi.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: dbEntry.pathname }));
        },
      }],
    });
    const { rentalTrip, pool } = await import(pathToFileURL(bundlePath).href);
    routePool = pool;
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.log = { warn() {}, error() {}, info() {} };
      req.session = {
        partner: { operatorId, staffId, role: "owner" },
        rentalCustomerEmail: `customer-${schema}@example.invalid`,
        rentalCustomerBookingId: reservationId,
      };
      next();
    });
    app.use("/api", rentalTrip);
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const request = (route, method, body) => fetch(`${base}${route}`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    const mismatchedAck = await request(`/rental/my-bookings/${reservationId}/charges/acknowledge`, "POST", {
      charges: [{ code: "not-a-return-claim", amount: 500 }],
    });
    assert.equal(mismatchedAck.status, 409);
    const { rows: [noInvalidApproval] } = await rootPool.query(
      `SELECT count(*)::int AS count FROM "${schema}".rental_trip_charge_approvals`,
    );
    assert.equal(noInvalidApproval.count, 0);

    const cleaningAck = await request(`/rental/my-bookings/${reservationId}/charges/acknowledge`, "POST", {
      charges: [{ code: "cleaning", amount: 500 }],
    });
    assert.equal(cleaningAck.status, 200);
    const closePayload = { approvedExtras: { cleaning: 500, fuel: 200 }, approvedRefund: 200 };
    const unmatchedClose = await request(`/partner/rental/reservations/${reservationId}/close`, "POST", closePayload);
    assert.equal(unmatchedClose.status, 409, "every approved extra must have a matching customer acknowledgement");
    const { rows: [unclosed] } = await rootPool.query(
      `SELECT status, final_total FROM "${schema}".rental_reservations WHERE id=$1`,
      [reservationId],
    );
    assert.equal(unclosed.status, "return_completed");
    assert.equal(Number(unclosed.final_total), 10_000);
    const { rows: [emptyLedger] } = await rootPool.query(
      `SELECT count(*)::int AS count FROM "${schema}".rental_trip_ledger WHERE reservation_id=$1`,
      [reservationId],
    );
    assert.equal(emptyLedger.count, 0);

    const fuelAck = await request(`/rental/my-bookings/${reservationId}/charges/acknowledge`, "POST", {
      charges: [{ code: "fuel", amount: 200 }],
    });
    assert.equal(fuelAck.status, 200);
    const closedResponse = await request(`/partner/rental/reservations/${reservationId}/close`, "POST", closePayload);
    assert.equal(closedResponse.status, 200);
    const closedBody = await closedResponse.json();
    assert.equal(Number(closedBody.reservation.finalTotal), 9_500);
    assert.deepEqual(closedBody.reconciliation, {
      finalTotal: 9_500,
      platformCommission: 1_425,
      operatorShare: 8_075,
      sharesReconcile: true,
      pendingCollection: 700,
      pendingPayment: 200,
    });

    const { rows: [persistedReservation] } = await rootPool.query(
      `SELECT status,final_total,outstanding,refund_amount FROM "${schema}".rental_reservations WHERE id=$1`,
      [reservationId],
    );
    assert.equal(persistedReservation.status, "closed");
    assert.equal(Number(persistedReservation.final_total), 9_500);
    assert.equal(Number(persistedReservation.outstanding), 500, "balance uses the net paid amount after the processed refund");
    assert.equal(Number(persistedReservation.refund_amount), 1_000, "only the previously processed refund is recorded as paid");
    const { rows: ledger } = await rootPool.query(`
      SELECT entry_type,amount,status FROM "${schema}".rental_trip_ledger
      WHERE reservation_id=$1 ORDER BY id
    `, [reservationId]);
    assert.deepEqual(ledger.map(({ entry_type, amount, status }) => [entry_type, amount, status]), [
      ["booking_total", 10_000, "paid"],
      ["platform_commission", 1_500, "paid"],
      ["operator_share", 8_500, "paid"],
      ["approved_extra", 500, "pending_collection"],
      ["extra_platform_commission", 75, "pending_collection"],
      ["extra_operator_share", 425, "pending_collection"],
      ["approved_extra", 200, "pending_collection"],
      ["extra_platform_commission", 30, "pending_collection"],
      ["extra_operator_share", 170, "pending_collection"],
      ["processed_refund", -1_000, "paid"],
      ["processed_refund_platform_commission", -150, "paid"],
      ["processed_refund_operator_share", -850, "paid"],
      ["approved_refund", -200, "pending_payment"],
      ["refund_platform_commission", -30, "pending_payment"],
      ["refund_operator_share", -170, "pending_payment"],
    ]);

    const tripResponse = await fetch(`${base}/partner/rental/reservations/${reservationId}/trip`, {
      headers: { "content-type": "application/json" },
    });
    assert.equal(tripResponse.status, 200);
    const trip = await tripResponse.json();
    assert.deepEqual(trip.paymentSnapshot, {
      amount: 10_000,
      refundedAmount: 1_000,
      commissionAmount: 1_500,
      operatorShareAmount: 8_500,
      commissionBasisPoints: 1_500,
      paidAmount: 10_000,
    });
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (routePool) await routePool.end();
    process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalMarketplaceFlag === undefined) delete process.env.RENTAL_MARKETPLACE_ENABLED;
    else process.env.RENTAL_MARKETPLACE_ENABLED = originalMarketplaceFlag;
    await rootPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await rootPool.end();
    await rm(temporaryDir, { recursive: true, force: true });
  }
});