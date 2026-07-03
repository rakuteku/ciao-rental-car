import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, pageSeoTable } from "@workspace/db";
import {
  GetPageSeoParams,
  GetPageSeoResponse,
  UpdateAdminSeoParams,
  UpdateAdminSeoBody,
} from "@workspace/api-zod";
import { requireAdminAuth } from "../middlewares/admin-auth";

const router: IRouter = Router();

type SeoDefaults = {
  slug: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
};

export const DEFAULT_SEO: Record<string, SeoDefaults> = {
  home: {
    slug: "/",
    metaTitle: "CIAO Sapporo | All-in-One Lodging, Monthly Stay & Rental Car in Hokkaido",
    metaDescription:
      "Stay, live, and travel Hokkaido with CIAO in Sapporo — short-term lodging, monthly stays, and rental cars all in one convenient building near New Chitose Airport.",
    keywords: ["Sapporo lodging", "Hokkaido rental car", "monthly stay Sapporo", "CIAO Sapporo", "Hokkaido travel"],
    ogTitle: "CIAO Sapporo — All-in-One Package in Hokkaido",
    ogDescription:
      "Lodging, monthly stays, and rental cars in one Sapporo building. Your all-in-one base for exploring Hokkaido.",
    ogImage: "/hero-sapporo.png",
  },
  rentalcar: {
    slug: "/rentalcar",
    metaTitle: "Rental Cars in Sapporo | CIAO Hokkaido Car Rental",
    metaDescription:
      "Rent a car in Sapporo with CIAO — premium vehicles, transparent pricing, and easy pickup near New Chitose Airport for your Hokkaido road trip.",
    keywords: ["Sapporo car rental", "Hokkaido rental car", "New Chitose Airport car rental", "CIAO rental car"],
    ogTitle: "CIAO Rental Car — Explore Hokkaido at Your Own Pace",
    ogDescription:
      "Premium vehicles, flexible pickup locations, and fully insured options for your Hokkaido road trip.",
    ogImage: "/hero-sapporo.png",
  },
};

async function getOrSeedSeo(page: string) {
  const [existing] = await db.select().from(pageSeoTable).where(eq(pageSeoTable.page, page));
  if (existing) {
    return existing;
  }

  const defaults = DEFAULT_SEO[page];
  if (!defaults) {
    return null;
  }

  const [created] = await db
    .insert(pageSeoTable)
    .values({ page, ...defaults })
    .onConflictDoNothing({ target: pageSeoTable.page })
    .returning();

  if (created) {
    return created;
  }

  const [row] = await db.select().from(pageSeoTable).where(eq(pageSeoTable.page, page));
  return row ?? null;
}

router.get("/seo/:page", async (req, res): Promise<void> => {
  const params = GetPageSeoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const seo = await getOrSeedSeo(params.data.page);
  if (!seo) {
    res.status(404).json({ error: "Unknown page" });
    return;
  }

  res.json(GetPageSeoResponse.parse({ ...seo, updatedAt: seo.updatedAt.toISOString() }));
});

router.put("/admin/seo/:page", requireAdminAuth, async (req, res): Promise<void> => {
  const params = UpdateAdminSeoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (!(params.data.page in DEFAULT_SEO)) {
    res.status(400).json({ error: "Unknown page" });
    return;
  }

  const body = UpdateAdminSeoBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [updated] = await db
    .insert(pageSeoTable)
    .values({ page: params.data.page, ...body.data })
    .onConflictDoUpdate({
      target: pageSeoTable.page,
      set: { ...body.data, updatedAt: new Date() },
    })
    .returning();

  res.json(GetPageSeoResponse.parse({ ...updated, updatedAt: updated.updatedAt.toISOString() }));
});

export default router;
