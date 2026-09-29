import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { Router, type IRouter, type Request, type RequestHandler } from "express";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  rentalAddonsTable,
  rentalAvailabilityBlocksTable,
  rentalAuditLogTable,
  rentalMaintenanceTable,
  rentalOperatorDocumentsTable,
  rentalOperatorStaffTable,
  rentalOperatorsTable,
  rentalReservationAddonsTable,
  rentalOperatorVerificationsTable,
  rentalVehicleImagesTable,
  rentalVehiclePricingTable,
  rentalVehiclesTable,
} from "@workspace/db";
import { requireAdminAuth } from "../middlewares/admin-auth";
import { isRentalMarketplaceEnabled } from "../middlewares/operator-auth";
import {
  createRentalDocumentToken,
  receiveRentalDocumentUpload,
  rentalDocumentObjectName,
  streamRentalDocument,
} from "../lib/rental-private-documents";
import {
  isAllowedRentalDocumentContentType,
  parseRentalPrivateReference,
  rentalPrivateReference,
} from "../lib/rental-private-document-policy.mjs";

const router: IRouter = Router();
const scrypt = promisify(scryptCallback);
const failedLogins = new Map<string, number[]>();
const PARTNER_SESSION_KEY = "partner";
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 10;

const featureGate: RequestHandler = (_req, res, next) => {
  if (!isRentalMarketplaceEnabled()) {
    res.status(404).json({ error: "Rental marketplace is disabled" });
    return;
  }
  next();
};
router.use(featureGate);

type PartnerIdentity = { operatorId: number; staffId: number; email: string; role: string };
type PartnerRequest = Request & { partnerIdentity?: PartnerIdentity };

export const authenticatePartner: RequestHandler = async (req, res, next) => {
  const session = req.session as unknown as Record<string, unknown>;
  const identity = session[PARTNER_SESSION_KEY] as PartnerIdentity | undefined;
  if (!identity || !Number.isSafeInteger(identity.operatorId) || !Number.isSafeInteger(identity.staffId)) {
    res.status(401).json({ error: "Partner authentication required" });
    return;
  }
  const [staff] = await db.select().from(rentalOperatorStaffTable).where(and(
    eq(rentalOperatorStaffTable.id, identity.staffId),
    eq(rentalOperatorStaffTable.operatorId, identity.operatorId),
    eq(rentalOperatorStaffTable.active, true),
    eq(rentalOperatorStaffTable.status, "active"),
  ));
  const [operator] = await db.select().from(rentalOperatorsTable)
    .where(eq(rentalOperatorsTable.id, identity.operatorId));
  if (!staff || !operator || operator.isPlatform || ["suspended", "closed"].includes(operator.status)) {
    delete session[PARTNER_SESSION_KEY];
    res.status(401).json({ error: "Partner account is inactive" });
    return;
  }
  (req as PartnerRequest).partnerIdentity = {
    operatorId: staff.operatorId,
    staffId: staff.id,
    email: staff.email,
    role: staff.role,
  };
  next();
};

export function partnerIdentity(req: Request): PartnerIdentity {
  return (req as PartnerRequest).partnerIdentity!;
}

function identity(req: Request): PartnerIdentity {
  return partnerIdentity(req);
}

function canManageInventory(req: Request): boolean {
  return ["owner", "manager", "operations"].includes(identity(req).role);
}

