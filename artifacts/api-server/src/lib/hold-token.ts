import { createHash, randomBytes } from "node:crypto";
import { z } from "zod/v4";

export const holdTokenSchema = z.string().regex(/^[a-f0-9]{64}$/);

export function createHoldToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashHoldToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
