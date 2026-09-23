/**
 * Idempotent rental catalog backfill.
 *
 * Run with: pnpm --filter @workspace/scripts run seed-rental
 *
 * The legacy cars table remains the source of truth for the initial public
 * catalog values. Existing rental rows are updated in place where possible;
 * legacy car rows and unrelated add-ons are never deleted.
 */
import { and, eq, isNull } from "drizzle-orm";
import {
  carsTable,
  db,
  pageContentTable,
  rentalAddonsTable,
  rentalSettingsTable,
  rentalVehicleImagesTable,
  rentalVehiclePricingTable,
  rentalVehiclesTable,
} from "@workspace/db";

const CONTAMINATED_HOME_TITLE = "E2E Test Hero Title 1783049012080";
const DEFAULT_HOME_TITLE = "All-in-one stay in Hokkaido";

const vehicleMappings = [
  {
    legacyName: "Alphard",
    slug: "toyota-alphard",
    legacySlugs: ["toyota-alphard-01"],
    vehicleClass: "minivan" as const,
    featured: true,
    sortOrder: 10,
    recommendedPassengers: 6,
    smallLuggageCapacity: 2,
    largeLuggageCapacity: 2,
    doors: 4,
  },
  {
    legacyName: "Vellfire",
    slug: "toyota-vellfire",
    // The original draft-only seed used the second Alphard slot. Reusing it
    // avoids leaving two public Alphard records after this backfill.
    legacySlugs: ["toyota-alphard-02"],
    vehicleClass: "minivan" as const,
    featured: true,
    sortOrder: 20,
    recommendedPassengers: 6,
    smallLuggageCapacity: 2,
    largeLuggageCapacity: 2,
    doors: 4,
  },
  {
    legacyName: "Sienta",
    slug: "toyota-sienta",
    legacySlugs: ["toyota-sienta-01"],
    vehicleClass: "compact" as const,
    featured: true,
    sortOrder: 30,
    recommendedPassengers: 6,
    smallLuggageCapacity: 2,
    largeLuggageCapacity: 1,
    doors: 5,
  },
] as const;

const addonDefaults = [
  {
    name: "Child Safety Seat",
    description: "Rear-facing or booster seat, installed on request.",
    pricingType: "per_day" as const,
    flatFee: 0,
    perDayFee: 800,
    perUnitFee: 0,
    maxQty: 3,
    inventoryLimit: null,
    sortOrder: 10,
  },
  {
    name: "Winter Tire Upgrade",
    description: "Studless winter tires for snowy Hokkaido roads.",
    pricingType: "per_day" as const,
    flatFee: 0,
    perDayFee: 1000,
    perUnitFee: 0,
    maxQty: 1,
    inventoryLimit: null,
    sortOrder: 20,
  },
  {
    name: "Portable Wi-Fi Router",
    description: "Stay connected on the road with unlimited data.",
    pricingType: "per_day" as const,
    flatFee: 0,
    perDayFee: 600,
    perUnitFee: 0,
    maxQty: 1,
    inventoryLimit: null,
    sortOrder: 30,
  },
] as const;

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function contentWithRepairedHeroTitle(content: Record<string, unknown>) {
  const rootHero = content.hero;
  if (rootHero && typeof rootHero === "object" && !Array.isArray(rootHero)) {
    if ((rootHero as Record<string, unknown>).title === CONTAMINATED_HOME_TITLE) {
      return {
        ...content,
        hero: {
          ...rootHero,
          title: DEFAULT_HOME_TITLE,
        },
      };
    }
  }

  const english = content.en;
  if (!english || typeof english !== "object" || Array.isArray(english)) return null;
  const hero = (english as Record<string, unknown>).hero;
  if (!hero || typeof hero !== "object" || Array.isArray(hero)) return null;
  if ((hero as Record<string, unknown>).title !== CONTAMINATED_HOME_TITLE) return null;

  return {
    ...content,
    en: {
      ...english,
      hero: {
        ...hero,
        title: DEFAULT_HOME_TITLE,
      },
    },
  };
}

