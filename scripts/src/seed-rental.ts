/**
 * Run with: pnpm --filter @workspace/scripts run seed-rental
 */
import { and, eq } from "drizzle-orm";
import {
  db,
  rentalAddonsTable,
  rentalOperatorsTable,
  rentalSettingsTable,
  rentalVehicleImagesTable,
  rentalVehiclePricingTable,
  rentalVehiclesTable,
} from "@workspace/db";

if (process.env.NODE_ENV === "production" && process.env.ALLOW_SEED !== "1") {
  throw new Error("Refusing to seed production. Set ALLOW_SEED=1 to override.");
}

const demoVehicles = [
  {
    slug: "demo-toyota-alphard",
    internalName: "Demo Toyota Alphard",
    publicTitle: "Toyota Alphard",
    publicTitleJa: "トヨタ アルファード",
    publicTitleZhTw: "Toyota Alphard 豪華休旅車",
    brand: "Toyota",
    model: "Alphard",
    year: 2024,
    vehicleClass: "minivan" as const,
    description: "A spacious minivan for a Hokkaido road trip.",
    descriptionJa: "北海道のドライブに適した広々としたミニバンです。",
    descriptionZhTw: "適合北海道自駕旅行的寬敞廂型車。",
    imagePath: "/images/alphard.png",
    basePrice: 18000,
    rate12Hours: 12000,
    rate24Hours: 18000,
    additional24Hours: 18000,
    additionalHour: 1000,
    sortOrder: 10,
  },
  {
    slug: "demo-toyota-sienta",
    internalName: "Demo Toyota Sienta",
    publicTitle: "Toyota Sienta",
    publicTitleJa: "トヨタ シエンタ",
    publicTitleZhTw: "Toyota Sienta 多功能家庭車",
    brand: "Toyota",
    model: "Sienta",
    year: 2024,
    vehicleClass: "compact" as const,
    description: "A practical compact minivan for city and regional drives.",
    descriptionJa: "市内と近郊のドライブに便利なコンパクトミニバンです。",
    descriptionZhTw: "適合市區與近郊自駕的實用緊湊型家庭車。",
    imagePath: "/images/sienta.png",
    basePrice: 9800,
    rate12Hours: 6800,
    rate24Hours: 9800,
    additional24Hours: 9800,
    additionalHour: 600,
    sortOrder: 20,
  },
];

const demoAddons = [
  {
    name: "Child Seat",
    nameJa: "チャイルドシート",
    nameZhTw: "兒童安全座椅",
    description: "Child seat supplied on request.",
    descriptionJa: "ご希望に応じてチャイルドシートをご用意します。",
    descriptionZhTw: "可依需求提供兒童安全座椅。",
    pricingType: "per_day" as const,
    flatFee: 0,
    perDayFee: 800,
    perUnitFee: 0,
    maxQty: 3,
    sortOrder: 10,
  },
  {
    name: "ETC Card",
    nameJa: "ETCカード",
    nameZhTw: "ETC 卡",
    description: "ETC card for compatible toll roads.",
    descriptionJa: "対応する有料道路で利用できるETCカードです。",
    descriptionZhTw: "可在相容收費道路使用的 ETC 卡。",
    pricingType: "per_rental" as const,
    flatFee: 500,
    perDayFee: 0,
    perUnitFee: 0,
    maxQty: 1,
    sortOrder: 20,
  },
  {
    name: "Pocket Wi-Fi",
    nameJa: "ポケットWi-Fi",
    nameZhTw: "行動 Wi-Fi 分享器",
    description: "Portable Wi-Fi for use during the rental.",
    descriptionJa: "レンタル中に使えるポータブルWi-Fiです。",
    descriptionZhTw: "租車期間可使用的行動 Wi-Fi。",
    pricingType: "per_day" as const,
    flatFee: 0,
    perDayFee: 600,
    perUnitFee: 0,
    maxQty: 1,
    sortOrder: 30,
  },
];

