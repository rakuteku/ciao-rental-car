import { Storage } from "@google-cloud/storage";
import { randomUUID } from "node:crypto";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  isAllowedRentalDocumentContentType,
  parseRentalPrivateReference,
  rentalPrivateReference,
} from "./rental-private-document-policy.mjs";

const SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const OBJECT_NAMESPACE = "rental-driver-documents";
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export const rentalDocumentStorage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

let lastRetentionSweep = 0;

function storageLocation(): { bucketName: string; privateRoot: string } {
  const bucketName = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID?.trim();
  const privateDir = process.env.PRIVATE_OBJECT_DIR?.trim().replace(/^\/+|\/+$/g, "");
  if (!bucketName || !privateDir) {
    throw new Error("Rental private document storage is not configured (DEFAULT_OBJECT_STORAGE_BUCKET_ID and PRIVATE_OBJECT_DIR are required)");
  }
  const [privateBucket, ...directory] = privateDir.split("/");
  if (privateBucket !== bucketName || directory.length === 0) {
    throw new Error("PRIVATE_OBJECT_DIR must identify a directory inside DEFAULT_OBJECT_STORAGE_BUCKET_ID");
  }
  return {
    bucketName,
    privateRoot: `${directory.join("/")}/${OBJECT_NAMESPACE}`,
  };
}

export function rentalDocumentObjectName(reservationId: number, token: string): string {
  if (!Number.isSafeInteger(reservationId) || reservationId <= 0 || !parseRentalPrivateReference(rentalPrivateReference(token))) {
    throw new Error("Invalid rental private document reference");
  }
  const { privateRoot } = storageLocation();
  return `${privateRoot}/${reservationId}/${token}`;
}

export async function sweepExpiredRentalDocuments(): Promise<void> {
  const now = Date.now();
  if (now - lastRetentionSweep < 60 * 60 * 1000) return;
  const rawDays = Number.parseInt(process.env.RENTAL_DRIVER_DOCUMENT_RETENTION_DAYS ?? "365", 10);
  const retentionDays = Number.isFinite(rawDays) && rawDays >= 1 && rawDays <= 3650 ? rawDays : 365;
  const { bucketName, privateRoot } = storageLocation();
  const bucket = rentalDocumentStorage.bucket(bucketName);
  const [files] = await bucket.getFiles({ prefix: `${privateRoot}/` });
  const expiresBefore = now - retentionDays * 24 * 60 * 60 * 1000;
  await Promise.all(files.map(async (file) => {
    const [metadata] = await file.getMetadata();
    const createdAt = metadata.timeCreated ? Date.parse(metadata.timeCreated) : NaN;
    if (Number.isFinite(createdAt) && createdAt < expiresBefore) {
      await file.delete({ ignoreNotFound: true });
    }
  }));
  lastRetentionSweep = now;
}

export async function receiveRentalDocumentUpload(
  objectName: string,
  input: NodeJS.ReadableStream,
  contentType: string,
): Promise<void> {
  if (!isAllowedRentalDocumentContentType(contentType)) {
    throw new Error("Only PDF, JPEG, and PNG driver documents are accepted");
  }
  const file = rentalDocumentStorage.bucket(storageLocation().bucketName).file(objectName);
  let totalBytes = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      totalBytes += chunk.length;
      if (totalBytes > MAX_DOCUMENT_BYTES) {
        callback(new Error("Rental document exceeds the 10 MB limit"));
        return;
      }
      callback(null, chunk);
    },
  });
  const destination = file.createWriteStream({
    resumable: false,
    validation: "crc32c",
    metadata: { contentType, cacheControl: "private, no-store" },
  });
  try {
    await pipeline(input, limiter, destination);
    if (totalBytes === 0) throw new Error("Rental document upload is empty");
  } catch (error) {
    await file.delete({ ignoreNotFound: true }).catch(() => undefined);
    throw error;
  }
}

export async function streamRentalDocument(objectName: string, response: NodeJS.WritableStream): Promise<void> {
  const file = rentalDocumentStorage.bucket(storageLocation().bucketName).file(objectName);
  const [metadata] = await file.getMetadata();
  const contentType = isAllowedRentalDocumentContentType(metadata.contentType)
    ? metadata.contentType
    : "application/octet-stream";
  const headers = response as NodeJS.WritableStream & { setHeader?: (name: string, value: string) => void };
  headers.setHeader?.("Content-Type", contentType);
  headers.setHeader?.("Content-Disposition", `attachment; filename="rental-driver-document"`);
  headers.setHeader?.("Cache-Control", "private, no-store, max-age=0");
  headers.setHeader?.("X-Content-Type-Options", "nosniff");
  if (metadata.size) headers.setHeader?.("Content-Length", String(metadata.size));
  await pipeline(file.createReadStream(), response);
}

export function createRentalDocumentToken(): string {
  return randomUUID();
}