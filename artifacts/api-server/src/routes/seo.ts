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

export type SupportedLanguage = "en" | "ja" | "zh-CN";
export type LocalizedString = { en: string; ja: string; "zh-CN": string };
export type LocalizedKeywords = { en: string[]; ja: string[]; "zh-CN": string[] };
export type SeoDefaults = {
  slug: string;
  slugs?: LocalizedString;
  metaTitle: LocalizedString;
  metaDescription: LocalizedString;
  keywords: LocalizedKeywords;
  ogTitle: LocalizedString;
  ogDescription: LocalizedString;
  ogImage: string;
  ogImageAlt: LocalizedString;
  canonicalUrl: string;
  canonicalUrls?: LocalizedString;
  allowIndexing: boolean;
};

const emptyLocalized = (): LocalizedString => ({ en: "", ja: "", "zh-CN": "" });
const emptyKeywords = (): LocalizedKeywords => ({ en: [], ja: [], "zh-CN": [] });

export const DEFAULT_SEO: Record<string, SeoDefaults> = {
  home: {
    slug: "/",
    metaTitle: { en: "CIAO Sapporo | All-in-One Lodging, Monthly Stay & Rental Car in Hokkaido", ja: "", "zh-CN": "" },
    metaDescription: { en: "Stay, live, and travel Hokkaido with CIAO in Sapporo — short-term lodging, monthly stays, and rental cars all in one convenient building near New Chitose Airport.", ja: "", "zh-CN": "" },
    keywords: { en: ["Sapporo lodging", "Hokkaido rental car", "monthly stay Sapporo", "CIAO Sapporo", "Hokkaido travel"], ja: [], "zh-CN": [] },
    ogTitle: { en: "CIAO Sapporo — All-in-One Package in Hokkaido", ja: "", "zh-CN": "" },
    ogDescription: { en: "Lodging, monthly stays, and rental cars in one Sapporo building. Your all-in-one base for exploring Hokkaido.", ja: "", "zh-CN": "" },
    ogImage: "/hero-sapporo.png",
    ogImageAlt: { en: "CIAO Sapporo lodging exterior", ja: "", "zh-CN": "" },
    canonicalUrl: "/",
    allowIndexing: true,
  },
  rentalcar: {
    slug: "/rentalcar",
    metaTitle: { en: "Rental Cars in Sapporo | CIAO Hokkaido Car Rental", ja: "", "zh-CN": "" },
    metaDescription: { en: "Rent a car in Sapporo with CIAO — premium vehicles, transparent pricing, and easy pickup near New Chitose Airport for your Hokkaido road trip.", ja: "", "zh-CN": "" },
    keywords: { en: ["Sapporo car rental", "Hokkaido rental car", "New Chitose Airport car rental", "CIAO rental car"], ja: [], "zh-CN": [] },
    ogTitle: { en: "CIAO Rental Car — Explore Hokkaido at Your Own Pace", ja: "", "zh-CN": "" },
    ogDescription: { en: "Premium vehicles, flexible pickup locations, and fully insured options for your Hokkaido road trip.", ja: "", "zh-CN": "" },
    ogImage: "/hero-sapporo.png",
    ogImageAlt: { en: "CIAO rental car in Hokkaido", ja: "", "zh-CN": "" },
    canonicalUrl: "/rentalcar",
    allowIndexing: true,
  },
  lodging: {
    slug: "/lodging",
    metaTitle: { en: "Short-Term Lodging in Sapporo | CIAO Hokkaido", ja: "", "zh-CN": "" },
    metaDescription: { en: "Book short-term rooms and studios in Sapporo with CIAO — comfortable stays near New Chitose Airport, perfect for your Hokkaido trip.", ja: "", "zh-CN": "" },
    keywords: { en: ["Sapporo short-term stay", "Sapporo lodging", "Hokkaido accommodation", "CIAO Sapporo rooms"], ja: [], "zh-CN": [] },
    ogTitle: { en: "CIAO Lodging — Short-Term Stays in Sapporo", ja: "", "zh-CN": "" },
    ogDescription: { en: "Comfortable short-term rooms and studios in Sapporo, part of the CIAO all-in-one Hokkaido package.", ja: "", "zh-CN": "" },
    ogImage: "/hero-sapporo.png",
    ogImageAlt: { en: "CIAO Sapporo short-term lodging", ja: "", "zh-CN": "" },
    canonicalUrl: "/lodging",
    allowIndexing: true,
  },
};

