import { pgTable, serial, text, integer, real, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const carsTable = pgTable("cars", {
  id: serial("id").primaryKey(),
  model: text("model").notNull().default("Toyota"),
  name: text("name").notNull(),
  year: integer("year").notNull().default(2024),
  passengerCapacity: integer("passenger_capacity").notNull(),
  fuelEfficiency: real("fuel_efficiency").notNull().default(10),
  pricePerDay: real("price_per_day").notNull(),
  airportPickupFee: real("airport_pickup_fee").notNull().default(9800),
  airportDropoffFee: real("airport_dropoff_fee").notNull().default(9800),
  imageUrls: jsonb("image_urls").notNull().$type<string[]>().default([]),
  imageUrl: text("image_url").notNull().default(""),
  isAvailable: boolean("is_available").notNull().default(true),
  description: text("description"),
});

export const insertCarSchema = createInsertSchema(carsTable).omit({ id: true });
export type InsertCar = z.infer<typeof insertCarSchema>;
export type Car = typeof carsTable.$inferSelect;
