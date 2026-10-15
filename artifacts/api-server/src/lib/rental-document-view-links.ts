import { createHmac, timingSafeEqual } from "node:crypto";

export type RentalDocumentViewScope = "admin" | "operator" | "partner";
export const DOCUMENT_VIEW_LIFETIME_MS = 2 * 60 * 1000;

function signature(scope: RentalDocumentViewScope, reservationId: number, documentId: number, expires: number): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for document view links");
  return createHmac("sha256", secret).update(`${scope}:${reservationId}:${documentId}:${expires}`).digest("hex");
}

export function createDocumentViewLink(scope: RentalDocumentViewScope, reservationId: number, documentId: number, path: string) {
  const expires = Date.now() + DOCUMENT_VIEW_LIFETIME_MS;
  return { url: `${path}?expires=${expires}&signature=${signature(scope, reservationId, documentId, expires)}`, expiresAt: new Date(expires).toISOString() };
}

export function validDocumentViewLink(scope: RentalDocumentViewScope, reservationId: number, documentId: number, expiresValue: unknown, signatureValue: unknown): boolean {
  const expires = Number(expiresValue);
  if (!Number.isSafeInteger(expires) || expires <= Date.now() || expires > Date.now() + DOCUMENT_VIEW_LIFETIME_MS ||
      typeof signatureValue !== "string" || !/^[a-f0-9]{64}$/.test(signatureValue)) return false;
  const expected = signature(scope, reservationId, documentId, expires);
  return timingSafeEqual(Buffer.from(signatureValue, "hex"), Buffer.from(expected, "hex"));
}