async function seedRental() {
  await db.transaction(async (tx) => {
    let [platform] = await tx.select().from(rentalOperatorsTable)
      .where(eq(rentalOperatorsTable.isPlatform, true));
    if (!platform) {
      await tx.insert(rentalOperatorsTable).values({
        slug: "platform",
        name: "Platform",
        status: "active",
        verificationStatus: "approved",
        isPlatform: true,
      }).onConflictDoNothing();
      [platform] = await tx.select().from(rentalOperatorsTable)
        .where(eq(rentalOperatorsTable.isPlatform, true));
    }
    if (!platform) throw new Error("Platform operator seed failed");

    for (const vehicle of demoVehicles) {
      const vehicleValues = {
        operatorId: platform.id,
        internalName: vehicle.internalName,
        publicTitle: vehicle.publicTitle,
        publicTitleJa: vehicle.publicTitleJa,
        publicTitleZhTw: vehicle.publicTitleZhTw,
        slug: vehicle.slug,
        brand: vehicle.brand,
        model: vehicle.model,
        year: vehicle.year,
        vehicleClass: vehicle.vehicleClass,
        description: vehicle.description,
        descriptionJa: vehicle.descriptionJa,
        descriptionZhTw: vehicle.descriptionZhTw,
        seats: 6,
        recommendedPassengers: 5,
        maxPassengers: 6,
        smallLuggageCapacity: 2,
        largeLuggageCapacity: 2,
        status: "published" as const,
        featured: true,
        sortOrder: vehicle.sortOrder,
        hasEtc: true,
        hasNavigation: true,
        hasBackupCamera: true,
        hasBluetooth: true,
        hasUsbPort: true,
        hasChildSeatCompatible: true,
        requiredDocuments: ["drivers_license", "passport"],
        updatedAt: new Date(),
      };
      const [seededVehicle] = await tx.insert(rentalVehiclesTable).values(vehicleValues)
        .onConflictDoUpdate({ target: rentalVehiclesTable.slug, set: vehicleValues })
        .returning();

      const pricingValues = {
        basePrice: vehicle.basePrice,
        ratePlanName: "Demo standard rate",
        currency: "JPY",
        rateStatus: "active",
        rate12Hours: vehicle.rate12Hours,
        rate24Hours: vehicle.rate24Hours,
        additional24Hours: vehicle.additional24Hours,
        additionalHour: vehicle.additionalHour,
        taxIncluded: true,
        updatedAt: new Date(),
      };
      const [pricing] = await tx.select().from(rentalVehiclePricingTable)
        .where(eq(rentalVehiclePricingTable.vehicleId, seededVehicle.id));
      if (pricing) await tx.update(rentalVehiclePricingTable).set(pricingValues)
        .where(eq(rentalVehiclePricingTable.id, pricing.id));
      else await tx.insert(rentalVehiclePricingTable).values({ vehicleId: seededVehicle.id, ...pricingValues });

      const [image] = await tx.select().from(rentalVehicleImagesTable)
        .where(and(eq(rentalVehicleImagesTable.vehicleId, seededVehicle.id), eq(rentalVehicleImagesTable.url, vehicle.imagePath)));
      if (!image) await tx.insert(rentalVehicleImagesTable).values({
        vehicleId: seededVehicle.id, url: vehicle.imagePath, sortOrder: 0, isCover: true,
      });
    }

    for (const addon of demoAddons) {
      const values = { ...addon, operatorId: platform.id, published: true, required: false, updatedAt: new Date() };
      const [existing] = await tx.select().from(rentalAddonsTable).where(and(
        eq(rentalAddonsTable.operatorId, platform.id), eq(rentalAddonsTable.name, addon.name),
      ));
      if (existing) await tx.update(rentalAddonsTable).set(values).where(eq(rentalAddonsTable.id, existing.id));
      else await tx.insert(rentalAddonsTable).values(values);
    }

    const bookingLocations = [{
      value: "CIAO office", labelEn: "CIAO office", labelJa: "CIAOオフィス", labelZhTw: "CIAO 辦公室", pickupFee: 0, returnFee: 0,
    }];
    await tx.insert(rentalSettingsTable).values({ key: "bookingLocations", value: JSON.stringify(bookingLocations) })
      .onConflictDoUpdate({ target: rentalSettingsTable.key, set: { value: JSON.stringify(bookingLocations), updatedAt: new Date() } });
  });
  console.log("Rental demo catalogue seed complete.");
}

seedRental().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
