import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, pageContentTable } from "@workspace/db";
import {
  GetPageContentParams,
  GetPageContentResponse,
  UpdateAdminContentParams,
  UpdateAdminContentBody,
} from "@workspace/api-zod";
import { requireAdminAuth } from "../middlewares/admin-auth";

const router: IRouter = Router();

export const KNOWN_PAGES = ["home", "rentalcar", "lodging"] as const;

export const DEFAULT_CONTENT: Record<string, Record<string, unknown>> = {
  home: {
    hero: {
      title: "All-in-one stay in Hokkaido",
      subtitle:
        "Stay, travel, and explore Sapporo with lodging and rental car service in one building.",
      ctaLodging: "Short-term lodging",
      ctaRentalCar: "I want to rent a car",
    },
    lodging: {
      title: "Short-Term Lodging",
      description:
        "Comfortable, fully-furnished rooms in the heart of Sapporo — perfect for a few nights away. Every stay includes fast Wi-Fi, a kitchenette, and easy access to Sapporo's best neighborhoods.",
    },
    monthlyStay: {
      title: "Monthly Short-Term Stay",
      description:
        "Planning a longer visit? Our monthly stay plans offer discounted rates, flexible move-in dates, and all the comforts of home — ideal for remote workers, seasonal visitors, and Hokkaido road-trippers.",
    },
    rentalCarOverview: {
      title: "Rental Car Service",
      description:
        "Skip the rental counter lines. Pick up your car right from our building and hit the road to explore Hokkaido at your own pace, with easy access from New Chitose Airport.",
    },
    access: {
      title: "Location & Access",
      description:
        "Conveniently located in Sapporo with direct access from New Chitose Airport. Find us easily whether you're arriving by train, car, or plane.",
      address: "Wayado Sapporo Ciao, Sapporo, Hokkaido, Japan",
      mapEmbedUrl:
        "https://www.google.com/maps?q=Wayado+Sapporo+Ciao,+Sapporo,+Hokkaido,+Japan&output=embed",
    },
    whyChooseUs: [
      {
        title: "Located in Sapporo, Hokkaido",
        description: "Right in the heart of Japan's northern island, close to everything Hokkaido has to offer.",
      },
      {
        title: "Convenient for Airport Arrival",
        description: "Easy access to and from New Chitose Airport, so your trip starts the moment you land.",
      },
      {
        title: "Stay & Car Rental in One Package",
        description: "Skip the hassle of separate bookings — lodging and rental car, all in one building.",
      },
      {
        title: "Great for Families, Groups & Road Trips",
        description: "Spacious rooms and flexible car options make us ideal for families, groups, and long Hokkaido road trips.",
      },
    ],
    contact: {
      title: "Have Questions?",
      description:
        "Reach out to our team for booking assistance, custom itineraries, or anything else you need for your Hokkaido stay.",
      ctaText: "Contact Us",
    },
    copy: {
      heroEyebrow: "All-in-one package in Hokkaido",
      lodgingEyebrow: "Lodging",
      featuredRooms: "Featured Rooms",
      viewAllRooms: "View all rooms",
      monthlyEyebrow: "Monthly Stay",
      rentalEyebrow: "Rental Car",
      exploreRentalCars: "Explore rental cars",
      whyEyebrow: "Why CIAO",
      whyTitle: "Why Choose Us",
      accessEyebrow: "Access",
      contactEyebrow: "Contact",
      lodgingImageAlt: "Comfortable lodging in Sapporo",
      monthlyImageAlt: "Monthly stay in Sapporo",
      rentalImageAlt: "Rental car in Hokkaido",
      mapTitle: "Location map",
      heroImageAlt: "Sapporo winter cityscape",
      perNight: "/night",
    },
  },
  rentalcar: {
    hero: {
      eyebrow: "Sapporo · Hokkaido",
      title: "Rent a Car in Sapporo with Ease",
      subtitle: "Premium vehicles, flexible pickup, fully insured options.",
    },
    search: {
      pickupDate: "Pickup Date", returnDate: "Return Date", pickupLocation: "Pickup Location", returnLocation: "Return Location",
      pickupTime: "Pickup Time", returnTime: "Return Time", pickDate: "Pick a date", selectLocation: "Select location",
      adults: "Adults", children: "Children", babies: "Babies", largeLuggage: "Large luggage", smallLuggage: "Small luggage",
      optionalFilters: "Optional filters", vehicleClass: "Vehicle class", anyClass: "Any class", searchVehicles: "Search Vehicles",
      fullyInsured: "Fully Insured", fullyInsuredDescription: "Comprehensive coverage included in every booking.",
      multipleLocations: "Multiple Locations", multipleLocationsDescription: "Pickup and drop-off across Sapporo and the airport.",
      airportService: "Airport Service", airportServiceDescription: "Seamless New Chitose Airport connections.",
      easyPayment: "Easy Payment", easyPaymentDescription: "Transparent pricing, no hidden fees.",
      roadImageAlt: "Sapporo winter road", minDailyPrice: "Minimum daily price", maxDailyPrice: "Maximum daily price",
      priceRangeTo: "to", perDay: "/day", compact: "Compact", suv: "SUV", minivan: "Minivan",
      fourWheelDrive: "4WD", winterTires: "Winter tires", childSeat: "Child seat", airportDelivery: "Airport delivery", skiLuggage: "Ski luggage",
    },
    sections: {
      fleetEyebrow: "Our Fleet", featuredVehicles: "Featured Vehicles", viewAll: "View all",
      pricingEyebrow: "Pricing", insurancePlans: "Insurance Plans", addOns: "Add-Ons", importantNotes: "Important Notes",
      passengers: "Passengers", perDay: "/day",
    },
    pricingTable: {
      title: "Rental Pricing",
      description: "Transparent daily rates with no hidden fees. Airport pickup/drop-off fees vary by vehicle.",
      rows: [
        { label: "Compact Cars", value: "From ¥6,000 / day" },
        { label: "Sedans", value: "From ¥9,000 / day" },
        { label: "Minivans & SUVs", value: "From ¥13,000 / day" },
      ],
    },
    plans: [
      {
        name: "Standard Plan",
        description: "Daily rental with basic liability insurance included.",
        price: "Included in daily rate",
      },
      {
        name: "Premium Protection Plan",
        description: "Adds full collision damage waiver and roadside assistance for total peace of mind.",
        price: "+¥1,500 / day",
      },
    ],
    addOns: [
      { name: "Child Safety Seat", description: "Rear-facing or booster seat, installed on request.", price: "¥800 / day" },
      { name: "Winter Tire Upgrade", description: "Studless winter tires for snowy Hokkaido roads.", price: "¥1,000 / day" },
      { name: "Portable Wi-Fi Router", description: "Stay connected on the road with unlimited data.", price: "¥600 / day" },
    ],
    importantNotes: [
      "A valid driver's license (and International Driving Permit for overseas visitors) is required at pickup.",
      "Vehicles must be returned with a full tank of fuel or a refueling fee applies.",
      "Winter driving in Hokkaido can be challenging — we recommend the Winter Tire Upgrade from November to March.",
      "Cancellations within 24 hours of pickup may incur a cancellation fee.",
    ],
  },
  lodging: {
    hero: {
      title: "Short-Term Lodging in Sapporo",
      subtitle: "Comfortable, fully furnished rooms for your Hokkaido stay.",
    },
    overview: {
      title: "Make Yourself at Home",
      description: "Stay in the heart of Sapporo with practical amenities and easy access to Hokkaido.",
    },
    contact: {
      title: "Ready to stay with us?",
      description: "Contact our team for availability and booking assistance.",
      ctaText: "Contact Us",
    },
    copy: {
      eyebrow: "Short-Term Lodging",
      heading: "Our Rooms",
      description: "Comfortable, fully-equipped rooms in the heart of Sapporo — ideal for short stays of any length.",
      perNight: "/night",
      guests: "guests",
      bed: "bed",
      beds: "beds",
      viewRoom: "View Room",
      noRooms: "No rooms are currently listed.",
    },
  },
};