export function localizedRoute(language: SupportedLanguage, slug: string): string {
  const normalized = slug || "/";
  if (language === "en") return normalized;
  if (normalized === "/") return `/${language}`;
  return `/${language}${normalized.startsWith("/") ? normalized : `/${normalized}`}`;
}

export function normalizeSeo(
  page: string,
  seo: PageSeo,
): SeoDefaults & { page: string; updatedAt: string; slugs: LocalizedString; canonicalUrls: LocalizedString } {
  const fallback = DEFAULT_SEO[page];
  const fallbackSlug = fallback?.slug ?? `/${page}`;
  const slugs: LocalizedString = {
    en: seo.slugEn || seo.slug || fallbackSlug,
    ja: seo.slugJa || seo.slug || fallbackSlug,
    "zh-CN": seo.slugZhCn || "",
  };
  const canonicalUrls: LocalizedString = {
    en: seo.canonicalUrlEn || seo.canonicalUrl || fallback?.canonicalUrl || localizedRoute("en", slugs.en),
    ja: seo.canonicalUrlJa || localizedRoute("ja", slugs.ja || slugs.en),
    "zh-CN": seo.canonicalUrlZhCn || localizedRoute("zh-CN", slugs["zh-CN"] || slugs.en),
  };
  return {
    page: seo.page,
    slug: slugs.en,
    slugs,
    metaTitle: { en: seo.metaTitleEn || seo.metaTitle || fallback?.metaTitle.en || "", ja: seo.metaTitleJa || "", "zh-CN": seo.metaTitleZhCn || "" },
    metaDescription: { en: seo.metaDescriptionEn || seo.metaDescription || fallback?.metaDescription.en || "", ja: seo.metaDescriptionJa || "", "zh-CN": seo.metaDescriptionZhCn || "" },
    keywords: { en: seo.keywordsEn.length ? seo.keywordsEn : fallback?.keywords.en ?? [], ja: seo.keywordsJa, "zh-CN": seo.keywordsZhCn },
    ogTitle: { en: seo.ogTitleEn || seo.ogTitle || fallback?.ogTitle.en || "", ja: seo.ogTitleJa || "", "zh-CN": seo.ogTitleZhCn || "" },
    ogDescription: { en: seo.ogDescriptionEn || seo.ogDescription || fallback?.ogDescription.en || "", ja: seo.ogDescriptionJa || "", "zh-CN": seo.ogDescriptionZhCn || "" },
    ogImage: seo.ogImage || fallback?.ogImage || "",
    ogImageAlt: { en: seo.ogImageAltEn || fallback?.ogImageAlt.en || "", ja: seo.ogImageAltJa || "", "zh-CN": seo.ogImageAltZhCn || "" },
    canonicalUrl: canonicalUrls.en,
    canonicalUrls,
    allowIndexing: seo.allowIndexing,
    updatedAt: seo.updatedAt.toISOString(),
  };
}

export function seoValues(page: string, seo: SeoDefaults) {
  const slugs = seo.slugs ?? { en: seo.slug, ja: seo.slug, "zh-CN": "" };
  const canonicalUrls = seo.canonicalUrls ?? {
    en: seo.canonicalUrl,
    ja: localizedRoute("ja", slugs.ja || slugs.en),
    "zh-CN": localizedRoute("zh-CN", slugs["zh-CN"] || slugs.en),
  };
  return {
    page,
    slug: slugs.en,
    slugEn: slugs.en,
    slugJa: slugs.ja,
    slugZhCn: slugs["zh-CN"],
    metaTitle: seo.metaTitle.en,
    metaDescription: seo.metaDescription.en,
    keywords: seo.keywords.en,
    ogTitle: seo.ogTitle.en,
    ogDescription: seo.ogDescription.en,
    ogImage: seo.ogImage,
    metaTitleEn: seo.metaTitle.en,
    metaTitleJa: seo.metaTitle.ja,
    metaTitleZhCn: seo.metaTitle["zh-CN"],
    metaDescriptionEn: seo.metaDescription.en,
    metaDescriptionJa: seo.metaDescription.ja,
    metaDescriptionZhCn: seo.metaDescription["zh-CN"],
    keywordsEn: seo.keywords.en,
    keywordsJa: seo.keywords.ja,
    keywordsZhCn: seo.keywords["zh-CN"],
    ogTitleEn: seo.ogTitle.en,
    ogTitleJa: seo.ogTitle.ja,
    ogTitleZhCn: seo.ogTitle["zh-CN"],
    ogDescriptionEn: seo.ogDescription.en,
    ogDescriptionJa: seo.ogDescription.ja,
    ogDescriptionZhCn: seo.ogDescription["zh-CN"],
    ogImageAltEn: seo.ogImageAlt.en,
    ogImageAltJa: seo.ogImageAlt.ja,
    ogImageAltZhCn: seo.ogImageAlt["zh-CN"],
    canonicalUrl: canonicalUrls.en,
    canonicalUrlEn: canonicalUrls.en,
    canonicalUrlJa: canonicalUrls.ja,
    canonicalUrlZhCn: canonicalUrls["zh-CN"],
    allowIndexing: seo.allowIndexing,
  };
}

