import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const rentalVehicleStatusEnum = pgEnum("rental_vehicle_status", [
  "draft",
  "published",
  "unpublished",
  "archived",
]);

export const rentalTransmissionEnum = pgEnum("rental_transmission", [
  "automatic",
  "manual",
  "cvt",
]);

export const rentalFuelTypeEnum = pgEnum("rental_fuel_type", [
  "gasoline",
  "diesel",
  "hybrid",
  "electric",
  "plugin_hybrid",
]);

export const rentalDriveTypeEnum = pgEnum("rental_drive_type", [
  "fwd",
  "rwd",
  "awd",
  "4wd",
]);

export const rentalVehicleClassEnum = pgEnum("rental_vehicle_class", [
  "economy",
  "compact",
  "midsize",
  "fullsize",
  "suv",
  "minivan",
  "van",
  "luxury",
  "sports",
  "truck",
]);

export const rentalVehiclesTable = pgTable(
  "rental_vehicles",
  {
    id: serial("id").primaryKey(),
    internalName: text("internal_name").notNull(),
    publicTitle: text("public_title").notNull(),
    publicTitleJa: text("public_title_ja"),
    publicTitleZhTw: text("public_title_zh_tw"),
    slug: text("slug").notNull(),
    brand: text("brand").notNull(),
    model: text("model").notNull(),
    trim: text("trim"),
    year: integer("year").notNull(),
    color: text("color"),
    plate: text("plate"),
    vin: text("vin"),
    vehicleClass: rentalVehicleClassEnum("vehicle_class").notNull().default("compact"),
    description: text("description").notNull().default(""),
    descriptionJa: text("description_ja"),
    descriptionZhTw: text("description_zh_tw"),
    internalNotes: text("internal_notes"),
    seats: integer("seats").notNull().default(5),
    recommendedPassengers: integer("recommended_passengers").notNull().default(4),
    maxPassengers: integer("max_passengers").notNull().default(5),
    smallLuggageCapacity: integer("small_luggage_capacity").notNull().default(0),
    largeLuggageCapacity: integer("large_luggage_capacity").notNull().default(0),
    doors: integer("doors").notNull().default(4),
    transmission: rentalTransmissionEnum("transmission").notNull().default("automatic"),
    fuelType: rentalFuelTypeEnum("fuel_type").notNull().default("gasoline"),
    driveType: rentalDriveTypeEnum("drive_type").notNull().default("fwd"),
    engineSize: text("engine_size"),
    mileage: integer("mileage"),
    fuelPolicy: text("fuel_policy").notNull().default("full_to_full"),
    smokingPolicy: text("smoking_policy").notNull().default("no_smoking"),
    petPolicy: text("pet_policy").notNull().default("no_pets"),
    status: rentalVehicleStatusEnum("status").notNull().default("draft"),
    featured: boolean("featured").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    has4wd: boolean("has_4wd").notNull().default(false),
    hasWinterTires: boolean("has_winter_tires").notNull().default(false),
    hasSnowBrush: boolean("has_snow_brush").notNull().default(false),
    hasIceScraper: boolean("has_ice_scraper").notNull().default(false),
    isSkiFriendly: boolean("is_ski_friendly").notNull().default(false),
    hasSkiRack: boolean("has_ski_rack").notNull().default(false),
    hasHeatedSeats: boolean("has_heated_seats").notNull().default(false),
    hasHeatedSteering: boolean("has_heated_steering").notNull().default(false),
    hasEtc: boolean("has_etc").notNull().default(false),
    hasNavigation: boolean("has_navigation").notNull().default(false),
    hasBackupCamera: boolean("has_backup_camera").notNull().default(false),
    hasBluetooth: boolean("has_bluetooth").notNull().default(false),
    hasUsbPort: boolean("has_usb_port").notNull().default(false),
    hasLargeLuggageSpace: boolean("has_large_luggage_space").notNull().default(false),
    hasEtcCard: boolean("has_etc_card").notNull().default(false),
    hasCarplay: boolean("has_carplay").notNull().default(false),
    hasAndroidAuto: boolean("has_android_auto").notNull().default(false),
    hasChildSeatCompatible: boolean("has_child_seat_compatible").notNull().default(false),
    canonicalUrl: text("canonical_url"),
    useGlobalPickupSettings: boolean("use_global_pickup_settings").notNull().default(true),
    pickupLocations: jsonb("pickup_locations").$type<string[]>(),
    returnLocations: jsonb("return_locations").$type<string[]>(),
    afterHoursPickup: boolean("after_hours_pickup").notNull().default(false),
    afterHoursReturn: boolean("after_hours_return").notNull().default(false),
    requiredDocuments: jsonb("required_documents").$type<string[]>(),
    operationalStatus: text("operational_status").notNull().default("available"),
    deliveryLeadTimeHours: integer("delivery_lead_time_hours"),
    deliveryFeeOverride: real("delivery_fee_override"),
    metaTitle: text("meta_title").notNull().default(""),
    metaDescription: text("meta_description").notNull().default(""),
    metaTitleJa: text("meta_title_ja"),
    metaDescriptionJa: text("meta_description_ja"),
    metaTitleZhTw: text("meta_title_zh_tw"),
    metaDescriptionZhTw: text("meta_description_zh_tw"),
    ogTitle: text("og_title").notNull().default(""),
    ogDescription: text("og_description").notNull().default(""),
    ogImage: text("og_image").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    unique("rental_vehicles_slug_unique").on(table.slug),
    index("rental_vehicles_status_idx").on(table.status),
    index("rental_vehicles_sort_idx").on(table.sortOrder),
  ],
);

export const insertRentalVehicleSchema = createInsertSchema(rentalVehiclesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});
export type InsertRentalVehicle = z.infer<typeof insertRentalVehicleSchema>;
export type RentalVehicle = typeof rentalVehiclesTable.$inferSelect;

export const rentalVehicleImagesTable = pgTable(
  "rental_vehicle_images",
  {
    id: serial("id").primaryKey(),
    vehicleId: integer("vehicle_id")
      .notNull()
      .references(() => rentalVehiclesTable.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    caption: text("caption"),
    sortOrder: integer("sort_order").notNull().default(0),
    isCover: boolean("is_cover").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("rental_vehicle_images_vehicle_idx").on(table.vehicleId),
    index("rental_vehicle_images_sort_idx").on(table.vehicleId, table.sortOrder),
  ],
);

export const insertRentalVehicleImageSchema = createInsertSchema(rentalVehicleImagesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertRentalVehicleImage = z.infer<typeof insertRentalVehicleImageSchema>;
export type RentalVehicleImage = typeof rentalVehicleImagesTable.$inferSelect;
