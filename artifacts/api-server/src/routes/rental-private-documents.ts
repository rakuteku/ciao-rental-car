import { and, eq, isNull } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import {
  db,
  rentalDriverDocumentsTable,
  rentalDriversTable,
  rentalReservationsTable,
  rentalVehiclesTable,
} from "@workspace/db";
import { logger } from "../lib/logger";
import {
  createRentalDocumentToken,
  receiveRentalDocumentUpload,
  rentalDocumentObjectName,
  streamRentalDocument,
  sweepExpiredRentalDocuments,
} from "../lib/rental-private-documents";
import {
  isAllowedRentalDocumentContentType,
  parseRentalPrivateReference,
  rentalMarketplaceEnabled,
  rentalPrivateReference,
} from "../lib/rental-private-document-policy.mjs";
import { requireAdminAuth } from "../middlewares/admin-auth";
import { getOperatorIdentity, requireOperatorAuth } from "../middlewares/operator-auth";

const router: IRouter = Router();
if (rentalMarketplaceEnabled()) {
  const retentionTimer = setInterval(() => {
    void sweepExpiredRentalDocuments().catch((error) =>
      logger.error({ err: error, action: "rental_driver_document_retention_sweep_failed" }),
    );
  }, 60 * 60 * 1000);
  retentionTimer.unref();
  void sweepExpiredRentalDocuments().catch((error) =>
    logger.error({ err: error, action: "rental_driver_document_retention_sweep_failed" }),
  );
}

const uploadBodySchema = z.object({
  docType: z.enum(["drivers_license", "passport", "international_license", "insurance", "credit_card", "other"]),
  contentType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
});

function featureEnabled(res: Response): boolean {
  if (rentalMarketplaceEnabled()) return true;
  res.status(404).json({ error: "Rental marketplace is disabled" });
  return false;
}

function customerIdentity(req: Request): { email: string; bookingId?: number } | null {
  const session = req.session as unknown as Record<string, unknown>;
  const email = typeof session.rentalCustomerEmail === "string"
    ? session.rentalCustomerEmail.trim().toLowerCase()
    : "";
  const bookingId = session.rentalCustomerBookingId;
  if (!email) return null;
  return {
    email,
    ...(typeof bookingId === "number" ? { bookingId } : {}),
  };
}

async function authorizedCustomerReservation(req: Request, reservationId: number) {
  const identity = customerIdentity(req);
  if (!identity || (identity.bookingId !== undefined && identity.bookingId !== reservationId)) return null;
  const [reservation] = await db.select().from(rentalReservationsTable).where(and(
    eq(rentalReservationsTable.id, reservationId),
    isNull(rentalReservationsTable.deletedAt),
  ));
  if (!reservation?.primaryDriverId) return null;
  const [driver] = await db.select().from(rentalDriversTable).where(and(
    eq(rentalDriversTable.id, reservation.primaryDriverId),
    eq(rentalDriversTable.email, identity.email),
  ));
  return driver ? { reservation, driver } : null;
}

async function documentForReservation(reservationId: number, documentId: number) {
  const [document] = await db.select().from(rentalDriverDocumentsTable).where(and(
    eq(rentalDriverDocumentsTable.id, documentId),
    eq(rentalDriverDocumentsTable.reservationId, reservationId),
  ));
  if (!document || !parseRentalPrivateReference(document.fileUrl)) return null;
  return document;
}

async function streamDocument(
  req: Request,
  res: Response,
  reservationId: number,
  documentId: number,
  actor: string,
) {
  const [reservation] = await db.select().from(rentalReservationsTable).where(and(
    eq(rentalReservationsTable.id, reservationId),
    isNull(rentalReservationsTable.deletedAt),
  ));
  const document = await documentForReservation(reservationId, documentId);
  if (!reservation || !document || document.driverId !== reservation.primaryDriverId) {
    logger.warn({ action: "rental_driver_document_access_denied", reservationId, documentId, actor });
    res.status(404).json({ error: "Document not found" });
    return;
  }
  const token = parseRentalPrivateReference(document.fileUrl);
  if (!token) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  try {
    const objectName = rentalDocumentObjectName(reservationId, token);
    logger.info({ action: "rental_driver_document_access", reservationId, documentId, actor });
    await streamRentalDocument(objectName, res);
  } catch (error) {
    logger.error({ err: error, action: "rental_driver_document_stream_failed", reservationId, documentId, actor });
    if (!res.headersSent) res.status(404).json({ error: "Document not found" });
    else res.destroy(error instanceof Error ? error : undefined);
  }
}

router.post("/rental/my-bookings/:id/documents/upload-request", async (req, res): Promise<void> => {
  if (!featureEnabled(res)) return;
  const id = Number(req.params.id);
  const parsed = uploadBodySchema.safeParse(req.body);
  const authorized = Number.isSafeInteger(id) && id > 0
    ? await authorizedCustomerReservation(req, id)
    : null;
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!authorized) {
    res.status(401).json({ error: "Please look up this booking first" });
    return;
  }

  const token = createRentalDocumentToken();
  try {
    await sweepExpiredRentalDocuments();
    const [document] = await db.insert(rentalDriverDocumentsTable).values({
      operatorId: authorized.reservation.operatorId,
      driverId: authorized.driver.id,
      reservationId: id,
      docType: parsed.data.docType,
      fileUrl: rentalPrivateReference(token),
      status: "pending",
    }).returning();
    res.status(201).json({
      documentId: document.id,
      uploadPath: `/api/rental/my-bookings/${id}/documents/${document.id}/content`,
      method: "PUT",
      contentType: parsed.data.contentType,
      maxBytes: 10 * 1024 * 1024,
    });
  } catch (error) {
    logger.error({ err: error, action: "rental_driver_document_upload_request_failed", reservationId: id });
    res.status(503).json({ error: "Private document storage is unavailable" });
  }
});

