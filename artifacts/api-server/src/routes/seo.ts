import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, pageSeoTable, type PageSeo } from "@workspace/db";
import {
  GetPageSeoParams,
  GetPageSeoResponse,
  UpdateAdminSeoParams,
  UpdateAdminSeoBody,
} from "@workspace/api-zod";
import { requireAdminAuth } from "../middlewares/admin-auth";

const router: IRouter = Router();

type LocalizedString = { en: string; ja: string };
type LocalizedKeywords = { en: string[]; ja: string[] };
type SeoDefaults = {
  slug: string;
  metaTitle: LocalizedString;
  metaDescription: LocalizedString;
  keywords: LocalizedKeywords;
  ogTitle: LocalizedString;
  ogDescription: LocalizedString;
  ogImage: string;
  ogImageAlt: LocalizedString;
  canonicalUrl: string;
  allowIndexing: boolean;
};

export const DEFAULT_SEO: Record<string, SeoDefaults> = {
  home: {
    slug: "/",
    metaTitle: { en: "CIAO Sapporo | All-in-One Lodging, Monthly Stay & Rental Car in Hokkaido", ja: "" },
    metaDescription: { en: "Stay, live, and travel Hokkaido with CIAO in Sapporo — short-term lodging, monthly stays, and rental cars all in one convenient building near New Chitose Airport.", ja: "" },
    keywords: { en: ["Sapporo lodging", "Hokkaido rental car", "monthly stay Sapporo", "CIAO Sapporo", "Hokkaido travel"], ja: [] },
    ogTitle: { en: "CIAO Sapporo — All-in-One Package in Hokkaido", ja: "" },
    ogDescription: { en: "Lodging, monthly stays, and rental cars in one Sapporo building. Your all-in-one base for exploring Hokkaido.", ja: "" },
    ogImage: "/hero-sapporo.png",
    ogImageAlt: { en: "CIAO Sapporo lodging exterior", ja: "" },
    canonicalUrl: "/",
    allowIndexing: true,
  },
  rentalcar: {
    slug: "/rentalcar",
    metaTitle: { en: "Rental Cars in Sapporo | CIAO Hokkaido Car Rental", ja: "" },
    metaDescription: { en: "Rent a car in Sapporo with CIAO — premium vehicles, transparent pricing, and easy pickup near New Chitose Airport for your Hokkaido road trip.", ja: "" },
    keywords: { en: ["Sapporo car rental", "Hokkaido rental car", "New Chitose Airport car rental", "CIAO rental car"], ja: [] },
    ogTitle: { en: "CIAO Rental Car — Explore Hokkaido at Your Own Pace", ja: "" },
    ogDescription: { en: "Premium vehicles, flexible pickup locations, and fully insured options for your Hokkaido road trip.", ja: "" },
    ogImage: "/hero-sapporo.png",
    ogImageAlt: { en: "CIAO rental car in Hokkaido", ja: "" },
    canonicalUrl: "/rentalcar",
    allowIndexing: true,
  },
  lodging: {
    slug: "/lodging",
    metaTitle: { en: "Short-Term Lodging in Sapporo | CIAO Hokkaido", ja: "" },
    metaDescription: { en: "Book short-term rooms and studios in Sapporo with CIAO — comfortable stays near New Chitose Airport, perfect for your Hokkaido trip.", ja: "" },
    keywords: { en: ["Sapporo short-term stay", "Sapporo lodging", "Hokkaido accommodation", "CIAO Sapporo rooms"], ja: [] },
    ogTitle: { en: "CIAO Lodging — Short-Term Stays in Sapporo", ja: "" },
    ogDescription: { en: "Comfortable short-term rooms and studios in Sapporo, part of the CIAO all-in-one Hokkaido package.", ja: "" },
    ogImage: "/hero-sapporo.png",
    ogImageAlt: { en: "CIAO Sapporo short-term lodging", ja: "" },
    canonicalUrl: "/lodging",
    allowIndexing: true,
  },
};

function localized(en: string, ja: string): LocalizedString {
  return { en, ja };
}

