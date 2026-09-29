import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import express from "express";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const apiDir = new URL("..", import.meta.url);
const schemaIndex = new URL("../../../lib/db/src/schema/index.ts", import.meta.url);

const drizzleMock = `
function field(column) {
  return Object.keys(column.table ?? {}).find((key) => column.table[key] === column) ?? column.name;
}
export const eq = (column, value) => ({ kind: "eq", column, field: field(column), value });
export const isNull = (column) => ({ kind: "isNull", column, field: field(column) });
export const inArray = (column, values) => ({ kind: "inArray", column, field: field(column), values });
export const and = (...conditions) => ({ kind: "and", conditions: conditions.flat().filter(Boolean) });
export const or = (...conditions) => ({ kind: "or", conditions: conditions.flat().filter(Boolean) });
export const asc = (column) => ({ kind: "sort", column, field: field(column), direction: 1 });
export const desc = (column) => ({ kind: "sort", column, field: field(column), direction: -1 });
export const sql = (chunks, ...values) => ({ kind: "sql", text: chunks.join("?"), values });
sql.raw = (text) => ({ kind: "raw", text });
`;

function tableName(table) {
  return table[Symbol.for("drizzle:Name")];
}

function matches(row, condition) {
  if (!condition) return true;
  if (condition.kind === "and") return condition.conditions.every((item) => matches(row, item));
  if (condition.kind === "or") return condition.conditions.some((item) => matches(row, item));
  if (condition.kind === "eq") return row[condition.field] === condition.value;
  if (condition.kind === "isNull") return row[condition.field] == null;
  if (condition.kind === "inArray") return condition.values.includes(row[condition.field]);
  if (condition.kind === "sql") {
    const column = condition.values.find((value) => value && typeof value === "object" && value.table);
    const date = condition.values.find((value) => value instanceof Date);
    if (column && date && condition.text.includes("<=") && fieldName(column) === "heldUntil") {
      const heldUntil = row[fieldName(column)];
      return heldUntil instanceof Date && heldUntil <= date;
    }
    if (column && condition.text.includes(" IN (") && fieldName(column) === "status") {
      const statuses = [...condition.text.matchAll(/'([^']+)'/g)].map((match) => match[1]);
      return statuses.includes(row.status);
    }
    if (column && condition.text.includes("ANY(ARRAY[")) {
      const raw = condition.values.find((value) => value?.kind === "raw")?.text ?? "";
      if (fieldName(column) === "status") {
        const statuses = [...raw.matchAll(/'([^']+)'/g)].map((match) => match[1]);
        return statuses.includes(row.status);
      }
      const values = raw.split(",").filter(Boolean).map(Number);
      if (values.length && values.every(Number.isFinite)) return values.includes(row[fieldName(column)]);
    }
    // The scenario has no legacy bookings or vehicle images. Unknown raw predicates match no rows.
    return false;
  }
  return false;
}

function fieldName(column) {
  return Object.keys(column.table ?? {}).find((key) => column.table[key] === column) ?? column.name;
}

function project(row, selection) {
  if (!selection) return { ...row };
  return Object.fromEntries(Object.entries(selection).map(([key, column]) => [key, row[fieldName(column)]]));
}

