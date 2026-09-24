/**
 * Idempotent rental catalog backfill shared by the CLI and API startup.
 *
 * The legacy cars table remains the source of truth for the initial public
 * catalog values. Existing rental rows are updated in place where possible;
 * legacy car rows and unrelated add-ons are never deleted.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  carsTable,
  db,
  pageContentTable,
  rentalAddonsTable,
  rentalSettingsTable,
  rentalVehicleImagesTable,
  rentalVehiclePricingTable,
  rentalVehiclesTable,
} from "./index";

const CONTAMINATED_HOME_TITLE = "E2E Test Hero Title 1783049012080";
const DEFAULT_HOME_TITLE = "All-in-one stay in Hokkaido";

const vehicleMappings = [
  {
    legacyName: "Alphard",
    slug: "toyota-alphard",
    legacySlugs: ["toyota-alphard-01"],
    vehicleClass: "minivan" as const,
    imagePath: "/images/alphard.png",
    publicTitleJa: "トヨタ アルファード",
    publicTitleZhTw: "Toyota Alphard 豪華休旅車",
    descriptionJa: "家族旅行やビジネス利用に最適な、広く上質なミニバンです。快適なシートと十分な荷室を備えています。",
    descriptionZhTw: "寬敞豪華的廂型車，適合家庭旅行或商務使用，配備舒適座椅與充足行李空間。",
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
    imagePath: "/images/vellfire.png",
    publicTitleJa: "トヨタ ヴェルファイア",
    publicTitleZhTw: "Toyota Vellfire 豪華休旅車",
    descriptionJa: "エグゼクティブシートと高い静粛性を備えた、上質な北海道旅行のためのプレミアムミニバンです。",
    descriptionZhTw: "配備尊榮座椅與優異隔音的高級廂型車，帶來舒適的北海道旅程。",
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
    imagePath: "/images/sienta.png",
    publicTitleJa: "トヨタ シエンタ",
    publicTitleZhTw: "Toyota Sienta 多功能家庭車",
    descriptionJa: "運転しやすく燃費にも優れたコンパクトミニバン。家族での北海道ドライブに便利です。",
    descriptionZhTw: "靈活好開且省油的緊湊型家庭車，適合北海道家庭自駕旅行。",
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
    nameJa: "チャイルドシート",
    nameZhTw: "兒童安全座椅",
    description: "Rear-facing or booster seat, installed on request.",
    descriptionJa: "ご希望に応じて後ろ向きシートまたはブースターシートを取り付けます。",
    descriptionZhTw: "可依需求安裝後向式安全座椅或增高墊。",
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
    nameJa: "冬用タイヤアップグレード",
    nameZhTw: "冬季輪胎升級",
    description: "Studless winter tires for snowy Hokkaido roads.",
    descriptionJa: "北海道の雪道に適したスタッドレスタイヤです。",
    descriptionZhTw: "適合北海道雪地道路的無釘冬季輪胎。",
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
    nameJa: "ポータブルWi-Fiルーター",
    nameZhTw: "行動 Wi-Fi 分享器",
    description: "Stay connected on the road with unlimited data.",
    descriptionJa: "データ容量を気にせず移動中もインターネットを利用できます。",
    descriptionZhTw: "提供不限流量網路，旅途中也能保持連線。",
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

export async function runRentalCatalogBackfill(
  log: (message: string) => void = console.log,
) {
  log("Rental catalog backfill starting.");

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
        publicTitleJa: mapping.publicTitleJa,
        publicTitleZhTw: mapping.publicTitleZhTw,
        slug: mapping.slug,
        brand: legacy.model,
        model: legacy.name,
        trim: null,
        year: legacy.year,
        vehicleClass: mapping.vehicleClass,
        description: legacy.description ?? "",
        descriptionJa: mapping.descriptionJa,
        descriptionZhTw: mapping.descriptionZhTw,
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
        log(`Rental vehicle ${mapping.slug} ready (id=${vehicle.id}, source cars.id=${legacy.id}).`);
      } else {
        [vehicle] = await tx
          .insert(rentalVehiclesTable)
          .values(values)
          .returning();
        log(`Rental vehicle ${mapping.slug} created (id=${vehicle.id}, source cars.id=${legacy.id}).`);
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

      const currentImages = await tx
        .select()
        .from(rentalVehicleImagesTable)
        .where(eq(rentalVehicleImagesTable.vehicleId, vehicle.id));
       const isKnownGoogleHostedImage = (url: string) => {
         try {
           const hostname = new URL(url).hostname.toLowerCase();
           return hostname === "gstatic.com" || hostname.endsWith(".gstatic.com") ||
             hostname === "googleusercontent.com" || hostname.endsWith(".googleusercontent.com") ||
             hostname === "ggpht.com" || hostname.endsWith(".ggpht.com");
         } catch {
           return false;
         }
       };
       const localImage = currentImages.find((image) => image.url === mapping.imagePath);
       const legacyImages = currentImages.filter((image) => isKnownGoogleHostedImage(image.url));
       if (legacyImages.length > 0) {
         if (localImage) {
           for (const legacyImage of legacyImages) {
             await tx.delete(rentalVehicleImagesTable).where(eq(rentalVehicleImagesTable.id, legacyImage.id));
           }
         } else {
           const [primary, ...duplicates] = legacyImages;
           await tx.update(rentalVehicleImagesTable)
             .set({ url: mapping.imagePath, sortOrder: primary.sortOrder, isCover: primary.isCover })
             .where(eq(rentalVehicleImagesTable.id, primary.id));
           for (const duplicate of duplicates) {
             await tx.delete(rentalVehicleImagesTable).where(eq(rentalVehicleImagesTable.id, duplicate.id));
           }
         }
       } else if (!localImage) {
         await tx.update(rentalVehicleImagesTable)
           .set({ sortOrder: sql`${rentalVehicleImagesTable.sortOrder} + 1`, isCover: false })
           .where(eq(rentalVehicleImagesTable.vehicleId, vehicle.id));
         await tx.insert(rentalVehicleImagesTable).values({
           vehicleId: vehicle.id,
           url: mapping.imagePath,
           sortOrder: 0,
           isCover: true,
         });
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
        log(`Rental add-on ${addonDefault.name} ready (id=${existing.id}).`);
      } else {
        const [addon] = await tx
          .insert(rentalAddonsTable)
          .values({ ...addonDefault, published: true, required: false })
          .returning();
        log(`Rental add-on ${addonDefault.name} created (id=${addon.id}).`);
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
        log("Repaired the exact contaminated English home hero title.");
      }
    }
  });

  log("Rental catalog backfill complete.");
}
