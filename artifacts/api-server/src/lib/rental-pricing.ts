import { db } from "@workspace/db";
import {
  rentalVehiclePricingTable,
  rentalVehiclesTable,
  rentalSeasonalPricingRulesTable,
  rentalAddonsTable,
} from "@workspace/db";
import { eq, and, isNull, or, inArray } from "drizzle-orm";

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
  addons: AddonLineItem[];
  addonsTotal: number;
  discount: number;
  tax: number;
  securityDeposit: number;
  finalTotal: number;
  taxIncluded: boolean;
  currency: string;
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
  const day = date.getDay();
  return day === 0 || day === 6;
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function parseDateStr(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00Z");
}

export async function calculatePrice(input: PricingInput): Promise<PriceBreakdown> {
  const [pricing] = await db
    .select()
    .from(rentalVehiclePricingTable)
    .where(eq(rentalVehiclePricingTable.vehicleId, input.vehicleId));
  const [vehicle] = await db
    .select({ vehicleClass: rentalVehiclesTable.vehicleClass })
    .from(rentalVehiclesTable)
    .where(eq(rentalVehiclesTable.id, input.vehicleId));

  const seasonalRules = await db
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

  const basePrice = pricing?.basePrice ?? 0;
  const days = getDaysBetween(input.pickupAt, input.returnAt);
  const numDays = Math.max(1, days.length);

  const dayRates: DayRate[] = days.map((day) => {
    const dateStr = formatDate(day);
    let appliedRate = basePrice;
    let ruleApplied: string | undefined;

    if (isWeekend(day) && pricing?.weekendPrice != null) {
      appliedRate = pricing.weekendPrice;
      ruleApplied = "weekend";
    }

    const sortedRules = [...seasonalRules].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    for (const rule of sortedRules) {
      let matches = false;

      if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
        const dayName = day.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }).toLowerCase();
        if (rule.daysOfWeek.includes(dayName) || rule.daysOfWeek.includes(String(day.getDay()))) {
          matches = true;
        }
      }

      if (rule.startDate && rule.endDate) {
        const ruleStart = parseDateStr(rule.startDate);
        const ruleEnd = parseDateStr(rule.endDate);
        if (day >= ruleStart && day <= ruleEnd) {
          matches = true;
        }
      }

      if (matches) {
        if (rule.ruleType === "fixed" && rule.fixedPrice != null) {
          appliedRate = rule.fixedPrice;
          ruleApplied = rule.name;
        } else if (rule.ruleType === "multiplier" && rule.multiplier != null) {
          appliedRate = basePrice * rule.multiplier;
          ruleApplied = rule.name;
        }
        break;
      }
    }

    return { date: dateStr, baseRate: basePrice, appliedRate, ruleApplied };
  });

  let subtotal = dayRates.reduce((sum, d) => sum + d.appliedRate, 0);

  let discount = 0;
  if (numDays >= 30 && pricing?.monthlyDiscountPct) {
    discount = subtotal * (pricing.monthlyDiscountPct / 100);
  } else if (numDays >= 7 && pricing?.weeklyDiscountPct) {
    discount = subtotal * (pricing.weeklyDiscountPct / 100);
  }

  const airportPickupFee =
    input.pickupLocation === AIRPORT_LOCATION ? (pricing?.airportPickupFee ?? 0) : 0;
  const airportDropoffFee =
    input.returnLocation === AIRPORT_LOCATION ? (pricing?.airportDropoffFee ?? 0) : 0;
  const deliveryFee = pricing?.deliveryFee ?? 0;

  const addonLineItems: AddonLineItem[] = [];
  if (input.addons && input.addons.length > 0) {
    const addonIds = input.addons.map((a) => a.addonId);
    const addonRecords = await db
      .select()
      .from(rentalAddonsTable)
      .where(
        and(
          inArray(rentalAddonsTable.id, addonIds),
          eq(rentalAddonsTable.published, true),
        ),
      );

    const addonMap = new Map(addonRecords.map((a) => [a.id, a]));

    for (const req of input.addons) {
      const addon = addonMap.get(req.addonId);
      if (!addon) continue;

      let unitPrice = 0;
      if (addon.pricingType === "flat") {
        unitPrice = addon.flatFee;
      } else if (addon.pricingType === "per_day") {
        unitPrice = addon.perDayFee * numDays;
      } else if (addon.pricingType === "per_unit") {
        unitPrice = addon.perUnitFee;
      }

      const qty = Math.min(req.qty, addon.maxQty);
      const totalPrice = unitPrice * qty;

      addonLineItems.push({
        addonId: addon.id,
        name: addon.name,
        qty,
        unitPrice,
        totalPrice,
        pricingType: addon.pricingType,
      });
    }
  }

  const addonsTotal = addonLineItems.reduce((sum, a) => sum + a.totalPrice, 0);

  const securityDeposit = pricing?.securityDeposit ?? 0;
  const taxRate = pricing?.taxRate ?? 0;
  const taxIncluded = pricing?.taxIncluded ?? true;

  const preTaxTotal = subtotal - discount + airportPickupFee + airportDropoffFee + deliveryFee + addonsTotal;
  const tax = taxIncluded ? 0 : preTaxTotal * (taxRate / 100);
  const finalTotal = preTaxTotal + tax;

  return {
    days: numDays,
    dayRates,
    subtotal,
    deliveryFee,
    airportPickupFee,
    airportDropoffFee,
    addons: addonLineItems,
    addonsTotal,
    discount,
    tax,
    securityDeposit,
    finalTotal,
    taxIncluded,
    currency: "JPY",
  };
}
