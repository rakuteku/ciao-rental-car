import { pgTable, serial, integer, text, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { carsTable } from "./cars";

export const availabilityTable = pgTable("availability", {
  id: serial("id").primaryKey(),
  carId: integer("car_id").notNull().references(() => carsTable.id),
  date: text("date").notNull(),
  isAvailable: boolean("is_available").notNull().default(true),
});

export const insertAvailabilitySchema = createInsertSchema(availabilityTable).omit({ id: true });
export type InsertAvailability = z.infer<typeof insertAvailabilitySchema>;
export type Availability = typeof availabilityTable.$inferSelect;
