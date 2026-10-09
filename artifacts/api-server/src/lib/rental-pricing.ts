import { db } from "@workspace/db";
import {
  rentalVehiclePricingTable,
  rentalVehiclesTable,
  rentalSeasonalPricingRulesTable,
  rentalAddonsTable,
  rentalSettingsTable,
} from "@workspace/db";
import { eq, and, isNull, or, inArray } from "drizzle-orm";
import { isMarketplaceEnabled, marketplaceBillablePeriodCount, matchesMarketplaceSeason, tokyoRentalDate } from "./rental-request-policy.mjs";
import { calculateTimeBasedRate, validateTimeBasedRates, type TimeBasedRates } from "./time-based-rate";
import { addonCategory, validateProtectionSelection } from "./rental-addon-policy.mjs";

export interface PricingInput {
  vehicleId: number;
  pickupAt: Date;
  returnAt: Date;
  addons?: Array<{ addonId: number; qty: number }>;
  pickupLocation?: string;
  returnLocation?: string;
}

export interface DayRate {
  date: string;
  baseRate: number;
  appliedRate: number;
  ruleApplied?: string;
}

export interface AddonLineItem {
  addonId: number;
  name: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
  pricingType: string;
}

export interface PriceBreakdown {
  days: number;
  dayRates: DayRate[];
  subtotal: number;
  deliveryFee: number;
  airportPickupFee: number;
  airportDropoffFee: number;
  pickupLocationFee: number;
  returnLocationFee: number;
  oneWayFee: number;
  addons: AddonLineItem[];
  addonsTotal: number;
  discount: number;
  tax: number;
  securityDeposit: number;
  finalTotal: number;
  taxIncluded: boolean;
  currency: string;
  durationMinutes: number;
  billedHours: number;
  ratePlanName: string;
  rateTier: string;
  baseRentalAmount: number;
  extensionAmount: number;
  fullAdditionalDays: number;
  additionalHours: number;
  fullAdditionalDaysAmount: number;
  additionalHoursAmount: number;
}

const AIRPORT_LOCATION = "New Chitose Airport";

function getDaysBetween(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const current = new Date(start);
  current.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);
  while (current < endDay) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  if (days.length === 0) days.push(new Date(start));
  return days;
}

function isWeekend(date: Date): boolean {
  const day = isMarketplaceEnabled(process.env.RENTAL_MARKETPLACE_ENABLED)
    ? new Date(`${formatDate(date)}T00:00:00Z`).getUTCDay()
    : date.getDay();
  return day === 0 || day === 6;
}

function formatDate(date: Date): string {
  if (isMarketplaceEnabled(process.env.RENTAL_MARKETPLACE_ENABLED)) {
    return tokyoRentalDate(date);
  }
  return date.toISOString().split("T")[0];
}

function getMarketplaceBillablePeriods(start: Date, end: Date, periodHours: number): Date[] {
  const periodMs = Math.max(1, periodHours) * 60 * 60 * 1000;
  const count = marketplaceBillablePeriodCount(start, end, periodHours);
  return Array.from({ length: count }, (_, index) => new Date(start.getTime() + index * periodMs));
}

function parseDateStr(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00Z");
}