type LocalizedContent = { en: Record<string, unknown>; ja: Record<string, unknown> };

// The previous site had no Japanese source copy. Keep these values empty so
// editors can add real translations and visitors receive field-level English
// fallback rather than automatic or fabricated translations.
const DEFAULT_JA_CONTENT: Record<string, Record<string, unknown>> = {
  home: {},
  rentalcar: {},
  lodging: {},
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeContent(base: Record<string, unknown>, update: Record<string, unknown>): Record<string, unknown> {
  const merged = { ...base };
  for (const [key, value] of Object.entries(update)) {
    merged[key] = isRecord(value) && isRecord(base[key]) ? mergeContent(base[key], value) : value;
  }
  return merged;
}

function normalizeContent(page: string, content: Record<string, unknown>): LocalizedContent {
  const defaults = DEFAULT_CONTENT[page];
  const japaneseDefaults = DEFAULT_JA_CONTENT[page] ?? {};
  if (isRecord(content.en) || isRecord(content.ja)) {
    return {
      en: mergeContent(defaults, isRecord(content.en) ? content.en : {}),
      ja: mergeContent(japaneseDefaults, isRecord(content.ja) ? content.ja : {}),
    };
  }
  return { en: mergeContent(defaults, content), ja: japaneseDefaults };
}

async function getOrSeedContent(page: string): Promise<LocalizedContent | null> {
  const [existing] = await db.select().from(pageContentTable).where(eq(pageContentTable.page, page));
  if (existing) {
    return normalizeContent(page, existing.content);
  }

  if (!(page in DEFAULT_CONTENT)) {
    return null;
  }

  const defaults = normalizeContent(page, {});
  const [created] = await db
    .insert(pageContentTable)
    .values({ page, content: defaults })
    .onConflictDoNothing({ target: pageContentTable.page })
    .returning();

  if (created) {
    return normalizeContent(page, created.content);
  }

  const [row] = await db.select().from(pageContentTable).where(eq(pageContentTable.page, page));
  return row ? normalizeContent(page, row.content) : defaults;
}

router.get("/content/:page", async (req, res): Promise<void> => {
  const params = GetPageContentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const content = await getOrSeedContent(params.data.page);
  if (content === null) {
    res.status(404).json({ error: "Unknown page" });
    return;
  }

  res.json(GetPageContentResponse.parse({ page: params.data.page, content }));
});

router.put("/admin/content/:page", requireAdminAuth, async (req, res): Promise<void> => {
  const params = UpdateAdminContentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (!(params.data.page in DEFAULT_CONTENT)) {
    res.status(400).json({ error: "Unknown page" });
    return;
  }

  const body = UpdateAdminContentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [existing] = await db.select().from(pageContentTable).where(eq(pageContentTable.page, params.data.page));
  const stored = existing ? normalizeContent(params.data.page, existing.content) : normalizeContent(params.data.page, {});
  const incoming = body.data.content as Record<string, unknown>;
  const content: LocalizedContent = {
    en: mergeContent(stored.en, isRecord(incoming.en) ? incoming.en : {}),
    ja: mergeContent(stored.ja, isRecord(incoming.ja) ? incoming.ja : {}),
  };

  const [updated] = await db
    .insert(pageContentTable)
    .values({ page: params.data.page, content })
    .onConflictDoUpdate({
      target: pageContentTable.page,
      set: { content, updatedAt: new Date() },
    })
    .returning();

  res.json(GetPageContentResponse.parse({ page: params.data.page, content: normalizeContent(params.data.page, updated.content) }));
});

export default router;
