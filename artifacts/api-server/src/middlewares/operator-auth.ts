import type { RequestHandler } from "express";
import { and, eq } from "drizzle-orm";
import { db, rentalOperatorsTable, rentalOperatorStaffTable } from "@workspace/db";
import { isMarketplaceEnabled } from "../lib/rental-request-policy.mjs";

export type OperatorStaffRole = "owner" | "manager" | "counter" | "operations";

export interface OperatorIdentity {
  operatorId: number;
  staffId: number;
  email: string;
  role: OperatorStaffRole;
}

type OperatorRequest = Express.Request & { operatorIdentity?: OperatorIdentity };

export function isRentalMarketplaceEnabled(): boolean {
  return isMarketplaceEnabled(process.env.RENTAL_MARKETPLACE_ENABLED);
}

export function getOperatorIdentity(req: Express.Request): OperatorIdentity | undefined {
  return (req as OperatorRequest).operatorIdentity;
}

/** Marketplace request actions share the established partner session namespace. */
export function getPartnerSessionIdentity(req: Express.Request): OperatorIdentity | undefined {
  const session = req.session as unknown as Record<string, unknown>;
  const identity = session.partner as OperatorIdentity | undefined;
  if (!identity || !Number.isInteger(identity.operatorId) || !Number.isInteger(identity.staffId)) return undefined;
  return identity;
}

function isApprovedOperator(operator: unknown): boolean {
  if (!operator || typeof operator !== "object") return false;
  const values = operator as Record<string, unknown>;
  return values.verificationStatus === "approved" && values.status === "active";
}

export const requireOperatorAuth: RequestHandler = async (req, res, next) => {
  if (!isRentalMarketplaceEnabled()) {
    res.status(404).json({ error: "Rental marketplace is disabled" });
    return;
  }

  const session = req.session as unknown as Record<string, unknown>;
  const identity = session.operator as OperatorIdentity | undefined;
  if (
    !identity ||
    !Number.isInteger(identity.operatorId) ||
    !Number.isInteger(identity.staffId)
  ) {
    res.status(401).json({ error: "Operator authentication required" });
    return;
  }

  const [staff] = await db
    .select()
    .from(rentalOperatorStaffTable)
    .where(
      and(
        eq(rentalOperatorStaffTable.id, identity.staffId),
        eq(rentalOperatorStaffTable.operatorId, identity.operatorId),
        eq(rentalOperatorStaffTable.active, true),
      ),
    );
  if (!staff) {
    delete session.operator;
    res.status(401).json({ error: "Operator staff account is inactive" });
    return;
  }

  const [operator] = await db
    .select()
    .from(rentalOperatorsTable)
    .where(eq(rentalOperatorsTable.id, identity.operatorId));
  if (!isApprovedOperator(operator)) {
    delete session.operator;
    res.status(403).json({ error: "Operator is not approved" });
    return;
  }

  const role = staff.role as OperatorStaffRole;
  if (!["owner", "manager", "counter", "operations"].includes(role)) {
    delete session.operator;
    res.status(403).json({ error: "Operator staff role is not permitted" });
    return;
  }

  (req as OperatorRequest).operatorIdentity = {
    operatorId: staff.operatorId,
    staffId: staff.id,
    email: staff.email,
    role,
  };
  next();
};