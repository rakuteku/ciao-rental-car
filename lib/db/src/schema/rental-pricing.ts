import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  real,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { rentalVehiclesTable } from "./rental-vehicles";

export const rentalPricingAppliesEnum = pgEnum("rental_pricing_applies", [
  "all",
  "class",
  "vehicle",
]);

export const rentalPricingRuleTypeEnum = pgEnum("rental_pricing_rule_type", [
  "multiplier",
  "fixed",
]);

export const rentalVehiclePricingTable = pgTable(
  "rental_vehicle_pricing",
  {
    id: serial("id").primaryKey(),
    vehicleId: integer("vehicle_id")
      .notNull()
      .references(() => rentalVehiclesTable.id, { onDelete: "cascade" }),
    basePrice: real("base_price").notNull().default(0),
    weekendPrice: real("weekend_price"),
    holidayPrice: real("holiday_price"),
    highSeasonPrice: real("high_season_price"),
    winterSeasonPrice: real("winter_season_price"),
    weeklyDiscountPct: real("weekly_discount_pct").notNull().default(0),
    monthlyDiscountPct: real("monthly_discount_pct").notNull().default(0),
    minDays: integer("min_days").notNull().default(1),
    maxDays: integer("max_days"),
    cleaningFee: real("cleaning_fee").notNull().default(0),
    deliveryFee: real("delivery_fee").notNull().default(0),
    lateReturnFee: real("late_return_fee").notNull().default(0),
    extraMileageFee: real("extra_mileage_fee").notNull().default(0),
    securityDeposit: real("security_deposit").notNull().default(0),
    taxIncluded: boolean("tax_included").notNull().default(true),
    taxRate: real("tax_rate").notNull().default(0),
    airportPickupFee: real("airport_pickup_fee").notNull().default(0),
    airportDropoffFee: real("airport_dropoff_fee").notNull().default(0),
    manualPriceOverride: boolean("manual_price_override").notNull().default(false),
    manualPriceValue: real("manual_price_value"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("rental_vehicle_pricing_vehicle_idx").on(table.vehicleId),
  ],
);

export const insertRentalVehiclePricingSchema = createInsertSchema(rentalVehiclePricingTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertRentalVehiclePricing = z.infer<typeof insertRentalVehiclePricingSchema>;
export type RentalVehiclePricing = typeof rentalVehiclePricingTable.$inferSelect;

export const rentalSeasonalPricingRulesTable = pgTable(
  "rental_seasonal_pricing_rules",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    appliesTo: rentalPricingAppliesEnum("applies_to").notNull().default("all"),
    vehicleClass: text("vehicle_class"),
    vehicleId: integer("vehicle_id").references(() => rentalVehiclesTable.id, { onDelete: "cascade" }),
    startDate: text("start_date"),
    endDate: text("end_date"),
    daysOfWeek: text("days_of_week").array(),
    ruleType: rentalPricingRuleTypeEnum("rule_type").notNull().default("multiplier"),
    multiplier: real("multiplier"),
    fixedPrice: real("fixed_price"),
    priority: integer("priority").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("rental_seasonal_rules_vehicle_idx").on(table.vehicleId),
    index("rental_seasonal_rules_priority_idx").on(table.priority),
  ],
);

export const insertRentalSeasonalPricingRuleSchema = createInsertSchema(rentalSeasonalPricingRulesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertRentalSeasonalPricingRule = z.infer<typeof insertRentalSeasonalPricingRuleSchema>;
export type RentalSeasonalPricingRule = typeof rentalSeasonalPricingRulesTable.$inferSelect;
