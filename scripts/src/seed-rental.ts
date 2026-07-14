/**
 * Seed script for rental car initial data.
 * Run with: pnpm --filter @workspace/scripts run seed-rental
 *
 * Seeds:
 *  - 3 draft rental vehicles (Toyota Alphard 01/02, Toyota Sienta 01)
 *  - Pricing rows for each vehicle
 *  - Operational settings (buffers, hold expiry)
 *
 * Idempotent: uses ON CONFLICT DO NOTHING on slug / key columns.
 */
import { db } from "@workspace/db";
import {
  rentalVehiclesTable,
  rentalVehiclePricingTable,
  rentalSettingsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

async function main() {
  console.log("Seeding rental vehicles...");

  const vehicles = [
    {
      internalName: "Toyota Alphard 01",
      publicTitle: "Toyota Alphard (Type 1)",
      slug: "toyota-alphard-01",
      brand: "Toyota",
      model: "Alphard",
      trim: "Executive Lounge",
      year: 2023,
      vehicleClass: "minivan" as const,
      description:
        "Spacious premium minivan perfect for families and groups. Offers exceptional comfort with power sliding doors and reclining captain seats.",
      seats: 7,
      recommendedPassengers: 6,
      maxPassengers: 7,
      smallLuggageCapacity: 2,
      largeLuggageCapacity: 2,
      doors: 4,
      transmission: "automatic" as const,
      fuelType: "hybrid" as const,
      driveType: "fwd" as const,
      fuelPolicy: "full_to_full" as const,
      smokingPolicy: "no_smoking" as const,
      petPolicy: "no_pets" as const,
      status: "draft" as const,
      featured: true,
      sortOrder: 10,
      has4wd: false,
      hasWinterTires: true,
      hasSnowBrush: true,
      hasIceScraper: true,
      isSkiFriendly: true,
      hasSkiRack: false,
      hasHeatedSeats: true,
      hasHeatedSteering: true,
      hasEtc: true,
      hasNavigation: true,
      hasBackupCamera: true,
      hasBluetooth: true,
      hasUsbPort: true,
    },
    {
      internalName: "Toyota Alphard 02",
      publicTitle: "Toyota Alphard (Type 2)",
      slug: "toyota-alphard-02",
      brand: "Toyota",
      model: "Alphard",
      trim: "Z Grade",
      year: 2022,
      vehicleClass: "minivan" as const,
      description:
        "Comfortable and versatile minivan ideal for group travel across Hokkaido. Features 7 seats with ample cargo space for luggage and ski equipment.",
      seats: 7,
      recommendedPassengers: 6,
      maxPassengers: 7,
      smallLuggageCapacity: 2,
      largeLuggageCapacity: 2,
      doors: 4,
      transmission: "automatic" as const,
      fuelType: "hybrid" as const,
      driveType: "fwd" as const,
      fuelPolicy: "full_to_full" as const,
      smokingPolicy: "no_smoking" as const,
      petPolicy: "no_pets" as const,
      status: "draft" as const,
      featured: true,
      sortOrder: 20,
      has4wd: false,
      hasWinterTires: true,
      hasSnowBrush: true,
      hasIceScraper: true,
      isSkiFriendly: true,
      hasSkiRack: false,
      hasHeatedSeats: true,
      hasHeatedSteering: true,
      hasEtc: true,
      hasNavigation: true,
      hasBackupCamera: true,
      hasBluetooth: true,
      hasUsbPort: true,
    },
    {
      internalName: "Toyota Sienta 01",
      publicTitle: "Toyota Sienta",
      slug: "toyota-sienta-01",
      brand: "Toyota",
      model: "Sienta",
      trim: "Hybrid G",
      year: 2023,
      vehicleClass: "compact" as const,
      description:
        "Compact and nimble minivan perfect for small families and couples. Easy to drive with excellent fuel economy, ideal for exploring Hokkaido's scenic routes.",
      seats: 5,
      recommendedPassengers: 4,
      maxPassengers: 5,
      smallLuggageCapacity: 2,
      largeLuggageCapacity: 1,
      doors: 5,
      transmission: "automatic" as const,
      fuelType: "hybrid" as const,
      driveType: "fwd" as const,
      fuelPolicy: "full_to_full" as const,
      smokingPolicy: "no_smoking" as const,
      petPolicy: "no_pets" as const,
      status: "draft" as const,
      featured: false,
      sortOrder: 30,
      has4wd: false,
      hasWinterTires: true,
      hasSnowBrush: true,
      hasIceScraper: true,
      isSkiFriendly: true,
      hasSkiRack: false,
      hasHeatedSeats: false,
      hasHeatedSteering: true,
      hasEtc: true,
      hasNavigation: true,
      hasBackupCamera: true,
      hasBluetooth: true,
      hasUsbPort: true,
    },
  ];

  for (const v of vehicles) {
    const existing = await db
      .select({ id: rentalVehiclesTable.id })
      .from(rentalVehiclesTable)
      .where(eq(rentalVehiclesTable.slug, v.slug));

    if (existing.length > 0) {
      console.log(`  Skip ${v.slug} (already exists, id=${existing[0].id})`);
      continue;
    }

    const [vehicle] = await db.insert(rentalVehiclesTable).values(v).returning();
    console.log(`  Created ${vehicle.slug} (id=${vehicle.id})`);

    await db.insert(rentalVehiclePricingTable).values({
      vehicleId: vehicle.id,
      basePrice: 15000,
      weeklyDiscountPct: 5,
      monthlyDiscountPct: 15,
      minDays: 1,
      cleaningFee: 3000,
      deliveryFee: 0,
      lateReturnFee: 5000,
      securityDeposit: 50000,
      taxIncluded: true,
      taxRate: 0,
      airportPickupFee: 9800,
      airportDropoffFee: 9800,
    });
    console.log(`  Created pricing for ${vehicle.slug}`);
  }

  console.log("Seeding rental_settings...");
  const settings = [
    { key: "turnaround_buffer_hours", value: "2", description: "Hours of buffer between rentals for the same vehicle" },
    { key: "cleaning_buffer_hours", value: "1", description: "Hours reserved for cleaning after return" },
    { key: "preparation_buffer_hours", value: "1", description: "Hours reserved for vehicle preparation before pickup" },
    { key: "airport_delivery_buffer_hours", value: "1", description: "Extra buffer hours for airport pickups/dropoffs" },
    { key: "hold_expiry_minutes", value: "30", description: "Minutes before a temporary hold expires" },
  ];

  for (const s of settings) {
    await db
      .insert(rentalSettingsTable)
      .values(s)
      .onConflictDoNothing();
    console.log(`  Setting: ${s.key} = ${s.value}`);
  }

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
