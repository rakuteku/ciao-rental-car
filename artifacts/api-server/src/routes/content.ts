import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, pageContentTable } from "@workspace/db";
import { GetPageContentParams, GetPageContentResponse } from "@workspace/api-zod";

const router: IRouter = Router();

const DEFAULT_CONTENT: Record<string, Record<string, unknown>> = {
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
  },
};

async function getOrSeedContent(page: string): Promise<Record<string, unknown>> {
  const [existing] = await db.select().from(pageContentTable).where(eq(pageContentTable.page, page));
  if (existing) {
    return existing.content;
  }

  const defaults = DEFAULT_CONTENT[page] ?? {};
  const [created] = await db
    .insert(pageContentTable)
    .values({ page, content: defaults })
    .onConflictDoNothing({ target: pageContentTable.page })
    .returning();

  if (created) {
    return created.content;
  }

  const [row] = await db.select().from(pageContentTable).where(eq(pageContentTable.page, page));
  return row?.content ?? defaults;
}

router.get("/content/:page", async (req, res): Promise<void> => {
  const params = GetPageContentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const content = await getOrSeedContent(params.data.page);
  res.json(GetPageContentResponse.parse({ page: params.data.page, content }));
});

export default router;