export async function calculatePrice(
  input: PricingInput,
  client: any = db,
): Promise<PriceBreakdown> {
  const [pricing] = await client
    .select()
    .from(rentalVehiclePricingTable)
    .where(eq(rentalVehiclePricingTable.vehicleId, input.vehicleId));
  const [vehicle] = await client
    .select({ vehicleClass: rentalVehiclesTable.vehicleClass, operatorId: rentalVehiclesTable.operatorId })
    .from(rentalVehiclesTable)
    .where(eq(rentalVehiclesTable.id, input.vehicleId));
  if (isMarketplaceEnabled(process.env.RENTAL_MARKETPLACE_ENABLED) && (!vehicle || vehicle.operatorId == null)) {
    throw Object.assign(new Error("Vehicle unavailable"), { status: 404 });
  }

  const seasonalRules = await client
    .select()
    .from(rentalSeasonalPricingRulesTable)
    .where(
      and(
        eq(rentalSeasonalPricingRulesTable.isActive, true),
        or(
          eq(rentalSeasonalPricingRulesTable.appliesTo, "all"),
          and(
            eq(rentalSeasonalPricingRulesTable.appliesTo, "vehicle"),
            eq(rentalSeasonalPricingRulesTable.vehicleId, input.vehicleId),
          ),
          and(
            eq(rentalSeasonalPricingRulesTable.appliesTo, "class"),
            eq(rentalSeasonalPricingRulesTable.vehicleClass, vehicle?.vehicleClass ?? ""),
          ),
        ),
      ),
    );

  const pickupDate = formatDate(input.pickupAt);
  const returnDate = formatDate(input.returnAt);
  const sortedRules = [...seasonalRules].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  const selectedSeason = sortedRules.find((rule) => {
    if (!rule.startDate || !rule.endDate) return false;
    if (rule.specialPeakOverlap) return pickupDate <= rule.endDate && returnDate >= rule.startDate;
    return pickupDate >= rule.startDate && pickupDate <= rule.endDate;
  });
  const legacyBase = Math.round(pricing?.basePrice ?? 0);
  const rates: TimeBasedRates = {
    rate6Hours: selectedSeason?.rate6Hours ?? pricing?.rate6Hours,
    rate12Hours: (selectedSeason?.rate12Hours ?? pricing?.rate12Hours) || legacyBase,
    rate24Hours: (selectedSeason?.rate24Hours ?? pricing?.rate24Hours) || legacyBase,
    additional24Hours: (selectedSeason?.additional24Hours ?? pricing?.additional24Hours) || legacyBase,
    additionalHour: (selectedSeason?.additionalHour ?? pricing?.additionalHour) || Math.ceil(legacyBase / 24),
    gracePeriodMinutes: pricing?.gracePeriodMinutes ?? 0,
    cheapestRateEnabled: pricing?.cheapestRateEnabled ?? true,
    additionalDayCapEnabled: pricing?.additionalDayCapEnabled ?? true,
  };
  const rateErrors = validateTimeBasedRates(rates);
  if (rateErrors.length) throw Object.assign(new Error(rateErrors.join(" ")), { status: 400 });
  if (pricing?.rateStatus && pricing.rateStatus !== "active") throw Object.assign(new Error("This vehicle does not have an active rate plan"), { status: 400 });
  if (pricing?.effectiveStartDate && pickupDate < pricing.effectiveStartDate) throw Object.assign(new Error("The rate plan is not active for the pickup date"), { status: 400 });
  if (pricing?.effectiveEndDate && pickupDate > pricing.effectiveEndDate) throw Object.assign(new Error("The rate plan has expired"), { status: 400 });
  const timedRate = calculateTimeBasedRate(input.pickupAt, input.returnAt, rates);
  const basePrice = rates.rate24Hours;
  const numDays = Math.max(1, Math.ceil(timedRate.durationMinutes / (24 * 60)));
  if (isMarketplaceEnabled(process.env.RENTAL_MARKETPLACE_ENABLED) &&
      (numDays < (pricing?.minDays ?? 1) ||
       (pricing?.maxDays != null && numDays > pricing.maxDays))) {
    throw Object.assign(new Error("Rental duration is outside this operator's configured billable period limits"), { status: 400 });
  }

  const dayRates: DayRate[] = [{ date: pickupDate, baseRate: basePrice, appliedRate: timedRate.total, ruleApplied: selectedSeason?.name }];
  let subtotal = timedRate.total;

  let discount = 0;
  if (numDays >= 30 && pricing?.monthlyDiscountPct) {
    discount = subtotal * (pricing.monthlyDiscountPct / 100);
  } else if (numDays >= 7 && pricing?.weeklyDiscountPct) {
    discount = subtotal * (pricing.weeklyDiscountPct / 100);
  }

  const settingsRows = await client.select().from(rentalSettingsTable);
  const settings = Object.fromEntries(settingsRows.map((row: { key: string; value: string }) => {
    try { return [row.key, JSON.parse(row.value)]; } catch { return [row.key, row.value]; }
  }));
  const locations = Array.isArray(settings.bookingLocations) ? settings.bookingLocations as Array<{ value: string; pickupFee?: number; returnFee?: number }> : [];
  const oneWayFees = Array.isArray(settings.oneWayFees) ? settings.oneWayFees as Array<{ pickupLocation: string; returnLocation: string; fee: number; active?: boolean }> : [];
  const override = oneWayFees.find((fee) => fee.active !== false && fee.pickupLocation === input.pickupLocation && fee.returnLocation === input.returnLocation);
  const pickupLocationFee = override ? 0 : Math.max(0, locations.find((location) => location.value === input.pickupLocation)?.pickupFee ?? 0);
  const returnLocationFee = override ? 0 : Math.max(0, locations.find((location) => location.value === input.returnLocation)?.returnFee ?? 0);
  const oneWayFee = override ? Math.max(0, override.fee) : 0;
  const airportPickupFee = locations.length === 0 && input.pickupLocation === AIRPORT_LOCATION ? (pricing?.airportPickupFee ?? 0) : 0;
  const airportDropoffFee = locations.length === 0 && input.returnLocation === AIRPORT_LOCATION ? (pricing?.airportDropoffFee ?? 0) : 0;
  const deliveryFee = 0;

  const addonLineItems: AddonLineItem[] = [];
  if (input.addons && input.addons.length > 0) {
    const addonIds = input.addons.map((a) => a.addonId);
    const addonRecords: Array<typeof rentalAddonsTable.$inferSelect> = await client
      .select()
      .from(rentalAddonsTable)
      .where(
        and(
          inArray(rentalAddonsTable.id, addonIds),
          eq(rentalAddonsTable.published, true),
          ...(isMarketplaceEnabled(process.env.RENTAL_MARKETPLACE_ENABLED) && vehicle?.operatorId != null
            ? [eq(rentalAddonsTable.operatorId, vehicle.operatorId)]
            : []),
        ),
      );

    const addonMap = new Map(addonRecords.map((a) => [a.id, a]));
    validateProtectionSelection(input.addons.filter(a => a.qty > 0).map(a => addonMap.get(a.addonId)).filter((a): a is typeof rentalAddonsTable.$inferSelect => Boolean(a)));

    for (const req of input.addons) {
      const addon = addonMap.get(req.addonId);
      if (addon && addonCategory(addon) === "winter_tires") {
        throw Object.assign(new Error("Winter tires are included and cannot be purchased as an extra"), { status: 400 });
      }
      if (!addon) {
        if (isMarketplaceEnabled(process.env.RENTAL_MARKETPLACE_ENABLED)) {
          throw Object.assign(new Error("Add-on not available for this vehicle"), { status: 400 });
        }
        continue;
      }

      let unitPrice = 0;
      const pricingType = String(addon.pricingType);
      if (pricingType === "flat" || pricingType === "per_rental" || pricingType === "per_handover") {
        unitPrice = addon.flatFee;
      } else if (pricingType === "per_day" || pricingType === "per_started_24_hours") {
        unitPrice = addon.perDayFee * numDays;
      } else if (pricingType === "per_unit") {
        unitPrice = addon.perUnitFee;
      } else if (pricingType === "included") {
        unitPrice = 0;
      }

      const qty = addonCategory(addon) === "insurance" ? Math.min(req.qty, 1) : pricingType === "per_day" || pricingType === "per_started_24_hours" ? Math.min(req.qty, addon.maxQty) : Math.min(req.qty, 1);
      const totalPrice = unitPrice * qty;

      addonLineItems.push({
        addonId: addon.id,
        name: addon.name,
        qty,
        unitPrice,
        totalPrice,
        pricingType,
      });
    }
  }

  const addonsTotal = addonLineItems.reduce((sum, a) => sum + a.totalPrice, 0);

  const securityDeposit = pricing?.securityDeposit ?? 0;
  const taxRate = pricing?.taxRate ?? 0;
  const taxIncluded = pricing?.taxIncluded ?? true;

  const preTaxTotal = subtotal - discount + airportPickupFee + airportDropoffFee + pickupLocationFee + returnLocationFee + oneWayFee + deliveryFee + addonsTotal;
  const tax = taxIncluded ? 0 : preTaxTotal * (taxRate / 100);
  const finalTotal = preTaxTotal + tax;

  return {
    days: numDays,
    dayRates,
    subtotal,
    deliveryFee,
    airportPickupFee,
    airportDropoffFee,
    pickupLocationFee,
    returnLocationFee,
    oneWayFee,
    addons: addonLineItems,
    addonsTotal,
    discount,
    tax,
    securityDeposit,
    finalTotal,
    taxIncluded,
    currency: pricing?.currency ?? "JPY",
    durationMinutes: timedRate.durationMinutes,
    billedHours: timedRate.billedHours,
    ratePlanName: selectedSeason?.name ?? pricing?.ratePlanName ?? "Standard rate",
    rateTier: timedRate.tier,
    baseRentalAmount: timedRate.baseAmount,
    extensionAmount: timedRate.extensionAmount,
    fullAdditionalDays: timedRate.fullAdditionalDays,
    additionalHours: timedRate.additionalHours,
    fullAdditionalDaysAmount: timedRate.fullAdditionalDaysAmount,
    additionalHoursAmount: timedRate.additionalHoursAmount,
  };
}