async function main() {
  await db.transaction(async (tx) => {
    const legacyCars = await tx.select().from(carsTable).orderBy(carsTable.id);
    const legacyByName = new Map(legacyCars.map((car) => [normalize(car.name), car]));
    const existingVehicles = await tx
      .select()
      .from(rentalVehiclesTable)
      .where(isNull(rentalVehiclesTable.deletedAt));
    const claimedVehicleIds = new Set<number>();

    for (const mapping of vehicleMappings) {
      const legacy = legacyByName.get(normalize(mapping.legacyName));
      if (!legacy) {
        throw new Error(`Legacy car "${mapping.legacyName}" was not found`);
      }

      const existing =
        existingVehicles.find((vehicle) => vehicle.slug === mapping.slug && !claimedVehicleIds.has(vehicle.id)) ??
        existingVehicles.find((vehicle) => mapping.legacySlugs.some((slug) => slug === vehicle.slug) && !claimedVehicleIds.has(vehicle.id)) ??
        existingVehicles.find(
          (vehicle) =>
            !claimedVehicleIds.has(vehicle.id) &&
            (normalize(vehicle.model) === normalize(legacy.name) ||
              normalize(vehicle.publicTitle).includes(normalize(legacy.name))),
        );

      const values = {
        internalName: `${legacy.model} ${legacy.name}`,
        publicTitle: `${legacy.model} ${legacy.name}`,
        slug: mapping.slug,
        brand: legacy.model,
        model: legacy.name,
        trim: null,
        year: legacy.year,
        vehicleClass: mapping.vehicleClass,
        description: legacy.description ?? "",
        seats: legacy.passengerCapacity,
        recommendedPassengers: Math.min(mapping.recommendedPassengers, legacy.passengerCapacity),
        maxPassengers: legacy.passengerCapacity,
        smallLuggageCapacity: mapping.smallLuggageCapacity,
        largeLuggageCapacity: mapping.largeLuggageCapacity,
        doors: mapping.doors,
        transmission: "automatic" as const,
        fuelType: "hybrid" as const,
        driveType: "fwd" as const,
        fuelPolicy: "full_to_full",
        smokingPolicy: "no_smoking",
        petPolicy: "no_pets",
        status: "published" as const,
        featured: mapping.featured,
        sortOrder: mapping.sortOrder,
        hasWinterTires: true,
        hasSnowBrush: true,
        hasIceScraper: true,
        isSkiFriendly: true,
        hasHeatedSeats: mapping.vehicleClass === "minivan",
        hasHeatedSteering: true,
        hasEtc: true,
        hasNavigation: true,
        hasBackupCamera: true,
        hasBluetooth: true,
        hasUsbPort: true,
        hasChildSeatCompatible: true,
        requiredDocuments: ["drivers_license", "passport"],
        operationalStatus: "available",
        useGlobalPickupSettings: true,
        updatedAt: new Date(),
      };

      let vehicle: typeof rentalVehiclesTable.$inferSelect;
      if (existing) {
        [vehicle] = await tx
          .update(rentalVehiclesTable)
          .set(values)
          .where(eq(rentalVehiclesTable.id, existing.id))
          .returning();
        console.log(`  Updated ${mapping.slug} (id=${vehicle.id}) from cars.id=${legacy.id}`);
      } else {
        [vehicle] = await tx
          .insert(rentalVehiclesTable)
          .values(values)
          .returning();
        console.log(`  Created ${mapping.slug} (id=${vehicle.id}) from cars.id=${legacy.id}`);
      }
      claimedVehicleIds.add(vehicle.id);

      const [pricing] = await tx
        .select()
        .from(rentalVehiclePricingTable)
        .where(eq(rentalVehiclePricingTable.vehicleId, vehicle.id));
      const pricingValues = {
        basePrice: legacy.pricePerDay,
        weeklyDiscountPct: 5,
        monthlyDiscountPct: 15,
        minDays: 1,
        cleaningFee: 0,
        deliveryFee: 0,
        lateReturnFee: 5000,
        securityDeposit: 50000,
        taxIncluded: true,
        taxRate: 0,
        airportPickupFee: legacy.airportPickupFee,
        airportDropoffFee: legacy.airportDropoffFee,
        updatedAt: new Date(),
      };
      if (pricing) {
        await tx
          .update(rentalVehiclePricingTable)
          .set(pricingValues)
          .where(eq(rentalVehiclePricingTable.id, pricing.id));
      } else {
        await tx.insert(rentalVehiclePricingTable).values({
          vehicleId: vehicle.id,
          ...pricingValues,
        });
      }

      const imageUrls = [...new Set([...(legacy.imageUrls ?? []), legacy.imageUrl].filter(Boolean))];
      const currentImages = await tx
        .select()
        .from(rentalVehicleImagesTable)
        .where(eq(rentalVehicleImagesTable.vehicleId, vehicle.id));
      for (const [sortOrder, url] of imageUrls.entries()) {
        const current = currentImages.find((image) => image.url === url);
        if (current) {
          await tx
            .update(rentalVehicleImagesTable)
            .set({ sortOrder, isCover: sortOrder === 0 })
            .where(eq(rentalVehicleImagesTable.id, current.id));
        } else {
          await tx.insert(rentalVehicleImagesTable).values({
            vehicleId: vehicle.id,
            url,
            sortOrder,
            isCover: sortOrder === 0,
          });
        }
      }
    }

    for (const addonDefault of addonDefaults) {
      const [existing] = await tx
        .select()
        .from(rentalAddonsTable)
        .where(eq(rentalAddonsTable.name, addonDefault.name));
      if (existing) {
        await tx
          .update(rentalAddonsTable)
          .set({ ...addonDefault, published: true, required: false, updatedAt: new Date() })
          .where(eq(rentalAddonsTable.id, existing.id));
        console.log(`  Updated add-on ${addonDefault.name} (id=${existing.id})`);
      } else {
        const [addon] = await tx
          .insert(rentalAddonsTable)
          .values({ ...addonDefault, published: true, required: false })
          .returning();
        console.log(`  Created add-on ${addonDefault.name} (id=${addon.id})`);
      }
    }

    const settings = [
      { key: "turnaround_buffer_hours", value: "2", description: "Hours of buffer between rentals for the same vehicle" },
      { key: "cleaning_buffer_hours", value: "1", description: "Hours reserved for cleaning after return" },
      { key: "preparation_buffer_hours", value: "1", description: "Hours reserved for vehicle preparation before pickup" },
      { key: "airport_delivery_buffer_hours", value: "1", description: "Extra buffer hours for airport pickups/dropoffs" },
      { key: "hold_expiry_minutes", value: "30", description: "Minutes before a temporary hold expires" },
    ];
    for (const setting of settings) {
      await tx
        .insert(rentalSettingsTable)
        .values(setting)
        .onConflictDoNothing({ target: rentalSettingsTable.key });
    }

    const [home] = await tx
      .select()
      .from(pageContentTable)
      .where(eq(pageContentTable.page, "home"));
    if (home) {
      const repairedContent = contentWithRepairedHeroTitle(home.content);
      if (repairedContent) {
        await tx
          .update(pageContentTable)
          .set({ content: repairedContent, updatedAt: new Date() })
          .where(and(eq(pageContentTable.id, home.id), eq(pageContentTable.page, "home")));
        console.log("  Repaired the exact contaminated English home hero title");
      }
    }
  });

  console.log("Rental catalog backfill complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});