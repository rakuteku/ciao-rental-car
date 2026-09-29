import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  db, rentalOperatorDocumentsTable, rentalOperatorsTable, rentalSettingsTable,
  rentalVehiclesTable, type RentalVehicle,
} from "@workspace/db";

export const marketplacePolicyKeys = [
  "marketplaceCommissionPercent", "marketplacePayoutTerms",
  "marketplaceCancellationPolicy", "marketplaceDepositPolicy",
  "marketplaceResponsePeriodHours", "marketplaceCoverageTerms",
] as const;

export type MarketplacePolicyKey = typeof marketplacePolicyKeys[number];

export async function marketplacePolicy() {
  const rows = await db.select().from(rentalSettingsTable)
    .where(inArray(rentalSettingsTable.key, [...marketplacePolicyKeys]));
  const values: Record<string, unknown> = {};
  for (const row of rows) {
    try { values[row.key] = JSON.parse(row.value); } catch { values[row.key] = null; }
  }
  const missing = marketplacePolicyKeys.filter((key) =>
    values[key] === undefined || values[key] === null || values[key] === "" ||
    (typeof values[key] === "string" && !values[key].trim()));
  return { values, missing };
}

/** Flag-off retains the existing public fleet without consulting marketplace decisions. */
export async function eligibleMarketplaceVehicles(): Promise<Map<number, { name: string }>> {
  const result = new Map<number, { name: string }>();
  if (process.env.RENTAL_MARKETPLACE_ENABLED !== "true") {
    // A disabled marketplace withdraws partner listings, even if they were
    // published while the feature was on. Preserve only CIAO's platform fleet.
    const [platform] = await db.select().from(rentalOperatorsTable)
      .where(eq(rentalOperatorsTable.isPlatform, true));
    if (!platform) return result;
    const vehicles = await db.select().from(rentalVehiclesTable).where(and(
      eq(rentalVehiclesTable.operatorId, platform.id),
      eq(rentalVehiclesTable.status, "published"),
      isNull(rentalVehiclesTable.deletedAt),
    ));
    for (const vehicle of vehicles) result.set(vehicle.id, { name: platform.name });
    return result;
  }
  const [policy, operators, vehicles] = await Promise.all([
    marketplacePolicy(),
    db.select().from(rentalOperatorsTable).where(and(
      eq(rentalOperatorsTable.status, "active"),
      eq(rentalOperatorsTable.verificationStatus, "approved"),
    )),
    db.select().from(rentalVehiclesTable).where(and(
      isNull(rentalVehiclesTable.deletedAt), eq(rentalVehiclesTable.status, "published"),
    )),
  ]);
  const now = new Date();
  for (const operator of operators) {
    if (!operator.isPlatform) {
      if (policy.missing.length ||
        !operator.insuranceExpiresAt || operator.insuranceExpiresAt <= now ||
        !operator.permissionExpiresAt || operator.permissionExpiresAt <= now ||
        operator.payoutStatus !== "verified" ||
        (operator.payoutExpiresAt && operator.payoutExpiresAt <= now)) continue;
      const docs = await db.select().from(rentalOperatorDocumentsTable)
        .where(eq(rentalOperatorDocumentsTable.operatorId, operator.id));
      if (!["insurance", "business_license", "vehicle_permission"].every((type) =>
        docs.some((doc) => doc.documentType === type && doc.status === "accepted" &&
          doc.metadata?.uploadComplete === true && (!doc.expiresAt || doc.expiresAt > now)))) continue;
    }
    for (const vehicle of vehicles) {
      if (vehicle.operatorId === operator.id && vehicle.operationalStatus === "available" &&
        (operator.isPlatform || (vehicle.moderationStatus === "approved" &&
          Boolean(vehicle.disclosures && Object.keys(vehicle.disclosures).length) &&
          Boolean(vehicle.pickupLocations?.length && vehicle.returnLocations?.length)))) {
        result.set(vehicle.id, { name: operator.name });
      }
    }
  }
  return result;
}

export function isMarketplaceVehicleEligible(vehicle: RentalVehicle, eligible: Map<number, { name: string }>) {
  return eligible.has(vehicle.id);
}