const RegisterSchema = z.object({
  businessName: z.string().trim().min(1).max(200),
  legalName: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(1024),
  contactPhone: z.string().trim().min(1).max(80),
  displayName: z.string().trim().min(1).max(200).optional(),
}).strict();
const LoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(1024),
  operatorSlug: z.string().min(1).max(120).optional(),
}).strict();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (failedLogins.get(ip) ?? []).filter((time) => now - time < LOGIN_WINDOW_MS);
  if (recent.length >= MAX_LOGIN_ATTEMPTS) {
    failedLogins.set(ip, recent);
    return true;
  }
  recent.push(now);
  failedLogins.set(ip, recent);
  return false;
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const digest = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${digest.toString("hex")}`;
}

async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, salt, digest] = encoded.split("$");
  if (algorithm !== "scrypt" || !salt || !digest || !/^[a-f0-9]{128}$/i.test(digest)) return false;
  const expected = Buffer.from(digest, "hex");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "partner";
}

function setPartnerSession(req: Express.Request, res: import("express").Response, staff: typeof rentalOperatorStaffTable.$inferSelect): void {
  req.session.regenerate((error) => {
    if (error) {
      res.status(500).json({ error: "Could not establish partner session" });
      return;
    }
    const partner: PartnerIdentity = {
      operatorId: staff.operatorId,
      staffId: staff.id,
      email: staff.email,
      role: staff.role,
    };
    (req.session as unknown as Record<string, unknown>)[PARTNER_SESSION_KEY] = partner;
    res.json({ authenticated: true, ...partner });
  });
}

router.post("/partner/register", async (req, res): Promise<void> => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  const email = input.email.toLowerCase();
  const existing = await db.select({ id: rentalOperatorStaffTable.id }).from(rentalOperatorStaffTable)
    .where(eq(rentalOperatorStaffTable.email, email)).limit(1);
  if (existing.length) {
    res.status(409).json({ error: "An account already exists for this email" });
    return;
  }
  const slug = `${slugify(input.businessName)}-${randomBytes(4).toString("hex")}`;
  const passwordHash = await hashPassword(input.password);
  const result = await db.transaction(async (tx) => {
    const [operator] = await tx.insert(rentalOperatorsTable).values({
      slug,
      name: input.businessName,
      legalName: input.legalName,
      contactEmail: email,
      contactPhone: input.contactPhone,
      status: "pending",
      verificationStatus: "draft",
    }).returning();
    const [staff] = await tx.insert(rentalOperatorStaffTable).values({
      operatorId: operator.id,
      identitySubject: randomUUID(),
      email,
      passwordHash,
      displayName: input.displayName ?? input.businessName,
      role: "owner",
      status: "active",
      active: true,
      joinedAt: new Date(),
    }).returning();
    return { operator, staff };
  });
  req.session.regenerate((error) => {
    if (error) {
      res.status(500).json({ error: "Account created, but could not establish partner session" });
      return;
    }
    (req.session as unknown as Record<string, unknown>)[PARTNER_SESSION_KEY] = {
      operatorId: result.operator.id, staffId: result.staff.id, email, role: "owner",
    } satisfies PartnerIdentity;
    res.status(201).json({ authenticated: true, staff: {
      id: result.staff.id, email, displayName: result.staff.displayName, role: result.staff.role,
    }, operator: result.operator });
  });
});

router.post("/partner/login", async (req, res): Promise<void> => {
  const ip = req.ip || "unknown";
  if (rateLimited(ip)) {
    res.status(429).json({ error: "Too many login attempts. Try again later." });
    return;
  }
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const matches = await db.select({ staff: rentalOperatorStaffTable, operator: rentalOperatorsTable })
    .from(rentalOperatorStaffTable)
    .innerJoin(rentalOperatorsTable, eq(rentalOperatorStaffTable.operatorId, rentalOperatorsTable.id))
    .where(and(
      eq(rentalOperatorStaffTable.email, parsed.data.email.trim().toLowerCase()),
      eq(rentalOperatorStaffTable.active, true),
      eq(rentalOperatorStaffTable.status, "active"),
      ...(parsed.data.operatorSlug ? [eq(rentalOperatorsTable.slug, parsed.data.operatorSlug.trim().toLowerCase())] : []),
    ));
  if (matches.length > 1) {
    res.status(400).json({ error: "Specify the operator slug for this account" });
    return;
  }
  const match = matches[0];
  if (!match || !(await verifyPassword(parsed.data.password, match.staff.passwordHash))) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  if (["suspended", "closed"].includes(match.operator.status)) {
    res.status(403).json({ error: "Partner account is inactive" });
    return;
  }
  failedLogins.delete(ip);
  setPartnerSession(req, res, match.staff);
});

router.post("/partner/logout", (req, res): void => {
  const session = req.session as unknown as Record<string, unknown>;
  delete session[PARTNER_SESSION_KEY];
  req.session.save((error) => {
    if (error) {
      res.status(500).json({ error: "Could not end partner session" });
      return;
    }
    res.json({ message: "Logged out" });
  });
});

function missingRequirements(operator: typeof rentalOperatorsTable.$inferSelect, docs: Array<typeof rentalOperatorDocumentsTable.$inferSelect>): string[] {
  const details = operator.businessDetails ?? {};
  const missing: string[] = [];
  if (!operator.legalName) missing.push("legalName");
  if (!operator.contactEmail || !operator.contactPhone) missing.push("contact");
  for (const key of ["permissions", "serviceAddress", "serviceLocation", "serviceHours", "emergencyContact"]) {
    if (!details[key]) missing.push(key);
  }
  if (!operator.termsAcceptedAt) missing.push("terms");
  if (!operator.insuranceExpiresAt || operator.insuranceExpiresAt <= new Date()) missing.push("validInsurance");
  if (!operator.permissionExpiresAt || operator.permissionExpiresAt <= new Date()) missing.push("validPermissions");
  if (!docs.some((doc) =>
    ["insurance", "business_license", "vehicle_permission"].includes(doc.documentType) &&
    ["uploaded", "under_review", "accepted"].includes(doc.status) &&
    (doc.metadata as Record<string, unknown> | null)?.uploadComplete === true,
  )) {
    missing.push("acceptedEvidence");
  }
  return missing;
}

function missingApprovalRequirements(
  operator: typeof rentalOperatorsTable.$inferSelect,
  docs: Array<typeof rentalOperatorDocumentsTable.$inferSelect>,
): string[] {
  const missing = missingRequirements(operator, docs).filter((item) => item !== "acceptedEvidence");
  const now = new Date();
  for (const type of ["insurance", "business_license", "vehicle_permission"]) {
    const accepted = docs.some((doc) =>
      doc.documentType === type &&
      doc.status === "accepted" &&
      (doc.metadata as Record<string, unknown> | null)?.uploadComplete === true &&
      (!doc.expiresAt || doc.expiresAt > now),
    );
    if (!accepted) missing.push(`accepted_${type}`);
  }
  if (operator.payoutStatus !== "verified") missing.push("verifiedPayout");
  if (operator.payoutExpiresAt && operator.payoutExpiresAt <= now) missing.push("validPayout");
  return missing;
}

async function partnerSnapshot(operatorId: number, staffId: number): Promise<Record<string, unknown> | null> {
  const [row] = await db.select({ staff: rentalOperatorStaffTable, operator: rentalOperatorsTable })
    .from(rentalOperatorStaffTable)
    .innerJoin(rentalOperatorsTable, eq(rentalOperatorStaffTable.operatorId, rentalOperatorsTable.id))
    .where(and(eq(rentalOperatorStaffTable.id, staffId), eq(rentalOperatorsTable.id, operatorId)));
  if (!row) return null;
  const documents = await db.select({
    id: rentalOperatorDocumentsTable.id,
    documentType: rentalOperatorDocumentsTable.documentType,
    status: rentalOperatorDocumentsTable.status,
    expiresAt: rentalOperatorDocumentsTable.expiresAt,
    createdAt: rentalOperatorDocumentsTable.createdAt,
  }).from(rentalOperatorDocumentsTable)
    .where(eq(rentalOperatorDocumentsTable.operatorId, operatorId));
  const docsForRequirements = await db.select().from(rentalOperatorDocumentsTable)
    .where(eq(rentalOperatorDocumentsTable.operatorId, operatorId));
  const { passwordHash: _passwordHash, identitySubject: _identitySubject, ...staff } = row.staff;
  const operator = { ...row.operator };
  return {
    staff,
    operator,
    requirements: { missing: missingRequirements(row.operator, docsForRequirements), documents },
  };
}

router.get("/partner/me", authenticatePartner, async (req, res): Promise<void> => {
  const current = identity(req);
  const snapshot = await partnerSnapshot(current.operatorId, current.staffId);
  if (!snapshot) {
    res.status(404).json({ error: "Partner account not found" });
    return;
  }
  res.set("Cache-Control", "no-store");
  res.json(snapshot);
});

const ApplicationSchema = z.object({
  legalName: z.string().trim().min(1).max(200).optional(),
  contactEmail: z.string().trim().email().max(254).optional(),
  contactPhone: z.string().trim().min(1).max(80).optional(),
  address: z.string().trim().min(1).max(500).optional(),
  permissions: z.record(z.string(), z.unknown()).or(z.string().trim().min(1)).optional(),
  insurance: z.record(z.string(), z.unknown()).optional(),
  serviceAddress: z.string().trim().min(1).max(500).optional(),
  serviceLocation: z.record(z.string(), z.unknown()).optional(),
  serviceHours: z.record(z.string(), z.unknown()).optional(),
  emergencyContact: z.record(z.string(), z.unknown()).optional(),
  insuranceExpiresAt: z.coerce.date().optional(),
  permissionExpiresAt: z.coerce.date().optional(),
  termsAccepted: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one application field is required");

async function updateApplication(req: Request, res: import("express").Response): Promise<void> {
  const current = identity(req);
  if (current.role !== "owner") {
    res.status(403).json({ error: "Only the owner can edit the partner application" });
    return;
  }
  const parsed = ApplicationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const existing = await db.select().from(rentalOperatorsTable)
    .where(eq(rentalOperatorsTable.id, current.operatorId)).then((rows) => rows[0]);
  if (!existing) {
    res.status(404).json({ error: "Partner account not found" });
    return;
  }
  const details = { ...(existing.businessDetails ?? {}) };
  for (const key of ["permissions", "insurance", "serviceAddress", "serviceLocation", "serviceHours", "emergencyContact"] as const) {
    if (data[key] !== undefined) details[key] = data[key];
  }
  if (data.termsAccepted) details.termsAcceptedAt = new Date().toISOString();
  const [operator] = await db.update(rentalOperatorsTable).set({
    ...(data.legalName !== undefined ? { legalName: data.legalName } : {}),
    ...(data.contactEmail !== undefined ? { contactEmail: data.contactEmail.toLowerCase() } : {}),
    ...(data.contactPhone !== undefined ? { contactPhone: data.contactPhone } : {}),
    ...(data.address !== undefined ? { address: data.address } : {}),
    ...(data.insuranceExpiresAt !== undefined ? { insuranceExpiresAt: data.insuranceExpiresAt } : {}),
    ...(data.permissionExpiresAt !== undefined ? { permissionExpiresAt: data.permissionExpiresAt } : {}),
    ...(data.termsAccepted ? { termsAcceptedAt: new Date() } : {}),
    businessDetails: details,
    verificationStatus: existing.verificationStatus === "submitted" || existing.verificationStatus === "under_review"
      ? "needs_information" : existing.verificationStatus,
    updatedAt: new Date(),
  }).where(eq(rentalOperatorsTable.id, current.operatorId)).returning();
  res.json({ operator });
}

router.put("/partner/application", authenticatePartner, updateApplication);
router.put("/partner/apply", authenticatePartner, updateApplication);
router.post("/partner/application/documents/upload-request", authenticatePartner, async (req, res): Promise<void> => {
  const current = identity(req);
  if (current.role !== "owner") {
    res.status(403).json({ error: "Only the owner can upload application evidence" });
    return;
  }
  const parsed = z.object({
    documentType: z.enum(["insurance", "business_license", "vehicle_permission", "other"]),
    contentType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
    originalFileName: z.string().trim().min(1).max(255).optional(),
    expiresAt: z.coerce.date().optional(),
  }).strict().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const token = createRentalDocumentToken();
  try {
    const [document] = await db.insert(rentalOperatorDocumentsTable).values({
      operatorId: current.operatorId,
      uploadedByStaffId: current.staffId,
      documentType: parsed.data.documentType,
      storageKey: rentalPrivateReference(token),
      originalFileName: parsed.data.originalFileName,
      contentType: parsed.data.contentType,
      status: "under_review",
      expiresAt: parsed.data.expiresAt,
      metadata: { uploadComplete: false },
    }).returning();
    res.status(201).json({
      documentId: document.id,
      uploadPath: `/api/partner/application/documents/${document.id}/content`,
      method: "PUT",
      contentType: parsed.data.contentType,
      maxBytes: 10 * 1024 * 1024,
    });
  } catch (error) {
    req.log.error({ err: error, action: "partner_evidence_upload_request_failed" });
    res.status(503).json({ error: "Private document storage is unavailable" });
  }
});

router.put("/partner/application/documents/:documentId/content", authenticatePartner, async (req, res): Promise<void> => {
  const current = identity(req);
  const documentId = Number(req.params.documentId);
  if (!Number.isSafeInteger(documentId) || documentId < 1) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  const [document] = await db.select().from(rentalOperatorDocumentsTable).where(and(
    eq(rentalOperatorDocumentsTable.id, documentId),
    eq(rentalOperatorDocumentsTable.operatorId, current.operatorId),
  ));
  if (!document || document.status !== "under_review" ||
      (document.metadata as Record<string, unknown> | null)?.uploadComplete === true) {
    res.status(404).json({ error: "Document not found or already uploaded" });
    return;
  }
  const contentType = req.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  const contentLength = Number(req.get("content-length") ?? 0);
  if (contentType !== document.contentType || !isAllowedRentalDocumentContentType(contentType)) {
    res.status(415).json({ error: "Uploaded content type does not match the requested evidence type" });
    return;
  }
  if (contentLength > 10 * 1024 * 1024) {
    res.status(413).json({ error: "Evidence exceeds the 10 MB limit" });
    return;
  }
  const token = parseRentalPrivateReference(document.storageKey);
  if (!token) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  try {
    await receiveRentalDocumentUpload(rentalDocumentObjectName(current.operatorId, token), req, contentType);
    await db.update(rentalOperatorDocumentsTable)
      .set({ metadata: { ...(document.metadata ?? {}), uploadComplete: true }, updatedAt: new Date() })
      .where(eq(rentalOperatorDocumentsTable.id, documentId));
    res.status(204).end();
  } catch (error) {
    req.log.warn({ err: error, action: "partner_evidence_upload_failed", documentId });
    const message = error instanceof Error ? error.message : "";
    if (message.includes("exceeds the 10 MB limit")) {
      res.status(413).json({ error: "Evidence exceeds the 10 MB limit" });
      return;
    }
    if (message.includes("Only PDF") || message.includes("upload is empty")) {
      res.status(400).json({ error: message });
      return;
    }
    res.status(503).json({ error: "Private document storage is unavailable" });
  }
});

router.get("/partner/application/documents/:documentId/content", authenticatePartner, async (req, res): Promise<void> => {
  const current = identity(req);
  const documentId = Number(req.params.documentId);
  const [document] = Number.isSafeInteger(documentId) && documentId > 0
    ? await db.select().from(rentalOperatorDocumentsTable).where(and(
      eq(rentalOperatorDocumentsTable.id, documentId),
      eq(rentalOperatorDocumentsTable.operatorId, current.operatorId),
    ))
    : [];
  const token = document ? parseRentalPrivateReference(document.storageKey) : null;
  if (!document || !token || (document.metadata as Record<string, unknown> | null)?.uploadComplete !== true) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  try {
    await streamRentalDocument(rentalDocumentObjectName(current.operatorId, token), res);
  } catch (error) {
    req.log.error({ err: error, action: "partner_evidence_stream_failed", documentId });
    if (!res.headersSent) res.status(404).json({ error: "Document not found" });
    else res.destroy(error instanceof Error ? error : undefined);
  }
});

router.get("/admin/rental/partners/:id/documents/:documentId/content", requireAdminAuth, async (req, res): Promise<void> => {
  const operatorId = Number(req.params.id);
  const documentId = Number(req.params.documentId);
  const [document] = Number.isSafeInteger(operatorId) && operatorId > 0 && Number.isSafeInteger(documentId) && documentId > 0
    ? await db.select().from(rentalOperatorDocumentsTable).where(and(
      eq(rentalOperatorDocumentsTable.id, documentId),
      eq(rentalOperatorDocumentsTable.operatorId, operatorId),
    ))
    : [];
  const token = document ? parseRentalPrivateReference(document.storageKey) : null;
  if (!document || !token || (document.metadata as Record<string, unknown> | null)?.uploadComplete !== true) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  try {
    await streamRentalDocument(rentalDocumentObjectName(operatorId, token), res);
  } catch (error) {
    req.log.error({ err: error, action: "admin_partner_evidence_stream_failed", documentId });
    if (!res.headersSent) res.status(404).json({ error: "Document not found" });
    else res.destroy(error instanceof Error ? error : undefined);
  }
});
router.get("/partner/apply", authenticatePartner, async (req, res): Promise<void> => {
  const current = identity(req);
  const snapshot = await partnerSnapshot(current.operatorId, current.staffId);
  if (!snapshot) {
    res.status(404).json({ error: "Partner account not found" });
    return;
  }
  res.json(snapshot);
});

router.post("/partner/application/submit", authenticatePartner, async (req, res): Promise<void> => {
  const current = identity(req);
  if (current.role !== "owner") {
    res.status(403).json({ error: "Only the owner can submit the partner application" });
    return;
  }
  const [operator] = await db.select().from(rentalOperatorsTable)
    .where(eq(rentalOperatorsTable.id, current.operatorId));
  if (!operator) {
    res.status(404).json({ error: "Partner account not found" });
    return;
  }
  const docs = await db.select().from(rentalOperatorDocumentsTable)
    .where(eq(rentalOperatorDocumentsTable.operatorId, current.operatorId));
  const missing = missingRequirements(operator, docs);
  if (missing.length) {
    res.status(400).json({ error: "Partner application is incomplete", requirements: missing });
    return;
  }
  const now = new Date();
  const [updated] = await db.update(rentalOperatorsTable).set({
    verificationStatus: "submitted",
    status: "pending",
    updatedAt: now,
  }).where(eq(rentalOperatorsTable.id, current.operatorId)).returning();
  await db.insert(rentalOperatorVerificationsTable).values({
    operatorId: current.operatorId,
    verificationType: "partner_application",
    status: "submitted",
    submittedByStaffId: current.staffId,
    details: { submittedBy: current.email },
    submittedAt: now,
  });
  res.json({ operator: updated, requirements: { missing: [] } });
});

router.get("/partner/staff", authenticatePartner, async (req, res): Promise<void> => {
  const staff = await db.select({
    id: rentalOperatorStaffTable.id,
    email: rentalOperatorStaffTable.email,
    displayName: rentalOperatorStaffTable.displayName,
    role: rentalOperatorStaffTable.role,
    status: rentalOperatorStaffTable.status,
    active: rentalOperatorStaffTable.active,
    invitedAt: rentalOperatorStaffTable.invitedAt,
    joinedAt: rentalOperatorStaffTable.joinedAt,
  }).from(rentalOperatorStaffTable).where(eq(rentalOperatorStaffTable.operatorId, identity(req).operatorId));
  res.json(staff);
});

const staffRoleSchema = z.enum(["manager", "counter", "operations"]);
router.post("/partner/staff", authenticatePartner, async (req, res): Promise<void> => {
  const current = identity(req);
  if (current.role !== "owner") {
    res.status(403).json({ error: "Only the owner can create partner staff accounts" });
    return;
  }
  const parsed = z.object({
    email: z.string().trim().email().max(254),
    password: z.string().min(12).max(1024),
    displayName: z.string().trim().min(1).max(200).optional(),
    role: staffRoleSchema,
  }).strict().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const email = parsed.data.email.toLowerCase();
  const [existing] = await db.select({ id: rentalOperatorStaffTable.id })
    .from(rentalOperatorStaffTable)
    .where(and(
      eq(rentalOperatorStaffTable.operatorId, current.operatorId),
      eq(rentalOperatorStaffTable.email, email),
    ));
  if (existing) {
    res.status(409).json({ error: "Staff account already exists for this operator" });
    return;
  }
  const [staff] = await db.insert(rentalOperatorStaffTable).values({
    operatorId: current.operatorId,
    identitySubject: randomUUID(),
    email,
    passwordHash: await hashPassword(parsed.data.password),
    displayName: parsed.data.displayName,
    role: parsed.data.role,
    status: "active",
    active: true,
    joinedAt: new Date(),
  }).returning({
    id: rentalOperatorStaffTable.id,
    email: rentalOperatorStaffTable.email,
    displayName: rentalOperatorStaffTable.displayName,
    role: rentalOperatorStaffTable.role,
    status: rentalOperatorStaffTable.status,
    active: rentalOperatorStaffTable.active,
    createdAt: rentalOperatorStaffTable.createdAt,
  });
  res.status(201).json(staff);
});

router.put("/partner/staff/:id", authenticatePartner, async (req, res): Promise<void> => {
  const current = identity(req);
  const staffId = Number(req.params.id);
  if (current.role !== "owner") {
    res.status(403).json({ error: "Only the owner can manage partner staff" });
    return;
  }
  const parsed = z.object({
    role: staffRoleSchema.optional(),
    active: z.boolean().optional(),
    displayName: z.string().trim().min(1).max(200).nullable().optional(),
  }).strict().refine((data) => Object.keys(data).length > 0, "At least one staff field is required").safeParse(req.body);
  if (!Number.isSafeInteger(staffId) || staffId < 1 || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "Invalid staff ID" : parsed.error.message });
    return;
  }
  if (staffId === current.staffId) {
    res.status(400).json({ error: "The owner cannot change or revoke their own account" });
    return;
  }
  const [target] = await db.select().from(rentalOperatorStaffTable).where(and(
    eq(rentalOperatorStaffTable.id, staffId),
    eq(rentalOperatorStaffTable.operatorId, current.operatorId),
  ));
  if (!target || target.role === "owner") {
    res.status(404).json({ error: "Staff account not found" });
    return;
  }
  const active = parsed.data.active ?? target.active;
  const [updated] = await db.update(rentalOperatorStaffTable).set({
    ...(parsed.data.role !== undefined ? { role: parsed.data.role } : {}),
    ...(parsed.data.displayName !== undefined ? { displayName: parsed.data.displayName } : {}),
    active,
    status: active ? "active" : "suspended",
    updatedAt: new Date(),
  }).where(and(
    eq(rentalOperatorStaffTable.id, staffId),
    eq(rentalOperatorStaffTable.operatorId, current.operatorId),
  )).returning({
    id: rentalOperatorStaffTable.id,
    email: rentalOperatorStaffTable.email,
    displayName: rentalOperatorStaffTable.displayName,
    role: rentalOperatorStaffTable.role,
    status: rentalOperatorStaffTable.status,
    active: rentalOperatorStaffTable.active,
    updatedAt: rentalOperatorStaffTable.updatedAt,
  });
  res.json(updated);
});

router.delete("/partner/staff/:id", authenticatePartner, async (req, res): Promise<void> => {
  const current = identity(req);
  const staffId = Number(req.params.id);
  if (current.role !== "owner") {
    res.status(403).json({ error: "Only the owner can revoke partner staff" });
    return;
  }
  if (!Number.isSafeInteger(staffId) || staffId < 1 || staffId === current.staffId) {
    res.status(400).json({ error: "Invalid staff ID; owners cannot revoke themselves" });
    return;
  }
  const revoked = await db.update(rentalOperatorStaffTable).set({
    active: false,
    status: "removed",
    updatedAt: new Date(),
  }).where(and(
    eq(rentalOperatorStaffTable.id, staffId),
    eq(rentalOperatorStaffTable.operatorId, current.operatorId),
    inArray(rentalOperatorStaffTable.role, ["manager", "counter", "operations"]),
  )).returning({ id: rentalOperatorStaffTable.id });
  if (!revoked.length) {
    res.status(404).json({ error: "Staff account not found" });
    return;
  }
  res.json({ revoked: true });
});

function serializePartnerAddon(addon: typeof rentalAddonsTable.$inferSelect) {
  return {
    ...addon,
    createdAt: addon.createdAt.toISOString(),
    updatedAt: addon.updatedAt.toISOString(),
  };
}

const PartnerAddonSchema = z.object({
  name: z.string().trim().min(1).max(200),
  nameJa: z.string().max(200).nullable().optional(),
  nameZhTw: z.string().max(200).nullable().optional(),
  description: z.string().max(5000).optional(),
  descriptionJa: z.string().max(5000).nullable().optional(),
  descriptionZhTw: z.string().max(5000).nullable().optional(),
  image: z.string().trim().min(1).max(2000)
    .refine((value) => /^https:\/\//i.test(value) || value.startsWith("/"), "Image must be an HTTPS URL or app path")
    .nullable().optional(),
  pricingType: z.enum(["flat", "per_day"]).optional(),
  flatFee: z.number().finite().nonnegative().max(1_000_000).optional(),
  perDayFee: z.number().finite().nonnegative().max(1_000_000).optional(),
  maxQty: z.number().int().min(1).max(1000).optional(),
  inventoryLimit: z.number().int().nonnegative().nullable().optional(),
  vehicleCompatibility: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
  required: z.boolean().optional(),
  published: z.boolean().optional(),
  sortOrder: z.number().int().min(-100_000).max(100_000).optional(),
}).strict();

router.get("/partner/addons", authenticatePartner, async (req, res): Promise<void> => {
  const addons = await db.select().from(rentalAddonsTable)
    .where(eq(rentalAddonsTable.operatorId, identity(req).operatorId));
  res.json(addons.map(serializePartnerAddon));
});

router.post("/partner/addons", authenticatePartner, async (req, res): Promise<void> => {
  if (!canManageInventory(req)) {
    res.status(403).json({ error: "This staff role cannot manage partner extras" });
    return;
  }
  const parsed = PartnerAddonSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const pricingType = parsed.data.pricingType ?? "flat";
  const [addon] = await db.insert(rentalAddonsTable).values({
    ...parsed.data,
    pricingType,
    flatFee: pricingType === "per_day" ? 0 : parsed.data.flatFee ?? 0,
    perDayFee: pricingType === "flat" ? 0 : parsed.data.perDayFee ?? 0,
    perUnitFee: 0,
    operatorId: identity(req).operatorId,
  }).returning();
  res.status(201).json(serializePartnerAddon(addon));
});

router.put("/partner/addons/:id", authenticatePartner, async (req, res): Promise<void> => {
  if (!canManageInventory(req)) {
    res.status(403).json({ error: "This staff role cannot manage partner extras" });
    return;
  }
  const addonId = Number(req.params.id);
  const parsed = PartnerAddonSchema.partial().strict().safeParse(req.body);
  if (!Number.isSafeInteger(addonId) || addonId < 1 || !parsed.success || !Object.keys(parsed.data).length) {
    res.status(400).json({ error: parsed.success ? "Invalid addon ID or empty update" : parsed.error.message });
    return;
  }
  const [existing] = await db.select().from(rentalAddonsTable).where(and(
    eq(rentalAddonsTable.id, addonId),
    eq(rentalAddonsTable.operatorId, identity(req).operatorId),
  ));
  if (!existing) {
    res.status(404).json({ error: "Partner extra not found" });
    return;
  }
  const pricingType = parsed.data.pricingType ?? existing.pricingType;
  const [addon] = await db.update(rentalAddonsTable).set({
    ...parsed.data,
    ...(parsed.data.pricingType === "per_day" ? { flatFee: 0, perUnitFee: 0 } : {}),
    ...(parsed.data.pricingType === "flat" ? { perDayFee: 0, perUnitFee: 0 } : {}),
    ...(pricingType === "flat" && parsed.data.perDayFee !== undefined && parsed.data.pricingType === undefined
      ? { perDayFee: 0 } : {}),
    ...(pricingType === "per_day" && parsed.data.flatFee !== undefined && parsed.data.pricingType === undefined
      ? { flatFee: 0 } : {}),
    updatedAt: new Date(),
  }).where(and(
    eq(rentalAddonsTable.id, addonId),
    eq(rentalAddonsTable.operatorId, identity(req).operatorId),
  )).returning();
  res.json(serializePartnerAddon(addon));
});

router.delete("/partner/addons/:id", authenticatePartner, async (req, res): Promise<void> => {
  if (!canManageInventory(req)) {
    res.status(403).json({ error: "This staff role cannot manage partner extras" });
    return;
  }
  const addonId = Number(req.params.id);
  if (!Number.isSafeInteger(addonId) || addonId < 1) {
    res.status(400).json({ error: "Invalid addon ID" });
    return;
  }
  const [addon] = await db.select({ id: rentalAddonsTable.id }).from(rentalAddonsTable).where(and(
    eq(rentalAddonsTable.id, addonId),
    eq(rentalAddonsTable.operatorId, identity(req).operatorId),
  ));
  if (!addon) {
    res.status(404).json({ error: "Partner extra not found" });
    return;
  }
  const [reservationUse] = await db.select({ id: rentalReservationAddonsTable.id })
    .from(rentalReservationAddonsTable).where(eq(rentalReservationAddonsTable.addonId, addonId)).limit(1);
  if (reservationUse) {
    await db.update(rentalAddonsTable).set({ published: false, updatedAt: new Date() }).where(and(
      eq(rentalAddonsTable.id, addonId),
      eq(rentalAddonsTable.operatorId, identity(req).operatorId),
    ));
    res.json({ deleted: true, archived: true });
    return;
  }
  await db.delete(rentalAddonsTable).where(and(
    eq(rentalAddonsTable.id, addonId),
    eq(rentalAddonsTable.operatorId, identity(req).operatorId),
  ));
  res.json({ deleted: true, archived: false });
});

const VehicleSchema = z.object({
  internalName: z.string().trim().min(1).max(200),
  publicTitle: z.string().trim().min(1).max(200),
  brand: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(100),
  year: z.number().int().min(1900).max(2100),
  vehicleClass: z.enum(["economy", "compact", "midsize", "fullsize", "suv", "minivan", "van", "luxury", "sports", "truck"]).optional(),
  description: z.string().max(20_000).optional(),
  trim: z.string().max(100).nullable().optional(),
  color: z.string().max(80).nullable().optional(),
  plate: z.string().max(40).nullable().optional(),
  vin: z.string().max(40).nullable().optional(),
  seats: z.number().int().min(1).max(100).optional(),
  transmission: z.enum(["automatic", "manual", "cvt"]).optional(),
  fuelType: z.enum(["gasoline", "diesel", "hybrid", "electric", "plugin_hybrid"]).optional(),
  driveType: z.enum(["fwd", "rwd", "awd", "4wd"]).optional(),
  disclosures: z.record(z.string(), z.unknown()).optional(),
  hours: z.record(z.string(), z.unknown()).optional(),
  pickupLocations: z.array(z.string().max(300)).optional(),
  returnLocations: z.array(z.string().max(300)).optional(),
  afterHoursPickup: z.boolean().optional(),
  afterHoursReturn: z.boolean().optional(),
}).strict();
const editableVehicleFields = [
  "internalName", "publicTitle", "brand", "model", "year", "vehicleClass", "description",
  "trim", "color", "plate", "vin", "seats", "transmission", "fuelType", "driveType",
  "disclosures", "hours", "pickupLocations", "returnLocations", "afterHoursPickup", "afterHoursReturn",
] as const;

async function ownedVehicle(req: Request, vehicleId: number) {
  const current = identity(req);
  const [vehicle] = await db.select().from(rentalVehiclesTable).where(and(
    eq(rentalVehiclesTable.id, vehicleId),
    eq(rentalVehiclesTable.operatorId, current.operatorId),
    isNull(rentalVehiclesTable.deletedAt),
  ));
  return vehicle;
}

router.get("/partner/vehicles", authenticatePartner, async (req, res): Promise<void> => {
  const current = identity(req);
  const vehicles = await db.select().from(rentalVehiclesTable).where(and(
    eq(rentalVehiclesTable.operatorId, current.operatorId),
    isNull(rentalVehiclesTable.deletedAt),
  ));
  const ids = vehicles.map((vehicle) => vehicle.id);
  const [images, pricing] = ids.length
    ? await Promise.all([
      db.select().from(rentalVehicleImagesTable).where(inArray(rentalVehicleImagesTable.vehicleId, ids)),
      db.select().from(rentalVehiclePricingTable).where(inArray(rentalVehiclePricingTable.vehicleId, ids)),
    ])
    : [[], []];
  res.json(vehicles.map((vehicle) => ({
    ...vehicle,
    images: images.filter((image) => image.vehicleId === vehicle.id).sort((a, b) => a.sortOrder - b.sortOrder),
    pricing: pricing.find((entry) => entry.vehicleId === vehicle.id) ?? null,
  })));
});

router.post("/partner/vehicles", authenticatePartner, async (req, res): Promise<void> => {
  if (!canManageInventory(req)) {
    res.status(403).json({ error: "This staff role cannot manage inventory" });
    return;
  }
  const parsed = VehicleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const vehicleData = parsed.data;
  const slug = `${slugify(`${vehicleData.brand}-${vehicleData.model}-${vehicleData.year}`)}-${randomBytes(4).toString("hex")}`;
  const [vehicle] = await db.insert(rentalVehiclesTable).values({
    ...vehicleData,
    slug,
    operatorId: identity(req).operatorId,
    status: "draft",
    moderationStatus: "pending",
    useGlobalPickupSettings: false,
    featured: false,
    sortOrder: 0,
  }).returning();
  res.status(201).json(vehicle);
});

router.put("/partner/vehicles/:id", authenticatePartner, async (req, res): Promise<void> => {
  if (!canManageInventory(req)) {
    res.status(403).json({ error: "This staff role cannot manage inventory" });
    return;
  }
  const id = Number(req.params.id);
  const parsed = VehicleSchema.partial().strict().safeParse(req.body);
  if (!Number.isSafeInteger(id) || id < 1 || !parsed.success || !Object.keys(parsed.data).length) {
    res.status(400).json({ error: parsed.success ? "Invalid vehicle ID or empty update" : parsed.error.message });
    return;
  }
  const [vehicle] = await db.update(rentalVehiclesTable).set({
    ...parsed.data,
    status: "unpublished",
    moderationStatus: "pending",
    updatedAt: new Date(),
  }).where(and(
    eq(rentalVehiclesTable.id, id),
    eq(rentalVehiclesTable.operatorId, identity(req).operatorId),
    isNull(rentalVehiclesTable.deletedAt),
  )).returning();
  if (!vehicle) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }
  res.json(vehicle);
});

router.post("/partner/vehicles/:id/images", authenticatePartner, async (req, res): Promise<void> => {
  if (!canManageInventory(req)) {
    res.status(403).json({ error: "This staff role cannot manage inventory" });
    return;
  }
  const vehicleId = Number(req.params.id);
  const parsed = z.object({
    url: z.string().url().max(2000),
    caption: z.string().max(500).nullable().optional(),
    sortOrder: z.number().int().optional(),
    isCover: z.boolean().optional(),
  }).strict().safeParse(req.body);
  if (!Number.isSafeInteger(vehicleId) || vehicleId < 1 || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "Invalid vehicle ID" : parsed.error.message });
    return;
  }
  if (!await ownedVehicle(req, vehicleId)) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }
  const [image] = await db.insert(rentalVehicleImagesTable).values({ ...parsed.data, vehicleId }).returning();
  await db.update(rentalVehiclesTable).set({ status: "unpublished", moderationStatus: "pending", updatedAt: new Date() })
    .where(eq(rentalVehiclesTable.id, vehicleId));
  res.status(201).json(image);
});

router.delete("/partner/vehicles/:id/images", authenticatePartner, async (req, res): Promise<void> => {
  if (!canManageInventory(req)) {
    res.status(403).json({ error: "This staff role cannot manage inventory" });
    return;
  }
  const vehicleId = Number(req.params.id);
  const imageId = Number(req.body?.imageId ?? req.query.imageId);
  if (!Number.isSafeInteger(vehicleId) || vehicleId < 1 || !Number.isSafeInteger(imageId) || imageId < 1) {
    res.status(400).json({ error: "Valid vehicle ID and imageId are required" });
    return;
  }
  if (!await ownedVehicle(req, vehicleId)) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }
  const deleted = await db.delete(rentalVehicleImagesTable).where(and(
    eq(rentalVehicleImagesTable.id, imageId),
    eq(rentalVehicleImagesTable.vehicleId, vehicleId),
  )).returning();
  if (!deleted.length) {
    res.status(404).json({ error: "Vehicle image not found" });
    return;
  }
  await db.update(rentalVehiclesTable).set({ status: "unpublished", moderationStatus: "pending", updatedAt: new Date() })
    .where(eq(rentalVehiclesTable.id, vehicleId));
  res.json({ deleted: true });
});

router.put("/partner/vehicles/:id/pricing", authenticatePartner, async (req, res): Promise<void> => {
  if (!canManageInventory(req)) {
    res.status(403).json({ error: "This staff role cannot manage inventory" });
    return;
  }
  const vehicleId = Number(req.params.id);
  const pricingSchema = z.object({
    basePrice: z.number().nonnegative(),
    weekendPrice: z.number().nonnegative().nullable().optional(),
    holidayPrice: z.number().nonnegative().nullable().optional(),
    highSeasonPrice: z.number().nonnegative().nullable().optional(),
    winterSeasonPrice: z.number().nonnegative().nullable().optional(),
    weeklyDiscountPct: z.number().min(0).max(100).optional(),
    monthlyDiscountPct: z.number().min(0).max(100).optional(),
    minDays: z.number().int().min(1).optional(),
    maxDays: z.number().int().min(1).nullable().optional(),
    cleaningFee: z.number().nonnegative().optional(),
    deliveryFee: z.number().nonnegative().optional(),
    lateReturnFee: z.number().nonnegative().optional(),
    extraMileageFee: z.number().nonnegative().optional(),
    securityDeposit: z.number().nonnegative().optional(),
    taxIncluded: z.boolean().optional(),
    taxRate: z.number().min(0).max(1).optional(),
    airportPickupFee: z.number().nonnegative().optional(),
    airportDropoffFee: z.number().nonnegative().optional(),
  }).strict();
  const parsed = pricingSchema.safeParse(req.body);
  if (!Number.isSafeInteger(vehicleId) || vehicleId < 1 || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "Invalid vehicle ID" : parsed.error.message });
    return;
  }
  if (!await ownedVehicle(req, vehicleId)) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }
  const [currentPricing] = await db.select().from(rentalVehiclePricingTable)
    .where(eq(rentalVehiclePricingTable.vehicleId, vehicleId));
  const [pricing] = currentPricing
    ? await db.update(rentalVehiclePricingTable).set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(rentalVehiclePricingTable.vehicleId, vehicleId)).returning()
    : await db.insert(rentalVehiclePricingTable).values({ ...parsed.data, vehicleId }).returning();
  await db.update(rentalVehiclesTable).set({ status: "unpublished", moderationStatus: "pending", updatedAt: new Date() })
    .where(eq(rentalVehiclesTable.id, vehicleId));
  res.json(pricing);
});

router.get("/partner/vehicles/:id/blocks", authenticatePartner, async (req, res): Promise<void> => {
  const vehicleId = Number(req.params.id);
  if (!Number.isSafeInteger(vehicleId) || vehicleId < 1 || !await ownedVehicle(req, vehicleId)) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }
  res.json(await db.select().from(rentalAvailabilityBlocksTable)
    .where(eq(rentalAvailabilityBlocksTable.vehicleId, vehicleId)));
});

router.post("/partner/vehicles/:id/blocks", authenticatePartner, async (req, res): Promise<void> => {
  if (!canManageInventory(req)) {
    res.status(403).json({ error: "This staff role cannot manage inventory" });
    return;
  }
  const vehicleId = Number(req.params.id);
  const parsed = z.object({
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    reason: z.enum(["maintenance", "cleaning", "buffer", "manual", "holiday", "inspection", "other"]).default("manual"),
    notes: z.string().max(2000).nullable().optional(),
  }).strict().safeParse(req.body);
  if (!Number.isSafeInteger(vehicleId) || vehicleId < 1 || !parsed.success || parsed.data.startAt >= parsed.data.endAt) {
    res.status(400).json({ error: parsed.success ? "Invalid vehicle ID or date range" : parsed.error.message });
    return;
  }
  if (!await ownedVehicle(req, vehicleId)) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }
  const [block] = await db.insert(rentalAvailabilityBlocksTable).values({
    ...parsed.data,
    vehicleId,
    createdBy: identity(req).email,
  }).returning();
  res.status(201).json(block);
});

router.delete("/partner/vehicles/:id/blocks", authenticatePartner, async (req, res): Promise<void> => {
  if (!canManageInventory(req)) {
    res.status(403).json({ error: "This staff role cannot manage inventory" });
    return;
  }
  const vehicleId = Number(req.params.id);
  const blockId = Number(req.body?.blockId ?? req.query.blockId);
  if (!Number.isSafeInteger(vehicleId) || vehicleId < 1 || !Number.isSafeInteger(blockId) || blockId < 1) {
    res.status(400).json({ error: "Valid vehicle ID and blockId are required" });
    return;
  }
  if (!await ownedVehicle(req, vehicleId)) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }
  const [targetBlock] = await db.select().from(rentalAvailabilityBlocksTable).where(and(
    eq(rentalAvailabilityBlocksTable.id, blockId),
    eq(rentalAvailabilityBlocksTable.vehicleId, vehicleId),
  ));
  if (!targetBlock) {
    res.status(404).json({ error: "Vehicle block not found" });
    return;
  }
  if (targetBlock.notes?.startsWith("partner-maintenance-record:")) {
    res.status(409).json({ error: "Maintenance blocks are managed by the maintenance record; update or cancel that record instead" });
    return;
  }
  const deleted = await db.delete(rentalAvailabilityBlocksTable).where(and(
    eq(rentalAvailabilityBlocksTable.id, blockId),
    eq(rentalAvailabilityBlocksTable.vehicleId, vehicleId),
  )).returning();
  if (!deleted.length) {
    res.status(404).json({ error: "Vehicle block not found" });
    return;
  }
  res.json({ deleted: true });
});

router.get("/partner/vehicles/:id/maintenance", authenticatePartner, async (req, res): Promise<void> => {
  const vehicleId = Number(req.params.id);
  if (!Number.isSafeInteger(vehicleId) || vehicleId < 1 || !await ownedVehicle(req, vehicleId)) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }
  res.json(await db.select().from(rentalMaintenanceTable).where(eq(rentalMaintenanceTable.vehicleId, vehicleId)));
});

function maintenanceWindow(record: {
  scheduledDate: string | null;
  startAt: Date | null;
  endAt: Date | null;
}): { startAt: Date; endAt: Date } | null {
  if (record.startAt || record.endAt) {
    if (!record.startAt || !record.endAt || record.startAt >= record.endAt) return null;
    return { startAt: record.startAt, endAt: record.endAt };
  }
  if (!record.scheduledDate) return null;
  const startAt = new Date(`${record.scheduledDate}T00:00:00.000Z`);
  const endAt = new Date(startAt.getTime() + 24 * 60 * 60 * 1000);
  return { startAt, endAt };
}

function windowIncludesNow(range: { startAt: Date; endAt: Date }): boolean {
  const now = Date.now();
  return range.startAt.getTime() <= now && range.endAt.getTime() > now;
}

function hasMeaningfulJsonValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.some(hasMeaningfulJsonValue);
  if (value && typeof value === "object") return Object.values(value).some(hasMeaningfulJsonValue);
  return false;
}

router.post("/partner/vehicles/:id/maintenance", authenticatePartner, async (req, res): Promise<void> => {
  if (!canManageInventory(req)) {
    res.status(403).json({ error: "This staff role cannot manage inventory" });
    return;
  }
  const vehicleId = Number(req.params.id);
  const parsed = z.object({
    type: z.string().trim().min(1).max(100),
    description: z.string().max(5000).nullable().optional(),
    provider: z.string().max(300).nullable().optional(),
    scheduledDate: z.string().date().nullable().optional(),
    startAt: z.coerce.date().nullable().optional(),
    endAt: z.coerce.date().nullable().optional(),
    mileage: z.number().int().nonnegative().nullable().optional(),
    cost: z.number().nonnegative().nullable().optional(),
    status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).optional(),
    notes: z.string().max(5000).nullable().optional(),
  }).strict().safeParse(req.body);
  if (!Number.isSafeInteger(vehicleId) || vehicleId < 1 || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "Invalid vehicle ID" : parsed.error.message });
    return;
  }
  if (!await ownedVehicle(req, vehicleId)) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }
  const range = maintenanceWindow({
    scheduledDate: parsed.data.scheduledDate ?? null,
    startAt: parsed.data.startAt ?? null,
    endAt: parsed.data.endAt ?? null,
  });
  if (!range || (parsed.data.status === "in_progress" && !windowIncludesNow(range))) {
    res.status(400).json({ error: "Maintenance must include a valid scheduled date or time range; in-progress work must overlap now" });
    return;
  }
  const maintenance = await db.transaction(async (tx) => {
    const [row] = await tx.insert(rentalMaintenanceTable).values({ ...parsed.data, vehicleId }).returning();
    if (!["completed", "cancelled"].includes(row.status)) {
      await tx.insert(rentalAvailabilityBlocksTable).values({
        vehicleId,
        startAt: range.startAt,
        endAt: range.endAt,
        reason: "maintenance",
        notes: `partner-maintenance-record:${row.id}`,
        createdBy: identity(req).email,
      });
    }
    return row;
  });
  res.status(201).json(maintenance);
});

router.put("/partner/vehicles/:id/maintenance", authenticatePartner, async (req, res): Promise<void> => {
  if (!canManageInventory(req)) {
    res.status(403).json({ error: "This staff role cannot manage inventory" });
    return;
  }
  const vehicleId = Number(req.params.id);
  const maintenanceId = Number(req.body?.id);
  const parsed = z.object({
    id: z.number().int().positive(),
    type: z.string().trim().min(1).max(100).optional(),
    description: z.string().max(5000).nullable().optional(),
    provider: z.string().max(300).nullable().optional(),
    scheduledDate: z.string().date().nullable().optional(),
    startAt: z.coerce.date().nullable().optional(),
    endAt: z.coerce.date().nullable().optional(),
    mileage: z.number().int().nonnegative().nullable().optional(),
    cost: z.number().nonnegative().nullable().optional(),
    status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).optional(),
    notes: z.string().max(5000).nullable().optional(),
  }).strict().safeParse(req.body);
  if (!Number.isSafeInteger(vehicleId) || vehicleId < 1 || !Number.isSafeInteger(maintenanceId) || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "Invalid vehicle or maintenance ID" : parsed.error.message });
    return;
  }
  if (!await ownedVehicle(req, vehicleId)) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }
  const { id: _id, ...updates } = parsed.data;
  const [existing] = await db.select().from(rentalMaintenanceTable).where(and(
    eq(rentalMaintenanceTable.id, maintenanceId),
    eq(rentalMaintenanceTable.vehicleId, vehicleId),
  ));
  if (!existing) {
    res.status(404).json({ error: "Maintenance record not found" });
    return;
  }
  const merged = { ...existing, ...updates };
  const range = maintenanceWindow(merged);
  if (!range || (merged.status === "in_progress" && !windowIncludesNow(range))) {
    res.status(400).json({ error: "Maintenance must include a valid scheduled date or time range; in-progress work must overlap now" });
    return;
  }
  const maintenance = await db.transaction(async (tx) => {
    const [row] = await tx.update(rentalMaintenanceTable).set({ ...updates, updatedAt: new Date() }).where(and(
      eq(rentalMaintenanceTable.id, maintenanceId),
      eq(rentalMaintenanceTable.vehicleId, vehicleId),
    )).returning();
    await tx.delete(rentalAvailabilityBlocksTable).where(and(
      eq(rentalAvailabilityBlocksTable.vehicleId, vehicleId),
      eq(rentalAvailabilityBlocksTable.notes, `partner-maintenance-record:${maintenanceId}`),
    ));
    if (!["completed", "cancelled"].includes(row.status)) {
      await tx.insert(rentalAvailabilityBlocksTable).values({
        vehicleId,
        startAt: range.startAt,
        endAt: range.endAt,
        reason: "maintenance",
        notes: `partner-maintenance-record:${maintenanceId}`,
        createdBy: identity(req).email,
      });
    }
    return row;
  });
  res.json(maintenance);
});

const adminReviewSchema = z.object({
  action: z.enum(["approve", "request_changes", "reject", "suspend", "reactivate"]),
  reason: z.string().trim().min(1).max(5000),
  payoutStatus: z.enum(["pending", "verified", "rejected", "expired"]).optional(),
  payoutExpiresAt: z.coerce.date().nullable().optional(),
}).strict();

router.post("/admin/rental/partners/:id/documents/:documentId/review", requireAdminAuth, async (req, res): Promise<void> => {
  const operatorId = Number(req.params.id);
  const documentId = Number(req.params.documentId);
  const parsed = z.object({
    status: z.enum(["accepted", "rejected", "expired", "under_review"]),
    reason: z.string().trim().min(1).max(5000),
  }).strict().safeParse(req.body);
  if (!Number.isSafeInteger(operatorId) || operatorId < 1 || !Number.isSafeInteger(documentId) || documentId < 1 || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "Invalid partner or document ID" : parsed.error.message });
    return;
  }
  const [operator] = await db.select().from(rentalOperatorsTable).where(and(
    eq(rentalOperatorsTable.id, operatorId),
    eq(rentalOperatorsTable.isPlatform, false),
  ));
  const [document] = await db.select().from(rentalOperatorDocumentsTable).where(and(
    eq(rentalOperatorDocumentsTable.id, documentId),
    eq(rentalOperatorDocumentsTable.operatorId, operatorId),
  ));
  if (!operator || !document) {
    res.status(404).json({ error: "Partner evidence not found" });
    return;
  }
  const now = new Date();
  if (parsed.data.status === "accepted" &&
      ((document.metadata as Record<string, unknown> | null)?.uploadComplete !== true ||
       (document.expiresAt && document.expiresAt <= now))) {
    res.status(400).json({ error: "Evidence must be completely uploaded and unexpired before acceptance" });
    return;
  }
  const session = req.session as unknown as { admin?: { username?: string } };
  const actor = session.admin?.username ?? "admin";
  const [updated] = await db.update(rentalOperatorDocumentsTable).set({
    status: parsed.data.status,
    reviewedAt: now,
    updatedAt: now,
  }).where(and(
    eq(rentalOperatorDocumentsTable.id, documentId),
    eq(rentalOperatorDocumentsTable.operatorId, operatorId),
  )).returning({
    id: rentalOperatorDocumentsTable.id,
    documentType: rentalOperatorDocumentsTable.documentType,
    status: rentalOperatorDocumentsTable.status,
    expiresAt: rentalOperatorDocumentsTable.expiresAt,
    reviewedAt: rentalOperatorDocumentsTable.reviewedAt,
  });
  await db.insert(rentalOperatorVerificationsTable).values({
    operatorId,
    verificationType: "evidence_review",
    status: parsed.data.status === "accepted" ? "approved" : "needs_information",
    reviewedBy: actor,
    reviewNotes: parsed.data.reason,
    details: { documentId, documentType: document.documentType, documentStatus: parsed.data.status },
    reviewedAt: now,
  });
  await db.insert(rentalAuditLogTable).values({
    adminUser: actor,
    action: "partner_evidence_review",
    recordType: "rental_operator_document",
    recordId: documentId,
    previousValue: { status: document.status },
    newValue: { status: parsed.data.status, reason: parsed.data.reason },
  });
  res.json({ document: updated });
});

router.post("/admin/rental/partners/:id/payout", requireAdminAuth, async (req, res): Promise<void> => {
  const operatorId = Number(req.params.id);
  const parsed = z.object({
    payoutStatus: z.enum(["pending", "verified", "rejected", "expired"]),
    payoutExpiresAt: z.coerce.date().nullable(),
    reason: z.string().trim().min(1).max(5000),
  }).strict().safeParse(req.body);
  if (!Number.isSafeInteger(operatorId) || operatorId < 1 || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "Invalid partner ID" : parsed.error.message });
    return;
  }
  const [operator] = await db.select().from(rentalOperatorsTable).where(and(
    eq(rentalOperatorsTable.id, operatorId),
    eq(rentalOperatorsTable.isPlatform, false),
  ));
  if (!operator) {
    res.status(404).json({ error: "Partner not found" });
    return;
  }
  if (parsed.data.payoutStatus === "verified" &&
      parsed.data.payoutExpiresAt !== null &&
      parsed.data.payoutExpiresAt <= new Date()) {
    res.status(400).json({ error: "Verified payout status requires a future expiry date or no expiry" });
    return;
  }
  const [updated] = await db.update(rentalOperatorsTable).set({
    payoutStatus: parsed.data.payoutStatus,
    payoutExpiresAt: parsed.data.payoutExpiresAt,
    updatedAt: new Date(),
  }).where(and(
    eq(rentalOperatorsTable.id, operatorId),
    eq(rentalOperatorsTable.isPlatform, false),
  )).returning();
  const session = req.session as unknown as { admin?: { username?: string } };
  await db.insert(rentalAuditLogTable).values({
    adminUser: session.admin?.username ?? "admin",
    action: "partner_payout_status_updated",
    recordType: "rental_operator",
    recordId: operatorId,
    previousValue: { payoutStatus: operator.payoutStatus, payoutExpiresAt: operator.payoutExpiresAt },
    newValue: {
      payoutStatus: updated.payoutStatus,
      payoutExpiresAt: updated.payoutExpiresAt,
      reason: parsed.data.reason,
    },
  });
  res.json({ operator: updated });
});

router.get("/admin/rental/partners", requireAdminAuth, async (_req, res): Promise<void> => {
  const operators = await db.select().from(rentalOperatorsTable)
    .where(eq(rentalOperatorsTable.isPlatform, false)).orderBy(desc(rentalOperatorsTable.updatedAt));
  const items = await Promise.all(operators.map(async (operator) => {
    const docsForRequirements = await db.select().from(rentalOperatorDocumentsTable)
      .where(eq(rentalOperatorDocumentsTable.operatorId, operator.id));
    const documents = docsForRequirements.map((doc) => ({
      id: doc.id,
      documentType: doc.documentType,
      status: doc.status,
      expiresAt: doc.expiresAt,
      createdAt: doc.createdAt,
    }));
    const missing = missingRequirements(operator, docsForRequirements);
    const reviewMissing = missingApprovalRequirements(operator, docsForRequirements);
    return {
      ...operator,
      requirements: { missing, reviewMissing, documents },
      reviewHistory: await db.select({
        id: rentalOperatorVerificationsTable.id,
        verificationType: rentalOperatorVerificationsTable.verificationType,
        status: rentalOperatorVerificationsTable.status,
        reviewedBy: rentalOperatorVerificationsTable.reviewedBy,
        reviewNotes: rentalOperatorVerificationsTable.reviewNotes,
        details: rentalOperatorVerificationsTable.details,
        submittedAt: rentalOperatorVerificationsTable.submittedAt,
        reviewedAt: rentalOperatorVerificationsTable.reviewedAt,
        createdAt: rentalOperatorVerificationsTable.createdAt,
      }).from(rentalOperatorVerificationsTable)
        .where(eq(rentalOperatorVerificationsTable.operatorId, operator.id))
        .orderBy(desc(rentalOperatorVerificationsTable.createdAt)),
    };
  }));
  const alertDeadline = new Date(Date.now() + 30 * 86400_000);
  const alerts = items.filter(({ verificationStatus, requirements, insuranceExpiresAt, permissionExpiresAt, payoutExpiresAt }) =>
    ["submitted", "under_review"].includes(verificationStatus) ||
    (requirements.missing as string[]).length > 0 ||
    (requirements.reviewMissing as string[]).length > 0 ||
    (insuranceExpiresAt && insuranceExpiresAt <= alertDeadline) ||
    (permissionExpiresAt && permissionExpiresAt <= alertDeadline) ||
    (payoutExpiresAt && payoutExpiresAt <= alertDeadline) ||
    requirements.documents.some((doc) => doc.expiresAt && doc.expiresAt <= alertDeadline),
  ).map(({ id, name, verificationStatus, requirements }) => ({
    operatorId: id,
    name,
    verificationStatus,
    missing: requirements.reviewMissing,
    expiringDocuments: requirements.documents.filter((doc) => doc.expiresAt && doc.expiresAt <= alertDeadline)
      .map((doc) => doc.documentType),
  }));
  res.set("Cache-Control", "no-store");
  res.json({ items, alerts });
});

router.post("/admin/rental/partners/:id/review", requireAdminAuth, async (req, res): Promise<void> => {
  const operatorId = Number(req.params.id);
  const parsed = adminReviewSchema.safeParse(req.body);
  if (!Number.isSafeInteger(operatorId) || operatorId < 1 || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "Invalid partner ID" : parsed.error.message });
    return;
  }
  const [operator] = await db.select().from(rentalOperatorsTable).where(and(
    eq(rentalOperatorsTable.id, operatorId),
    eq(rentalOperatorsTable.isPlatform, false),
  ));
  if (!operator) {
    res.status(404).json({ error: "Partner not found" });
    return;
  }
  if (parsed.data.action === "approve" || parsed.data.action === "reactivate") {
    const documents = await db.select().from(rentalOperatorDocumentsTable)
      .where(eq(rentalOperatorDocumentsTable.operatorId, operatorId));
    const missing = missingApprovalRequirements(operator, documents);
    if (missing.length) {
      res.status(400).json({ error: "Partner does not meet approval or reactivation requirements", requirements: missing });
      return;
    }
  }
  const session = req.session as unknown as { admin?: { username?: string } };
  const actor = session.admin?.username ?? "admin";
  const { action, reason } = parsed.data;
  const next = action === "approve" || action === "reactivate"
    ? { status: "active" as const, verificationStatus: "approved" as const }
    : action === "suspend"
      ? { status: "suspended" as const, verificationStatus: operator.verificationStatus }
      : action === "reject"
        ? { status: "pending" as const, verificationStatus: "rejected" as const }
        : { status: "pending" as const, verificationStatus: "needs_information" as const };
  const now = new Date();
  const [updated] = await db.update(rentalOperatorsTable).set({
    ...next,
    ...(parsed.data.payoutStatus !== undefined ? { payoutStatus: parsed.data.payoutStatus } : {}),
    ...(parsed.data.payoutExpiresAt !== undefined ? { payoutExpiresAt: parsed.data.payoutExpiresAt } : {}),
    updatedAt: now,
  })
    .where(eq(rentalOperatorsTable.id, operatorId)).returning();
  await db.insert(rentalOperatorVerificationsTable).values({
    operatorId,
    verificationType: "admin_review",
    status: next.verificationStatus,
    reviewedBy: actor,
    reviewNotes: reason,
    details: { action },
    reviewedAt: now,
  });
  await db.insert(rentalAuditLogTable).values({
    adminUser: actor,
    action: `partner_${action}`,
    recordType: "rental_operator",
    recordId: operatorId,
    previousValue: {
      status: operator.status,
      verificationStatus: operator.verificationStatus,
      payoutStatus: operator.payoutStatus,
      payoutExpiresAt: operator.payoutExpiresAt,
    },
    newValue: {
      status: updated.status,
      verificationStatus: updated.verificationStatus,
      payoutStatus: updated.payoutStatus,
      payoutExpiresAt: updated.payoutExpiresAt,
      reason,
    },
  });
  res.json({ operator: updated });
});

router.post("/admin/rental/partners/:id/vehicles/:vehicleId/moderate", requireAdminAuth, async (req, res): Promise<void> => {
  const operatorId = Number(req.params.id);
  const vehicleId = Number(req.params.vehicleId);
  const parsed = z.object({
    action: z.enum(["approve", "request_changes", "reject"]),
    reason: z.string().trim().min(1).max(5000),
  }).strict().safeParse(req.body);
  if (!Number.isSafeInteger(operatorId) || operatorId < 1 || !Number.isSafeInteger(vehicleId) || vehicleId < 1 || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "Invalid partner or vehicle ID" : parsed.error.message });
    return;
  }
  const [operator] = await db.select().from(rentalOperatorsTable).where(and(
    eq(rentalOperatorsTable.id, operatorId),
    eq(rentalOperatorsTable.isPlatform, false),
  ));
  if (!operator) {
    res.status(404).json({ error: "Partner not found" });
    return;
  }
  const [vehicle] = await db.select().from(rentalVehiclesTable).where(and(
    eq(rentalVehiclesTable.id, vehicleId),
    eq(rentalVehiclesTable.operatorId, operatorId),
    isNull(rentalVehiclesTable.deletedAt),
  ));
  if (!vehicle) {
    res.status(404).json({ error: "Partner vehicle not found" });
    return;
  }
  if (parsed.data.action === "approve") {
    const partnerDocuments = await db.select().from(rentalOperatorDocumentsTable)
      .where(eq(rentalOperatorDocumentsTable.operatorId, operatorId));
    const partnerMissing = missingApprovalRequirements(operator, partnerDocuments);
    if (operator.status !== "active" || operator.verificationStatus !== "approved" || partnerMissing.length) {
      res.status(400).json({
        error: "Only an eligible, approved partner with valid payout and evidence can publish vehicles",
        requirements: partnerMissing,
      });
      return;
    }
    const [pricing] = await db.select().from(rentalVehiclePricingTable)
      .where(eq(rentalVehiclePricingTable.vehicleId, vehicleId));
    const disclosureEntries = Object.entries(vehicle.disclosures ?? {}).filter(([key, value]) =>
      key.trim().length > 0 && hasMeaningfulJsonValue(value),
    );
    const hourEntries = Object.entries(vehicle.hours ?? {}).filter(([key, value]) =>
      key.trim().length > 0 && hasMeaningfulJsonValue(value),
    );
    const locations = vehicle.pickupLocations?.filter((location) => location.trim().length > 0) ?? [];
    const serviceLocation = operator.businessDetails?.serviceLocation;
    const serviceHours = operator.businessDetails?.serviceHours;
    const globalLocation = vehicle.useGlobalPickupSettings &&
      typeof operator.businessDetails?.serviceAddress === "string" &&
      operator.businessDetails.serviceAddress.trim().length > 0 &&
      typeof serviceLocation === "object" && serviceLocation !== null &&
      hasMeaningfulJsonValue(serviceLocation);
    const globalHours = vehicle.useGlobalPickupSettings &&
      typeof serviceHours === "object" && serviceHours !== null &&
      hasMeaningfulJsonValue(serviceHours);
    const pricingErrors: string[] = [];
    if (!pricing || !Number.isFinite(pricing.basePrice) || pricing.basePrice <= 0) {
      pricingErrors.push("positiveBasePrice");
    } else {
      const nonnegativeValues: Array<number | null> = [
        pricing.weekendPrice,
        pricing.holidayPrice,
        pricing.highSeasonPrice,
        pricing.winterSeasonPrice,
        pricing.cleaningFee,
        pricing.deliveryFee,
        pricing.lateReturnFee,
        pricing.extraMileageFee,
        pricing.securityDeposit,
        pricing.airportPickupFee,
        pricing.airportDropoffFee,
      ];
      if (nonnegativeValues.some((value) => value !== null && (!Number.isFinite(value) || value < 0))) {
        pricingErrors.push("nonnegativePricing");
      }
      if (pricing.minDays < 1 || (pricing.maxDays !== null && pricing.maxDays < pricing.minDays)) {
        pricingErrors.push("validRentalDuration");
      }
      if (!Number.isFinite(pricing.weeklyDiscountPct) || pricing.weeklyDiscountPct < 0 || pricing.weeklyDiscountPct > 100 ||
          !Number.isFinite(pricing.monthlyDiscountPct) || pricing.monthlyDiscountPct < 0 || pricing.monthlyDiscountPct > 100) {
        pricingErrors.push("validDiscounts");
      }
      if (!Number.isFinite(pricing.taxRate) || pricing.taxRate < 0 || pricing.taxRate > 1) {
        pricingErrors.push("validTaxRate");
      }
    }
    const vehicleRequirements: string[] = [];
    if (!vehicle.publicTitle.trim() || !vehicle.brand.trim() || !vehicle.model.trim() || vehicle.year < 1900) {
      vehicleRequirements.push("vehicleIdentity");
    }
    if (!disclosureEntries.length) vehicleRequirements.push("disclosures");
    if (!hourEntries.length && !globalHours) vehicleRequirements.push("operatingHours");
    if (!locations.length && !globalLocation) vehicleRequirements.push("pickupLocation");
    vehicleRequirements.push(...pricingErrors);
    if (vehicleRequirements.length) {
      res.status(400).json({
        error: "Vehicle is not ready for public listing",
        requirements: vehicleRequirements,
      });
      return;
    }
  }
  const moderationStatus = parsed.data.action === "approve"
    ? "approved" : parsed.data.action === "reject" ? "rejected" : "changes_requested";
  const status = moderationStatus === "approved" ? "published" : "unpublished";
  const [updated] = await db.update(rentalVehiclesTable).set({
    moderationStatus,
    status,
    updatedAt: new Date(),
  }).where(eq(rentalVehiclesTable.id, vehicleId)).returning();
  const session = req.session as unknown as { admin?: { username?: string } };
  await db.insert(rentalAuditLogTable).values({
    adminUser: session.admin?.username ?? "admin",
    action: `partner_vehicle_${parsed.data.action}`,
    recordType: "rental_vehicle",
    recordId: vehicleId,
    previousValue: { moderationStatus: vehicle.moderationStatus, status: vehicle.status },
    newValue: { moderationStatus, status, reason: parsed.data.reason },
  });
  res.json({ vehicle: updated, reason: parsed.data.reason });
});

export default router;