export async function getOrSeedSeo(page: string) {
  const [existing] = await db.select().from(pageSeoTable).where(eq(pageSeoTable.page, page));
  if (existing) return existing;
  const defaults = DEFAULT_SEO[page];
  if (!defaults) return null;
  const [created] = await db.insert(pageSeoTable).values(seoValues(page, defaults)).onConflictDoNothing({ target: pageSeoTable.page }).returning();
  if (created) return created;
  const [row] = await db.select().from(pageSeoTable).where(eq(pageSeoTable.page, page));
  return row ?? null;
}

export async function validateUniqueSlugs(slugs: LocalizedString, page?: string): Promise<string | null> {
  const rows = await db.select().from(pageSeoTable);
  for (const language of ["en", "ja", "zh-CN"] as const) {
    const candidate = slugs[language].trim();
    if (!candidate) continue;
    const conflict = rows.find((row) => {
      if (row.page === page) return false;
      const existing = language === "en" ? (row.slugEn || row.slug) : language === "ja" ? (row.slugJa || row.slug) : row.slugZhCn;
      return existing.trim() === candidate;
    });
    if (conflict) return `${language} URL slug "${candidate}" is already used by ${conflict.page}`;
  }
  return null;
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
  const existing = await getOrSeedSeo(params.data.page);
  if (!existing) return void res.status(404).json({ error: "Unknown page" });
  const body = UpdateAdminSeoBody.safeParse(req.body);
  if (!body.success) return void res.status(400).json({ error: body.error.message });
  const stored = normalizeSeo(params.data.page, existing);
  const input = body.data;
  const mergedSlugs: LocalizedString = {
    ...stored.slugs,
    ...(input.slugs ?? {}),
    ...(input.slug !== undefined ? { en: input.slug } : {}),
  };
  const slugError = await validateUniqueSlugs(mergedSlugs, params.data.page);
  if (slugError) return void res.status(400).json({ error: slugError });
  const merged: SeoDefaults = {
    slug: mergedSlugs.en,
    slugs: mergedSlugs,
    metaTitle: { ...stored.metaTitle, ...input.metaTitle },
    metaDescription: { ...stored.metaDescription, ...input.metaDescription },
    keywords: { ...stored.keywords, ...input.keywords },
    ogTitle: { ...stored.ogTitle, ...input.ogTitle },
    ogDescription: { ...stored.ogDescription, ...input.ogDescription },
    ogImage: input.ogImage ?? stored.ogImage,
    ogImageAlt: { ...stored.ogImageAlt, ...input.ogImageAlt },
    canonicalUrl: input.canonicalUrl ?? stored.canonicalUrl,
    canonicalUrls: { ...stored.canonicalUrls, ...input.canonicalUrls },
    allowIndexing: input.allowIndexing ?? stored.allowIndexing,
  };
  const values = seoValues(params.data.page, merged);
  const [updated] = await db.insert(pageSeoTable).values(values).onConflictDoUpdate({
    target: pageSeoTable.page,
    set: { ...values, updatedAt: new Date() },
  }).returning();
  res.json(GetPageSeoResponse.parse(normalizeSeo(params.data.page, updated)));
});

export { emptyLocalized, emptyKeywords };
export default router;