function makeMemoryDb() {
  const rows = new Map();
  const ids = new Map();
  const tableRows = (table) => {
    const name = tableName(table);
    if (!rows.has(name)) rows.set(name, []);
    return rows.get(name);
  };
  const applyInsert = (table, values) => {
    const name = tableName(table);
    const inserted = [];
    for (const value of (Array.isArray(values) ? values : [values])) {
      const record = { ...value };
      if (record.id == null && name !== "rental_settings") {
        const id = (ids.get(name) ?? 0) + 1;
        ids.set(name, id);
        record.id = id;
      }
      if (name === "rental_marketplace_requests") {
        record.createdAt ??= new Date();
        record.updatedAt ??= new Date();
      }
      if (name === "rental_settings") {
        const existing = tableRows(table).find((row) => row.key === record.key);
        if (existing) Object.assign(existing, record);
        else tableRows(table).push(record);
      } else {
        tableRows(table).push(record);
      }
      inserted.push({ ...record });
    }
    return inserted;
  };
  const makeSelect = (selection) => {
    const query = {
      source: null,
      condition: null,
      from(table) { this.source = table; return this; },
      where(condition) { this.condition = condition; return this; },
      orderBy() { return this; },
      limit() { return this; },
      for() { return this; },
      then(resolve, reject) {
        try {
          resolve(tableRows(this.source).filter((row) => matches(row, this.condition)).map((row) => project(row, selection)));
        } catch (error) { reject(error); }
      },
    };
    return query;
  };
  const makeInsert = (table) => {
    const query = {
      values(value) { this.value = value; return this; },
      onConflictDoUpdate({ set }) {
        const values = Array.isArray(this.value) ? this.value : [this.value];
        for (const value of values) {
          const existing = tableRows(table).find((row) => row.key === value.key);
          if (existing) Object.assign(existing, set);
          else tableRows(table).push({ ...value });
        }
        this.done = true;
        return this;
      },
      returning() { this.shouldReturn = true; return this; },
      then(resolve, reject) {
        try {
          const result = this.done ? [] : applyInsert(table, this.value);
          resolve(this.shouldReturn ? result : undefined);
        } catch (error) { reject(error); }
      },
    };
    return query;
  };
  const makeUpdate = (table) => {
    const query = {
      values: null,
      set(values) { this.values = values; return this; },
      where(condition) { this.condition = condition; return this; },
      returning() { this.shouldReturn = true; return this; },
      then(resolve, reject) {
        try {
          const affected = [];
          for (const row of tableRows(table)) {
            if (matches(row, this.condition)) {
              Object.assign(row, this.values);
              affected.push({ ...row });
            }
          }
          resolve(this.shouldReturn ? affected : undefined);
        } catch (error) { reject(error); }
      },
    };
    return query;
  };
  const db = {
    select: (selection) => makeSelect(selection),
    insert: (table) => makeInsert(table),
    update: (table) => makeUpdate(table),
    execute: async () => undefined,
    transaction: async (callback) => callback(db),
  };
  return { db, rows, seed(table, entries) { rows.set(table, entries.map((entry) => ({ ...entry }))); } };
}