function normalizeSeo(page: string, seo: PageSeo): SeoDefaults & { page: string; updatedAt: string } {
  const fallback = DEFAULT_SEO[page];
  return {
    page: seo.page,
    slug: seo.slug || fallback.slug,
    metaTitle: localized(seo.metaTitleEn || seo.metaTitle || fallback.metaTitle.en, seo.metaTitleJa || fallback.metaTitle.ja),
    metaDescription: localized(seo.metaDescriptionEn || seo.metaDescription || fallback.metaDescription.en, seo.metaDescriptionJa || fallback.metaDescription.ja),
    keywords: { en: seo.keywordsEn.length ? seo.keywordsEn : seo.keywords.length ? seo.keywords : fallback.keywords.en, ja: seo.keywordsJa.length ? seo.keywordsJa : fallback.keywords.ja },
    ogTitle: localized(seo.ogTitleEn || seo.ogTitle || fallback.ogTitle.en, seo.ogTitleJa || fallback.ogTitle.ja),
    ogDescription: localized(seo.ogDescriptionEn || seo.ogDescription || fallback.ogDescription.en, seo.ogDescriptionJa || fallback.ogDescription.ja),
    ogImage: seo.ogImage || fallback.ogImage,
    ogImageAlt: localized(seo.ogImageAltEn || fallback.ogImageAlt.en, seo.ogImageAltJa || fallback.ogImageAlt.ja),
    canonicalUrl: seo.canonicalUrl || fallback.canonicalUrl,
    allowIndexing: seo.allowIndexing,
    updatedAt: seo.updatedAt.toISOString(),
  };
}

function seoValues(page: string, seo: SeoDefaults) {
  return {
    page,
    slug: seo.slug,
    // Keep old scalar columns populated for safe rollback and legacy records.
    metaTitle: seo.metaTitle.en, metaDescription: seo.metaDescription.en, keywords: seo.keywords.en,
    ogTitle: seo.ogTitle.en, ogDescription: seo.ogDescription.en, ogImage: seo.ogImage,
    metaTitleEn: seo.metaTitle.en, metaTitleJa: seo.metaTitle.ja,
    metaDescriptionEn: seo.metaDescription.en, metaDescriptionJa: seo.metaDescription.ja,
    keywordsEn: seo.keywords.en, keywordsJa: seo.keywords.ja,
    ogTitleEn: seo.ogTitle.en, ogTitleJa: seo.ogTitle.ja,
    ogDescriptionEn: seo.ogDescription.en, ogDescriptionJa: seo.ogDescription.ja,
    ogImageAltEn: seo.ogImageAlt.en, ogImageAltJa: seo.ogImageAlt.ja,
    canonicalUrl: seo.canonicalUrl, allowIndexing: seo.allowIndexing,
  };
}

async function getOrSeedSeo(page: string) {
  const [existing] = await db.select().from(pageSeoTable).where(eq(pageSeoTable.page, page));
  if (existing) return existing;
  const defaults = DEFAULT_SEO[page];
  if (!defaults) return null;
  const [created] = await db.insert(pageSeoTable).values(seoValues(page, defaults)).onConflictDoNothing({ target: pageSeoTable.page }).returning();
  if (created) return created;
  const [row] = await db.select().from(pageSeoTable).where(eq(pageSeoTable.page, page));
  return row ?? null;
}

router.get("/seo/:page", async (req, res): Promise<void> => {
  const params = GetPageSeoParams.safeParse(req.params);
  if (!params.success) return void res.status(400).json({ error: params.error.message });
  const seo = await getOrSeedSeo(params.data.page);
  if (!seo) return void res.status(404).json({ error: "Unknown page" });
  res.json(GetPageSeoResponse.parse(normalizeSeo(params.data.page, seo)));
});

router.put("/admin/seo/:page", requireAdminAuth, async (req, res): Promise<void> => {
  const params = UpdateAdminSeoParams.safeParse(req.params);
  if (!params.success) return void res.status(400).json({ error: params.error.message });
  if (!(params.data.page in DEFAULT_SEO)) return void res.status(400).json({ error: "Unknown page" });
  const body = UpdateAdminSeoBody.safeParse(req.body);
  if (!body.success) return void res.status(400).json({ error: body.error.message });

  const existing = await getOrSeedSeo(params.data.page);
  if (!existing) return void res.status(404).json({ error: "Unknown page" });
  const stored = normalizeSeo(params.data.page, existing);
  const input = body.data;
  const merged: SeoDefaults = {
    slug: input.slug ?? stored.slug,
    metaTitle: { ...stored.metaTitle, ...input.metaTitle },
    metaDescription: { ...stored.metaDescription, ...input.metaDescription },
    keywords: { ...stored.keywords, ...input.keywords },
    ogTitle: { ...stored.ogTitle, ...input.ogTitle },
    ogDescription: { ...stored.ogDescription, ...input.ogDescription },
    ogImage: input.ogImage ?? stored.ogImage,
    ogImageAlt: { ...stored.ogImageAlt, ...input.ogImageAlt },
    canonicalUrl: input.canonicalUrl ?? stored.canonicalUrl,
    allowIndexing: input.allowIndexing ?? stored.allowIndexing,
  };
  const values = seoValues(params.data.page, merged);
  const [updated] = await db.insert(pageSeoTable).values(values).onConflictDoUpdate({
    target: pageSeoTable.page,
    set: { ...values, updatedAt: new Date() },
  }).returning();
  res.json(GetPageSeoResponse.parse(normalizeSeo(params.data.page, updated)));
});

export default router;