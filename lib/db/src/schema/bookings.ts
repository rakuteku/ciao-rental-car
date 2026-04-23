import { pgTable, serial, text, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { carsTable } from "./cars";

export const bookingsTable = pgTable("bookings", {
  id: serial("id").primaryKey(),
  carId: integer("car_id").notNull().references(() => carsTable.id),
  pickupDate: text("pickup_date").notNull(),
  returnDate: text("return_date").notNull(),
  pickupLocation: text("pickup_location").notNull(),
  returnLocation: text("return_location").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  totalPrice: real("total_price").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBookingSchema = createInsertSchema(bookingsTable).omit({ id: true, createdAt: true });
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookingsTable.$inferSelect;
