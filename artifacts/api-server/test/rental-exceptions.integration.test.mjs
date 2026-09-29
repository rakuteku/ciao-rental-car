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
const privateStorageConfigured = Boolean(
  process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID?.trim() &&
  process.env.PRIVATE_OBJECT_DIR?.trim(),
);

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

test("rental exceptions enforce rollout, actor permissions, safety holds, saved policy and claim boundaries", {
  skip: !process.env.DATABASE_URL && "DATABASE_URL is required for PostgreSQL integration",
}, async (t) => {
  const schema = `rental_exceptions_${randomUUID().replaceAll("-", "")}`;
  const rootPool = new Pool({ connectionString: process.env.DATABASE_URL });
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalMarketplaceFlag = process.env.RENTAL_MARKETPLACE_ENABLED;
  const temporaryDir = await mkdtemp(path.join(apiDir.pathname, ".rental-exceptions-"));
  const uploadedObjects = [];
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
      "rental_marketplace_requests",
      "rental_payments",
      "rental_refunds",
      "rental_availability_blocks",
      "rental_incidents",
      "rental_claims",
      "rental_claim_items",
      "rental_exception_evidence",
      "rental_exception_events",
      "rental_reservation_exceptions",
      "rental_inspections",
      "rental_inspection_photos",
      "rental_notifications",
    ];
    for (const table of tables) {
      await rootPool.query(`CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
      if (table === "rental_inspections") {
        // Development databases may lag the current inspection model. Keep the
        // disposable schema compatible with the Drizzle model queried by routes.
        await rootPool.query(`
          ALTER TABLE "${schema}".rental_inspections
            ADD COLUMN IF NOT EXISTS agreement_accepted boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS signature_reference text,
            ADD COLUMN IF NOT EXISTS vehicle_identity text,
            ADD COLUMN IF NOT EXISTS actual_at timestamptz,
            ADD COLUMN IF NOT EXISTS location text,
            ADD COLUMN IF NOT EXISTS equipment jsonb NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS discrepancies jsonb NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS retention_until timestamptz
        `);
      }
      if (table === "rental_inspection_photos") {
        // The disposable copy uses the current route model even when the base
        // development database predates private inspection-photo metadata.
        await rootPool.query(`
          ALTER TABLE "${schema}".rental_inspection_photos
            ADD COLUMN IF NOT EXISTS storage_key text,
            ADD COLUMN IF NOT EXISTS retention_until timestamptz
        `);
      }
      if (table !== "rental_exception_evidence") {
        await rootPool.query(`CREATE SEQUENCE "${schema}"."${table}_test_id_seq"`);
        await rootPool.query(
          `ALTER TABLE "${schema}"."${table}" ALTER COLUMN id SET DEFAULT nextval('"${schema}"."${table}_test_id_seq"'::regclass)`,
        );
        await rootPool.query(`ALTER SEQUENCE "${schema}"."${table}_test_id_seq" OWNED BY "${schema}"."${table}".id`);
      }
    }

    const operatorId = 1_700_000_000 + (process.pid % 100_000);
    const otherOperatorId = operatorId + 1;
    const staffId = operatorId + 2;
    const otherStaffId = operatorId + 3;
    const driverId = operatorId + 4;
    const quoteVehicleId = operatorId + 5;
    const incidentVehicleId = operatorId + 6;
    const quoteReservationId = operatorId + 7;
    const incidentReservationId = operatorId + 8;
    const requestId = operatorId + 9;
    const pickupAt = new Date(Date.now() + 14 * 86_400_000);
    const quoteReturnAt = new Date(pickupAt.getTime() + 86_400_000);
    const incidentPickupAt = new Date(Date.now() - 86_400_000);
    const incidentReturnAt = new Date(Date.now() + 86_400_000);
    const email = `customer-${schema}@example.invalid`;

    for (const [id, slug, name] of [
      [operatorId, `exception-${schema}`, "Exception Integration Operator"],
      [otherOperatorId, `exception-other-${schema}`, "Other Exception Operator"],
    ]) {
      await rootPool.query(`
        INSERT INTO "${schema}".rental_operators
          (id,slug,name,status,verification_status,is_platform)
        VALUES ($1,$2,$3,'active','approved',false)
      `, [id, slug, name]);
    }
    await rootPool.query(`
      INSERT INTO "${schema}".rental_operator_staff
        (id,operator_id,identity_subject,email,password_hash,role,status,active)
      VALUES
        ($1,$2,$3,$4,'test-hash','owner','active',true),
        ($5,$6,$7,$8,'test-hash','owner','active',true)
    `, [staffId, operatorId, `staff-${schema}`, `operator-${schema}@example.invalid`,
      otherStaffId, otherOperatorId, `other-staff-${schema}`, `other-${schema}@example.invalid`]);
    await rootPool.query(`
      INSERT INTO "${schema}".rental_drivers(id,full_name,email,phone)
      VALUES ($1,'Exception Test Customer',$2,'+81000000000')
    `, [driverId, email]);

    for (const [id, operator, name, slug] of [
      [quoteVehicleId, operatorId, "Quote Test Car", `quote-${schema}`],
      [incidentVehicleId, operatorId, "Incident Test Car", `incident-${schema}`],
    ]) {
      await rootPool.query(`
        INSERT INTO "${schema}".rental_vehicles
          (id,operator_id,internal_name,public_title,slug,brand,model,year,status,moderation_status)
        VALUES ($1,$2,$3,$3,$4,'Test','Car',2025,'published','approved')
      `, [id, operator, name, slug]);
    }
    const policySnapshot = {
      policy: {
        marketplace: {
          cancellationPolicy: [{ daysBefore: 0, refundPercent: 60 }],
        },
      },
    };
    for (const [id, vehicleId, pickup, returned, status, snapshot] of [
      [quoteReservationId, quoteVehicleId, pickupAt, quoteReturnAt, "confirmed", policySnapshot],
      [incidentReservationId, incidentVehicleId, incidentPickupAt, incidentReturnAt, "in_rental", null],
    ]) {
      await rootPool.query(`
        INSERT INTO "${schema}".rental_reservations
          (id,operator_id,vehicle_id,primary_driver_id,pickup_at,return_at,pickup_location,return_location,
           status,payment_status,paid_amount,final_total,source,marketplace_offer_snapshot)
        VALUES ($1,$2,$3,$4,$5,$6,'Test pickup','Test return',$7,'paid',10000,10000,'marketplace_request',$8::jsonb)
      `, [id, operatorId, vehicleId, driverId, pickup, returned, status, snapshot && JSON.stringify(snapshot)]);
    }
    await rootPool.query(`
      INSERT INTO "${schema}".rental_payments
        (request_id,reservation_id,operator_id,status,currency,amount,commission_amount,
         commission_basis_points,commission_policy_version,operator_share_amount,price_snapshot,
         policy_snapshot,idempotency_key,stripe_payment_intent_id,paid_at)
      VALUES ($1,$2,$3,'paid','jpy',10000,1500,1500,'exception-test-v1',8500,
        '{"amount":10000}'::jsonb,'{}'::jsonb,$4,'pi_test_never_refund',now())
    `, [requestId, quoteReservationId, operatorId, `exception-test-${schema}`]);

    const isolatedUrl = new URL(originalDatabaseUrl);
    isolatedUrl.searchParams.set("options", `-csearch_path=${schema},public`);
    process.env.DATABASE_URL = isolatedUrl.toString();
    process.env.RENTAL_MARKETPLACE_ENABLED = "false";
    const entry = `
      import exceptions from ${JSON.stringify(new URL("../src/routes/rental-exceptions.ts", import.meta.url).pathname)};
      import reservationExceptions from ${JSON.stringify(new URL("../src/routes/rental-reservation-exceptions.ts", import.meta.url).pathname)};
      import { pool } from ${JSON.stringify(dbEntry.pathname)};
      import { rentalDocumentObjectName, rentalDocumentStorage } from ${JSON.stringify(new URL("../src/lib/rental-private-documents.ts", import.meta.url).pathname)};
      export { exceptions, reservationExceptions, pool, rentalDocumentObjectName, rentalDocumentStorage };
    `;
    const bundlePath = path.join(temporaryDir, "rental-exceptions.mjs");
    const isolatedNodeModules = path.join(temporaryDir, "node_modules");
    await mkdir(isolatedNodeModules, { recursive: true });
    const packages = [
      ["express", requireApi.resolve("express"), "express"],
      ["pg", requireDb.resolve("pg"), "pg"],
      ["drizzle-orm", requireDb.resolve("drizzle-orm"), "drizzle-orm"],
      ["drizzle-zod", requireDb.resolve("drizzle-zod"), "drizzle-zod"],
      ["zod", requireApi.resolve("zod/v4"), "zod"],
      ["@google-cloud/storage", requireApi.resolve("@google-cloud/storage"), "@google-cloud/storage"],
      ["stripe", requireApi.resolve("stripe"), "stripe"],
      ["pino", requireApi.resolve("pino"), "pino"],
    ];
    for (const [moduleName, resolvedFile, packageName] of packages) {
      const target = path.join(isolatedNodeModules, moduleName);
      await mkdir(path.dirname(target), { recursive: true });
      await symlink(packageRoot(resolvedFile, packageName), target, "dir");
    }
    await build({
      stdin: { contents: entry, resolveDir: apiDir.pathname, sourcefile: "rental-exceptions-integration-entry.ts" },
      outfile: bundlePath,
      bundle: true,
      packages: "external",
      platform: "node",
      format: "esm",
      plugins: [{
        name: "isolated-exceptions-db",
        setup(buildApi) {
          buildApi.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: dbEntry.pathname }));
        },
      }],
    });
    const {
      exceptions, reservationExceptions, pool, rentalDocumentObjectName, rentalDocumentStorage,
    } = await import(pathToFileURL(bundlePath).href);
    routePool = pool;
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      const actor = req.get("x-test-actor") ?? "anonymous";
      req.log = { warn() {}, error() {}, info() {} };
      req.session = actor === "customer"
        ? { rentalCustomerEmail: email, rentalCustomerBookingId: Number(req.get("x-test-booking-id") ?? quoteReservationId) }
        : actor === "other-customer"
          ? { rentalCustomerEmail: "someone-else@example.invalid", rentalCustomerBookingId: quoteReservationId }
          : actor === "operator"
            ? { partner: { operatorId, staffId, role: "owner" } }
            : actor === "other-operator"
              ? { partner: { operatorId: otherOperatorId, staffId: otherStaffId, role: "owner" } }
              : actor === "admin" ? { admin: { username: "integration-admin" } } : {};
      next();
    });
    app.use("/api", exceptions);
    app.use("/api", reservationExceptions);
    app.use((error, _req, res, _next) => {
      res.status(500).json({
        error: error?.message ?? "Unexpected test-server error",
        cause: error?.cause?.message,
        code: error?.cause?.code,
      });
    });
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const request = (route, actor, method = "GET", body, headers = {}) => fetch(`${base}${route}`, {
      method,
      headers: {
        "content-type": "application/json",
        "x-test-actor": actor,
        ...(route.includes(String(incidentReservationId)) ? { "x-test-booking-id": String(incidentReservationId) } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    assert.equal((await request(`/rental/exceptions/reservations/${quoteReservationId}`, "customer")).status, 404,
      "the exception router is not mounted while rollout is off");
    assert.equal((await request(`/rental/exceptions/reservations/${quoteReservationId}/cancellation/quote`, "customer", "POST", {})).status, 404);

    process.env.RENTAL_MARKETPLACE_ENABLED = "true";
    const unauthorized = await request(`/rental/exceptions/reservations/${quoteReservationId}`, "other-customer");
    assert.equal(unauthorized.status, 404);
    assert.equal((await request(`/rental/exceptions/reservations/${quoteReservationId}`, "other-operator")).status, 404,
      "operator staff cannot access another operator's reservation");
    assert.equal((await request(`/rental/exceptions/reservations/${quoteReservationId}/claims`, "customer", "POST", {})).status, 404,
      "customers cannot create operator claims");
    assert.equal((await request(`/rental/exceptions/reservations/${incidentReservationId}/incidents`, "admin", "POST", {
      category: "platform-created", description: "not allowed",
    })).status, 403, "platform users cannot report incidents on behalf of operators or customers");

    const reservationState = await request(`/rental/exceptions/reservations/${quoteReservationId}`, "customer");
    assert.equal(reservationState.status, 200);
    assert.equal((await reservationState.json()).providerCharging, "not_configured");
    const quoteResponse = await request(
      `/rental/exceptions/reservations/${quoteReservationId}/cancellation/quote`,
      "customer",
      "POST",
      {},
    );
    assert.equal(quoteResponse.status, 201);
    const quote = await quoteResponse.json();
    assert.equal(quote.refundableAmount, 6000, "the amount comes from the saved offer cancellation policy");
    assert.equal(quote.manualReviewRequired, false);
    const quoteRows = await rootPool.query(
      `SELECT quoted_amount,policy_snapshot FROM "${schema}".rental_reservation_exceptions WHERE reservation_id=$1`,
      [quoteReservationId],
    );
    assert.equal(Number(quoteRows.rows[0].quoted_amount), 6000);
    assert.equal(quoteRows.rows[0].policy_snapshot.cancellationPolicy[0].refundPercent, 60);

    const firstIncidentResponse = await request(
      `/rental/exceptions/reservations/${incidentReservationId}/incidents`,
      "customer",
      "POST",
      { category: "collision", severity: "high", description: "Unsafe vehicle", unsafeVehicle: true },
    );
    assert.equal(firstIncidentResponse.status, 201);
    const firstIncident = (await firstIncidentResponse.json()).incident;
    const secondIncidentResponse = await request(
      `/rental/exceptions/operator/reservations/${incidentReservationId}/incidents`,
      "operator",
      "POST",
      { category: "follow-up", description: "Second open safety report", unsafeVehicle: true },
    );
    assert.equal(secondIncidentResponse.status, 201);
    const secondIncident = (await secondIncidentResponse.json()).incident;
    let vehicleState = await rootPool.query(
      `SELECT operational_status FROM "${schema}".rental_vehicles WHERE id=$1`,
      [incidentVehicleId],
    );
    assert.equal(vehicleState.rows[0].operational_status, "maintenance");
    let blocks = await rootPool.query(
      `SELECT count(*)::int AS count FROM "${schema}".rental_availability_blocks WHERE vehicle_id=$1`,
      [incidentVehicleId],
    );
    assert.equal(blocks.rows[0].count, 2, "each open unsafe incident holds the vehicle unavailable");

    const claimResponse = await request(
      `/rental/exceptions/reservations/${incidentReservationId}/claims`,
      "operator",
      "POST",
      { incidentId: firstIncident.id, invoiceReference: "INV-EXCEPTION-27" },
    );
    assert.equal(claimResponse.status, 201);
    const claimId = (await claimResponse.json()).claim.id;
    const itemResponse = await request(`/rental/exceptions/claims/${claimId}/items`, "operator", "POST", {
      category: "repair", description: "Door repair", amount: 25_000,
    });
    assert.equal(itemResponse.status, 201);
    const itemBody = await itemResponse.json();
    const claimItemId = itemBody.item.id;
    assert.equal(itemBody.chargeStatus, "blocked_pending_platform_approval");

    const customerEvidence = await request(
      `/rental/exceptions/reservations/${incidentReservationId}/evidence/upload-request`,
      "customer",
      "POST",
      { evidenceKind: "customer_response", contentType: "application/pdf", claimId },
    );
    assert.equal(customerEvidence.status, 201, "a customer can create a private dispute-evidence upload request");
    const dispute = await request(`/rental/exceptions/claims/${claimId}/customer-response`, "customer", "POST", {
      response: "I dispute this damage item.",
      disputedItemIds: [claimItemId],
    }, { "x-test-booking-id": String(incidentReservationId) });
    assert.equal(dispute.status, 200);
    const disputeBody = await dispute.json();
    assert.equal(disputeBody.claim.status, "disputed");
    assert.equal(disputeBody.items.find((item) => item.id === claimItemId).status, "disputed");
    assert.equal(disputeBody.chargeStatus, "blocked_pending_platform_approval");

    const details = await request(`/rental/exceptions/claims/${claimId}/details`, "operator", "PATCH", {
      invoiceReference: "INV-EXCEPTION-27",
      insurerOutcome: "not applicable",
    });
    assert.equal(details.status, 200);
    const invoiceEvidence = await request(
      `/rental/exceptions/reservations/${incidentReservationId}/evidence/upload-request`,
      "operator",
      "POST",
      { evidenceKind: "invoice", contentType: "application/pdf", claimId, claimItemId },
    );
    assert.equal(invoiceEvidence.status, 201);
    const approvalBlocked = await request(`/admin/rental/exceptions/claims/${claimId}/decision`, "admin", "POST", {
      decision: "approve", notes: "Review after evidence.",
    });
    assert.equal(approvalBlocked.status, 409, "platform approval is blocked until private invoice evidence is uploaded");
    assert.match((await approvalBlocked.json()).error, /private invoice evidence/);

    const decision = await request(`/admin/rental/exceptions/claims/${claimId}/decision`, "admin", "POST", {
      decision: "reject", notes: "Rejected after customer dispute review.",
    });
    assert.equal(decision.status, 200);
    const decisionBody = await decision.json();
    assert.equal(decisionBody.claim.status, "rejected");
    assert.equal(decisionBody.claim.providerChargeStatus, "not_configured");
    assert.equal(decisionBody.chargeStatus, "not_configured");
    const duplicateDecision = await request(`/admin/rental/exceptions/claims/${claimId}/decision`, "admin", "POST", {
      decision: "reject", notes: "Duplicate decision must not replace the first.",
    });
    assert.equal(duplicateDecision.status, 409, "a decided claim cannot be decided twice");
    const noExtraCharges = await rootPool.query(`
      SELECT
        (SELECT count(*) FROM "${schema}".rental_payments WHERE reservation_id=$1) +
        ((SELECT count(*) FROM "${schema}".rental_payments WHERE reservation_id=$1) +
        (SELECT count(*) FROM "${schema}".rental_refunds r
          JOIN "${schema}".rental_payments p ON p.id=r.payment_id WHERE p.reservation_id=$1))::int AS count
    `, [incidentReservationId]);
    assert.equal(Number(noExtraCharges.rows[0].count), 0, "claim review did not create a provider or trip-ledger charge");

    const firstResolution = await request(
      `/admin/rental/exceptions/incidents/${firstIncident.id}/resolve`,
      "admin",
      "POST",
      { resolution: "Vehicle inspected; this report resolved." },
    );
    assert.equal(firstResolution.status, 200);
    vehicleState = await rootPool.query(
      `SELECT operational_status FROM "${schema}".rental_vehicles WHERE id=$1`,
      [incidentVehicleId],
    );
    assert.equal(vehicleState.rows[0].operational_status, "maintenance",
      "resolving one report cannot clear another open unsafe incident");
    blocks = await rootPool.query(
      `SELECT count(*)::int AS count FROM "${schema}".rental_availability_blocks WHERE vehicle_id=$1`,
      [incidentVehicleId],
    );
    assert.equal(blocks.rows[0].count, 1, "a resolved incident releases its own hold while the other remains");
    const secondResolution = await request(
      `/admin/rental/exceptions/incidents/${secondIncident.id}/resolve`,
      "admin",
      "POST",
      { resolution: "Second safety report resolved." },
    );
    assert.equal(secondResolution.status, 200);
    vehicleState = await rootPool.query(
      `SELECT operational_status FROM "${schema}".rental_vehicles WHERE id=$1`,
      [incidentVehicleId],
    );
    assert.equal(vehicleState.rows[0].operational_status, "available");
    blocks = await rootPool.query(
      `SELECT count(*)::int AS count FROM "${schema}".rental_availability_blocks WHERE vehicle_id=$1`,
      [incidentVehicleId],
    );
    assert.equal(blocks.rows[0].count, 0);

    await t.test("provider-backed evidence approval leaves charges unconfigured", {
      skip: !privateStorageConfigured && "Private evidence storage is unconfigured (DEFAULT_OBJECT_STORAGE_BUCKET_ID and PRIVATE_OBJECT_DIR are required)",
    }, async () => {
      const { rows: [freshClaim] } = await rootPool.query(`
        INSERT INTO "${schema}".rental_claims
          (reservation_id,incident_id,operator_id,status,invoice_reference,insurer_outcome)
        VALUES ($1,$2,$3,'submitted','INV-EVIDENCE-27','not applicable')
        RETURNING id
      `, [incidentReservationId, firstIncident.id, operatorId]);
      const freshClaimId = freshClaim.id;
      const { rows: [freshItem] } = await rootPool.query(`
        INSERT INTO "${schema}".rental_claim_items (claim_id,category,description,amount,status)
        VALUES ($1,'repair','Evidence-backed repair',12000,'pending_platform_review')
        RETURNING id
      `, [freshClaimId]);
      const inspections = [];
      for (const type of ["pickup", "return"]) {
        const { rows: [inspection] } = await rootPool.query(`
          INSERT INTO "${schema}".rental_inspections(reservation_id,type)
          VALUES ($1,$2) RETURNING id
        `, [incidentReservationId, type]);
        inspections.push([type, inspection.id]);
      }
      const evidenceRequests = [
        { evidenceKind: "invoice", claimId: freshClaimId, claimItemId: freshItem.id },
        ...inspections.map(([evidenceKind]) => ({ evidenceKind, inspectionId: inspections.find(([kind]) => kind === evidenceKind)[1] })),
        { evidenceKind: "incident", incidentId: firstIncident.id },
      ];
      for (const evidenceBody of evidenceRequests) {
        const created = await request(
          `/rental/exceptions/reservations/${incidentReservationId}/evidence/upload-request`,
          "operator",
          "POST",
          { ...evidenceBody, contentType: "application/pdf" },
        );
        assert.equal(created.status, 201, created.status === 201 ? "" : await created.text());
        const reference = await created.json();
        const upload = await fetch(`${base}${reference.uploadPath}`, {
          method: "PUT",
          headers: { "content-type": "application/pdf", "x-test-actor": "operator" },
          body: Buffer.from("%PDF-1.4\nexception integration evidence\n%%EOF"),
        });
        assert.equal(upload.status, 204);
        uploadedObjects.push(rentalDocumentObjectName(incidentReservationId, reference.reference));
      }
      const approval = await request(`/admin/rental/exceptions/claims/${freshClaimId}/decision`, "admin", "POST", {
        decision: "approve", notes: "Evidence reviewed.", insurerOutcome: "not applicable",
      });
      assert.equal(approval.status, 200);
      const approvedBody = await approval.json();
      assert.equal(approvedBody.claim.providerChargeStatus, "not_configured");
      assert.equal(approvedBody.chargeStatus, "not_configured");
      const charges = await rootPool.query(`
        SELECT
          ((SELECT count(*) FROM "${schema}".rental_payments WHERE reservation_id=$1) +
          (SELECT count(*) FROM "${schema}".rental_refunds r
            JOIN "${schema}".rental_payments p ON p.id=r.payment_id WHERE p.reservation_id=$1))::int AS count
      `, [incidentReservationId]);
      assert.equal(Number(charges.rows[0].count), 0);
    });
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (routePool) {
      try {
        const { rentalDocumentObjectName, rentalDocumentStorage } = await import(pathToFileURL(path.join(temporaryDir, "rental-exceptions.mjs")).href);
        const objectNames = uploadedObjects;
        const bucket = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID?.trim();
        if (bucket) await Promise.all(objectNames.map((name) =>
          rentalDocumentStorage.bucket(bucket).file(name).delete({ ignoreNotFound: true }).catch(() => undefined)));
        void rentalDocumentObjectName;
      } catch {
        // Storage cleanup is best-effort; all database records are removed below.
      }
      await routePool.end();
    }
    process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalMarketplaceFlag === undefined) delete process.env.RENTAL_MARKETPLACE_ENABLED;
    else process.env.RENTAL_MARKETPLACE_ENABLED = originalMarketplaceFlag;
    await rootPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await rootPool.end();
    await rm(temporaryDir, { recursive: true, force: true });
  }
});