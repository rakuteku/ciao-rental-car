import { pgTable, serial, text, integer, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const carsTable = pgTable("cars", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  passengerCapacity: integer("passenger_capacity").notNull(),
  pricePerDay: real("price_per_day").notNull(),
  imageUrl: text("image_url").notNull(),
  isAvailable: boolean("is_available").notNull().default(true),
  description: text("description"),
});

export const insertCarSchema = createInsertSchema(carsTable).omit({ id: true });
export type InsertCar = z.infer<typeof insertCarSchema>;
export type Car = typeof carsTable.$inferSelect;