test("marketplace policy configuration gates listing and drives partner quote acceptance payment deadline", async (t) => {
  const temporaryDir = await mkdtemp(path.join(apiDir.pathname, ".marketplace-api-flow-"));
  const bundlePath = path.join(temporaryDir, "marketplace-routes.mjs");
  const memory = makeMemoryDb();
  globalThis.__marketplaceTestDb = memory.db;
  const originalMarketplaceEnabled = process.env.RENTAL_MARKETPLACE_ENABLED;
  process.env.RENTAL_MARKETPLACE_ENABLED = " TRUE ";

  const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const operator = {
    id: 7,
    name: "Example Partner",
    status: "active",
    verificationStatus: "approved",
    isPlatform: false,
    insuranceExpiresAt: future,
    permissionExpiresAt: future,
    payoutStatus: "verified",
    payoutExpiresAt: future,
  };
  const vehicle = {
    id: 77,
    operatorId: operator.id,
    publicTitle: "Test car",
    slug: "test-car",
    brand: "Test",
    model: "Car",
    year: 2025,
    vehicleClass: "standard",
    status: "published",
    moderationStatus: "approved",
    operationalStatus: "available",
    disclosures: { insurance: "Included" },
    pickupLocations: ["Sapporo Station"],
    returnLocations: ["Sapporo Station"],
    hours: { pickup: "09:00-18:00" },
    sortOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };
  const pricing = {
    vehicleId: vehicle.id,
    basePrice: 1000,
    weekendPrice: null,
    holidayPrice: null,
    highSeasonPrice: null,
    winterSeasonPrice: null,
    cleaningFee: 0,
    deliveryFee: 0,
    lateReturnFee: 0,
    extraMileageFee: 0,
    securityDeposit: 0,
    airportPickupFee: 0,
    airportDropoffFee: 0,
    minDays: 1,
    maxDays: null,
    weeklyDiscountPct: 0,
    monthlyDiscountPct: 0,
    taxRate: 0,
    taxIncluded: true,
    billablePeriodHours: 24,
  };
  memory.seed("rental_operators", [operator]);
  memory.seed("rental_vehicles", [vehicle]);
  memory.seed("rental_vehicle_pricing", [pricing]);
  memory.seed("rental_operator_documents", [
    ...["insurance", "business_license", "vehicle_permission"].map((documentType) => ({
      id: documentType,
      operatorId: operator.id,
      documentType,
      status: "accepted",
      metadata: { uploadComplete: true },
      expiresAt: future,
    })),
  ]);
  memory.seed("rental_operator_staff", [{
    id: 88, operatorId: operator.id, active: true, status: "active",
    role: "owner", email: "partner@example.invalid",
  }]);
  memory.seed("rental_settings", [
    ["marketplaceCommissionPercent", 10],
    ["marketplacePayoutTerms", "Weekly payout"],
    ["marketplaceCancellationPolicy", "Standard cancellation terms"],
    ["marketplaceDepositPolicy", "No deposit"],
    ["marketplaceResponsePeriodHours", 48],
    ["marketplaceCoverageTerms", "Basic coverage"],
  ].map(([key, value]) => ({ key, value: JSON.stringify(value) })));
  for (const table of [
    "rental_vehicle_images", "rental_availability_blocks", "rental_reservations",
    "rental_reservation_holds", "rental_marketplace_requests", "rental_drivers",
    "rental_reservation_addons", "rental_seasonal_pricing_rules", "rental_addons",
    "rental_audit_log", "bookings",
  ]) memory.seed(table, []);

  const entry = `
    import operations from ${JSON.stringify(new URL("./src/routes/rental-operations.ts", apiDir).pathname)};
    import partner from ${JSON.stringify(new URL("./src/routes/partner.ts", apiDir).pathname)};
    import vehicles from ${JSON.stringify(new URL("./src/routes/rental-vehicles.ts", apiDir).pathname)};
    import requests from ${JSON.stringify(new URL("./src/routes/rental-requests.ts", apiDir).pathname)};
    import reservations from ${JSON.stringify(new URL("./src/routes/rental-reservations.ts", apiDir).pathname)};
    export { operations, partner, vehicles, requests, reservations };
  `;
  await build({
    stdin: { contents: entry, resolveDir: new URL("./src", apiDir).pathname, sourcefile: "marketplace-test-entry.ts" },
    outfile: bundlePath,
    bundle: true,
    platform: "node",
    format: "esm",
    external: ["express", "google-auth-library", "@google-cloud/storage"],
    plugins: [{
      name: "isolated-marketplace-dependencies",
      setup(buildApi) {
        buildApi.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "mock-db", namespace: "marketplace-test" }));
        buildApi.onLoad({ filter: /^mock-db$/, namespace: "marketplace-test" }, () => ({
          contents: `export * from ${JSON.stringify(schemaIndex.pathname)}; export const db = globalThis.__marketplaceTestDb;`,
          loader: "js",
          resolveDir: path.dirname(schemaIndex.pathname),
        }));
        buildApi.onResolve({ filter: /^drizzle-orm$/ }, (args) =>
          args.importer.includes("/node_modules/")
            ? undefined
            : ({ path: "mock-drizzle", namespace: "marketplace-test" }));
        buildApi.onLoad({ filter: /^mock-drizzle$/, namespace: "marketplace-test" }, () => ({
          contents: drizzleMock,
          loader: "js",
        }));
      },
    }],
  });

  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    delete globalThis.__marketplaceTestDb;
    if (originalMarketplaceEnabled === undefined) delete process.env.RENTAL_MARKETPLACE_ENABLED;
    else process.env.RENTAL_MARKETPLACE_ENABLED = originalMarketplaceEnabled;
    await rm(temporaryDir, { recursive: true, force: true });
  });

  const { operations, partner, vehicles, requests, reservations } = await import(pathToFileURL(bundlePath).href);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = { admin: { username: "scenario-admin" }, partner: { operatorId: operator.id, staffId: 88 } };
    next();
  });
  app.use("/api", operations, partner, vehicles, requests, reservations);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (route, method = "GET", body) => fetch(`${base}${route}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const directReservation = await request("/rental/reservations", "POST", {});
  assert.equal(directReservation.status, 409, "normalized enabled flag must require operator approval, even for direct bookings");
  const directAdminReservation = await request("/admin/rental/reservations", "POST", {});
  assert.equal(directAdminReservation.status, 409, "staff must use request quotes rather than bypass approval");

  const quoteBody = {
    vehicleId: vehicle.id,
    pickupAt: "2035-08-01T10:00:00+09:00",
    returnAt: "2035-08-02T10:00:00+09:00",
    pickupLocation: "Sapporo Station",
    returnLocation: "Sapporo Station",
    driver: { fullName: "Test Customer", email: "customer@example.invalid", phone: "+81000000000" },
    marketingConsent: false,
    reason: "Partner-created quote",
  };

  const unavailableBeforePolicy = await request("/rental/vehicles");
  assert.equal(unavailableBeforePolicy.status, 200);
  assert.deepEqual(await unavailableBeforePolicy.json(), [], "incomplete marketplace policy must withhold partner listings");
  const quoteBeforePolicy = await request("/partner/rental/requests/quote", "POST", quoteBody);
  assert.equal(quoteBeforePolicy.status, 404, "partners cannot quote a vehicle until listing eligibility is satisfied");

  const policyWrite = await request("/admin/rental/marketplace-policy", "PUT", {
    marketplacePaymentWindowHours: 6,
  });
  assert.equal(policyWrite.status, 200);
  const configuredPolicy = await policyWrite.json();
  assert.equal(configuredPolicy.values.marketplacePaymentWindowHours, 6);
  assert.equal(configuredPolicy.missing.length, 0);

  const listedVehiclesResponse = await request("/rental/vehicles");
  assert.equal(listedVehiclesResponse.status, 200);
  const listedVehicles = await listedVehiclesResponse.json();
  assert.equal(listedVehicles.length, 1);
  assert.equal(listedVehicles[0].operatorName, operator.name);

  const quoteResponse = await request("/partner/rental/requests/quote", "POST", quoteBody);
  if (quoteResponse.status !== 201) assert.fail(`Partner quote failed (${quoteResponse.status}): ${await quoteResponse.text()}`);
  const quote = await quoteResponse.json();
  assert.equal(quote.status, "offer_pending");
  assert.equal(quote.offer.vehicleId, vehicle.id);
  assert.equal(quote.offer.policy.version.commissionVersion.startsWith("sha256:"), true);

  const acceptedAt = Date.now();
  const acceptResponse = await request(
    `/rental/requests/${quote.id}/accept-offer?accessCode=${encodeURIComponent(quote.customerAccessToken)}`,
    "POST",
    {},
  );
  if (acceptResponse.status !== 200) assert.fail(`Customer acceptance failed (${acceptResponse.status}): ${await acceptResponse.text()}`);
  const accepted = await acceptResponse.json();
  assert.equal(accepted.status, "awaiting_payment");
  assert.ok(accepted.paymentDeadline);
  const paymentWindowMs = new Date(accepted.paymentDeadline).getTime() - acceptedAt;
  assert.ok(paymentWindowMs >= 6 * 60 * 60 * 1000 - 1000);
  assert.ok(paymentWindowMs <= 6 * 60 * 60 * 1000 + 5000);

  const requestViewResponse = await request(
    `/rental/requests/${quote.id}?accessCode=${encodeURIComponent(quote.customerAccessToken)}`,
  );
  assert.equal(requestViewResponse.status, 200);
  const requestView = await requestViewResponse.json();
  assert.equal(requestView.acceptedOffer.vehicleId, vehicle.id);
  assert.equal(requestView.status, "awaiting_payment");
  const reservation = memory.rows.get("rental_reservations").find((row) => row.id === accepted.reservationId);
  assert.equal(reservation.status, "pending_payment");
  assert.equal(reservation.marketplaceOfferSnapshot.vehicleId, vehicle.id);

  const partnerAcceptanceOffer = {
    vehicleId: vehicle.id,
    operatorId: operator.id,
    pricing: {
      subtotal: 1200,
      addonsTotal: 0,
      deliveryFee: 0,
      airportPickupFee: 0,
      airportDropoffFee: 0,
      discount: 0,
      tax: 0,
      securityDeposit: 0,
      addons: [],
    },
    totalPrice: 1200,
    currency: "JPY",
    policy: {
      marketplace: { marketplaceCommissionPercent: 10 },
      vehicle: vehicle.disclosures,
      version: { policyVersion: "sha256:test-policy", commissionVersion: "sha256:test-commission", capturedAt: new Date().toISOString() },
    },
    pickupAt: "2035-08-05T01:00:00.000Z",
    returnAt: "2035-08-06T01:00:00.000Z",
    pickupLocation: "Sapporo Station",
    returnLocation: "Sapporo Station",
  };
  const seededRequestId = 505;
  const seededHoldId = 900;
  const seededAt = new Date();
  const seededHold = {
    id: seededHoldId,
    vehicleId: vehicle.id,
    reservationId: null,
    pickupAt: new Date(partnerAcceptanceOffer.pickupAt),
    returnAt: new Date(partnerAcceptanceOffer.returnAt),
    heldUntil: new Date(seededAt.getTime() + 48 * 60 * 60 * 1000),
    releasedAt: null,
    sessionToken: "isolated-customer-session",
    createdAt: seededAt,
  };
  const seededRequest = {
    id: seededRequestId,
    operatorId: operator.id,
    vehicleId: vehicle.id,
    holdId: seededHoldId,
    offerHoldId: null,
    reservationId: null,
    status: "requested",
    customerAccessToken: "seeded-customer-token",
    driver: { fullName: "Second Customer", email: "second@example.invalid", phone: "+81000000001" },
    additionalDrivers: [],
    addons: [],
    travelNotes: null,
    marketingConsent: false,
    attribution: null,
    initialOffer: partnerAcceptanceOffer,
    currentOffer: partnerAcceptanceOffer,
    offerHistory: [{ type: "customer_request", offer: partnerAcceptanceOffer }],
    acceptedOffer: null,
    requestedAt: seededAt,
    respondBy: new Date(seededAt.getTime() + 48 * 60 * 60 * 1000),
    paymentDeadline: null,
    declinedReason: null,
    createdAt: seededAt,
    updatedAt: seededAt,
  };
  memory.rows.get("rental_reservation_holds").push(seededHold);
  memory.rows.get("rental_marketplace_requests").push(seededRequest);

  const partnerAcceptedAt = Date.now();
  const partnerAcceptResponse = await request(
    `/partner/rental/requests/${seededRequestId}/accept`,
    "POST",
    {},
  );
  if (partnerAcceptResponse.status !== 200) {
    assert.fail(`Partner acceptance failed (${partnerAcceptResponse.status}): ${await partnerAcceptResponse.text()}`);
  }
  const partnerAccepted = await partnerAcceptResponse.json();
  assert.equal(partnerAccepted.status, "awaiting_payment");
  const partnerPaymentWindowMs = new Date(partnerAccepted.paymentDeadline).getTime() - partnerAcceptedAt;
  assert.ok(partnerPaymentWindowMs >= 6 * 60 * 60 * 1000 - 1000);
  assert.ok(partnerPaymentWindowMs <= 6 * 60 * 60 * 1000 + 5000);
  const partnerRequest = memory.rows.get("rental_marketplace_requests")
    .find((row) => row.id === seededRequestId);
  const partnerReservation = memory.rows.get("rental_reservations")
    .find((row) => row.id === partnerAccepted.reservationId);
  assert.equal(partnerRequest.status, "awaiting_payment");
  assert.deepEqual(partnerRequest.acceptedOffer, partnerAcceptanceOffer);
  assert.deepEqual(partnerReservation.marketplaceOfferSnapshot, partnerAcceptanceOffer);
  assert.equal(partnerReservation.status, "pending_payment");
});