// Shadow the legacy fileUrl submission handler without editing that route: callers
// must use the private upload flow, and arbitrary public URLs are never persisted.
router.post("/rental/my-bookings/:id/documents", (_req, res, next): void => {
  if (!rentalMarketplaceEnabled()) return next();
  res.status(410).json({ error: "Public document URLs are not accepted; use the private document upload flow" });
});

router.put("/rental/my-bookings/:id/documents/:documentId/content", async (req, res): Promise<void> => {
  if (!featureEnabled(res)) return;
  const reservationId = Number(req.params.id);
  const documentId = Number(req.params.documentId);
  if (!Number.isSafeInteger(reservationId) || reservationId <= 0 || !Number.isSafeInteger(documentId) || documentId <= 0) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  const authorized = await authorizedCustomerReservation(req, reservationId);
  if (!authorized) {
    res.status(401).json({ error: "Please look up this booking first" });
    return;
  }
  const document = await documentForReservation(reservationId, documentId);
  if (!document || document.driverId !== authorized.driver.id) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  if (document.status !== "pending") {
    res.status(409).json({ error: "This document has already been uploaded" });
    return;
  }
  const contentType = req.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  const contentLength = Number(req.get("content-length") ?? 0);
  if (!isAllowedRentalDocumentContentType(contentType)) {
    res.status(415).json({ error: "Only PDF, JPEG, and PNG driver documents are accepted" });
    return;
  }
  if (contentLength > 10 * 1024 * 1024) {
    res.status(413).json({ error: "Rental document exceeds the 10 MB limit" });
    return;
  }
  const token = parseRentalPrivateReference(document.fileUrl);
  if (!token) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  try {
    await receiveRentalDocumentUpload(rentalDocumentObjectName(reservationId, token), req, contentType);
    await db.update(rentalDriverDocumentsTable)
      .set({ status: "submitted", updatedAt: new Date() })
      .where(eq(rentalDriverDocumentsTable.id, documentId));
    logger.info({ action: "rental_driver_document_uploaded", reservationId, documentId, actor: "customer" });
    res.status(204).end();
  } catch (error) {
    logger.warn({ err: error, action: "rental_driver_document_upload_failed", reservationId, documentId });
    const message = error instanceof Error ? error.message : "";
    if (message.includes("exceeds the 10 MB limit")) {
      res.status(413).json({ error: "Rental document exceeds the 10 MB limit" });
      return;
    }
    if (message.includes("Only PDF") || message.includes("upload is empty")) {
      res.status(400).json({ error: message });
      return;
    }
    res.status(503).json({ error: "Private document storage is unavailable" });
  }
});

router.get("/rental/my-bookings/:id/documents/:documentId/content", async (req, res): Promise<void> => {
  if (!featureEnabled(res)) return;
  const reservationId = Number(req.params.id);
  const documentId = Number(req.params.documentId);
  if (!Number.isSafeInteger(reservationId) || !Number.isSafeInteger(documentId)) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  const authorized = await authorizedCustomerReservation(req, reservationId);
  if (!authorized) {
    res.status(401).json({ error: "Please look up this booking first" });
    return;
  }
  const document = await documentForReservation(reservationId, documentId);
  if (!document || document.driverId !== authorized.driver.id) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  await streamDocument(req, res, reservationId, documentId, "customer");
});

router.get(
  "/operator/rental/reservations/:id/driver-documents/:documentId/content",
  requireOperatorAuth,
  async (req, res, next): Promise<void> => {
    if (!featureEnabled(res)) return;
    const reservationId = Number(req.params.id);
    const documentId = Number(req.params.documentId);
    if (!Number.isSafeInteger(reservationId) || reservationId <= 0 || !Number.isSafeInteger(documentId) || documentId <= 0) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    try {
      const identity = getOperatorIdentity(req);
      const [reservation] = await db.select().from(rentalReservationsTable).where(and(
        eq(rentalReservationsTable.id, reservationId),
        isNull(rentalReservationsTable.deletedAt),
      ));
      const [vehicle] = reservation
        ? await db.select().from(rentalVehiclesTable).where(eq(rentalVehiclesTable.id, reservation.vehicleId))
        : [];
      if (!identity || !reservation || !vehicle || vehicle.operatorId !== identity.operatorId || reservation.operatorId !== identity.operatorId) {
        logger.warn({ action: "rental_driver_document_access_denied", reservationId, documentId, actor: "operator_staff" });
        res.status(404).json({ error: "Document not found" });
        return;
      }
      await streamDocument(req, res, reservationId, documentId, `operator:${identity.staffId}`);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/admin/rental/reservations/:id/driver-documents/:documentId/content",
  requireAdminAuth,
  async (req, res): Promise<void> => {
    if (!featureEnabled(res)) return;
    const reservationId = Number(req.params.id);
    const documentId = Number(req.params.documentId);
    if (!Number.isSafeInteger(reservationId) || reservationId <= 0 || !Number.isSafeInteger(documentId) || documentId <= 0) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    await streamDocument(req, res, reservationId, documentId, "admin");
  },
);

export default router;