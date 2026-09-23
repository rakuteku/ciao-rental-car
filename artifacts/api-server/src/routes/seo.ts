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
    metaTitle: { en: "CIAO Sapporo | All-in-One Lodging, Monthly Stay & Rental Car in Hokkaido", ja: "CIAO札幌｜北海道の宿泊・マンスリーステイ・レンタカー", "zh-CN": "CIAO札幌｜北海道住宿、月租与租车一站式服务" },
    metaDescription: { en: "Stay, live, and travel Hokkaido with CIAO in Sapporo — short-term lodging, monthly stays, and rental cars all in one convenient building near New Chitose Airport.", ja: "札幌のCIAOで北海道に滞在し、暮らし、旅を楽しみましょう。新千歳空港から便利な短期滞在、マンスリーステイ、レンタカーをご用意しています。", "zh-CN": "在札幌 CIAO 一站式安排北海道住宿、月租和租车，位置便利，靠近新千岁机场。" },
    keywords: { en: ["Sapporo lodging", "Hokkaido rental car", "monthly stay Sapporo", "CIAO Sapporo", "Hokkaido travel"], ja: [], "zh-CN": [] },
    ogTitle: { en: "CIAO Sapporo — All-in-One Package in Hokkaido", ja: "CIAO札幌 — 北海道旅行を一つの拠点から", "zh-CN": "CIAO札幌 — 从一个地点探索北海道" },
    ogDescription: { en: "Lodging, monthly stays, and rental cars in one Sapporo building. Your all-in-one base for exploring Hokkaido.", ja: "札幌の一つの建物で宿泊、マンスリーステイ、レンタカーをまとめて計画できます。", "zh-CN": "在札幌同一栋楼内安排住宿、月租和租车，轻松探索北海道。" },
    ogImage: "/hero-sapporo.png",
    ogImageAlt: { en: "CIAO Sapporo lodging exterior", ja: "CIAO札幌の宿泊施設", "zh-CN": "CIAO札幌住宿外观" },
    canonicalUrl: "/",
    allowIndexing: true,
  },
  rentalcar: {
    slug: "/rentalcar",
    metaTitle: { en: "Rental Cars in Sapporo | CIAO Hokkaido Car Rental", ja: "札幌のレンタカー｜CIAO北海道レンタカー", "zh-CN": "札幌租车｜CIAO北海道租车服务" },
    metaDescription: { en: "Rent a car in Sapporo with CIAO — premium vehicles, transparent pricing, and easy pickup near New Chitose Airport for your Hokkaido road trip.", ja: "CIAO札幌で北海道ドライブにぴったりのレンタカーを。新千歳空港から便利に受け取れ、料金も明瞭です。", "zh-CN": "在 CIAO 札幌租车，享受优质车型、透明价格和靠近新千岁机场的便利取车服务。" },
    keywords: { en: ["Sapporo car rental", "Hokkaido rental car", "New Chitose Airport car rental", "CIAO rental car"], ja: [], "zh-CN": [] },
    ogTitle: { en: "CIAO Rental Car — Explore Hokkaido at Your Own Pace", ja: "CIAOレンタカー — 自分のペースで北海道を旅する", "zh-CN": "CIAO租车 — 按自己的节奏探索北海道" },
    ogDescription: { en: "Premium vehicles, flexible pickup locations, and fully insured options for your Hokkaido road trip.", ja: "北海道ドライブに便利な車種、柔軟な受取場所、安心の保険オプション。", "zh-CN": "适合北海道自驾的优质车型、灵活取车地点和全面保险选项。" },
    ogImage: "/hero-sapporo.png",
    ogImageAlt: { en: "CIAO rental car in Hokkaido", ja: "北海道を走るCIAOレンタカー", "zh-CN": "北海道的 CIAO 租车" },
    canonicalUrl: "/rentalcar",
    allowIndexing: true,
  },
  lodging: {
    slug: "/lodging",
    metaTitle: { en: "Short-Term Lodging in Sapporo | CIAO Hokkaido", ja: "札幌の短期滞在｜CIAO北海道", "zh-CN": "札幌短期住宿｜CIAO北海道" },
    metaDescription: { en: "Book short-term rooms and studios in Sapporo with CIAO — comfortable stays near New Chitose Airport, perfect for your Hokkaido trip.", ja: "CIAO札幌で快適な短期滞在を。新千歳空港からも便利で、北海道旅行の拠点に最適です。", "zh-CN": "在 CIAO 札幌预订舒适的短期房间，靠近新千岁机场，是北海道旅行的理想据点。" },
    keywords: { en: ["Sapporo short-term stay", "Sapporo lodging", "Hokkaido accommodation", "CIAO Sapporo rooms"], ja: [], "zh-CN": [] },
    ogTitle: { en: "CIAO Lodging — Short-Term Stays in Sapporo", ja: "CIAO宿泊 — 札幌の短期滞在", "zh-CN": "CIAO住宿 — 札幌短期住宿" },
    ogDescription: { en: "Comfortable short-term rooms and studios in Sapporo, part of the CIAO all-in-one Hokkaido package.", ja: "札幌の快適な短期滞在。CIAOの北海道一体型旅行プランの一部です。", "zh-CN": "札幌舒适的短期房间，属于 CIAO 北海道一站式旅程。" },
    ogImage: "/hero-sapporo.png",
    ogImageAlt: { en: "CIAO Sapporo short-term lodging", ja: "CIAO札幌の短期滞在施設", "zh-CN": "CIAO札幌短期住宿" },
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
    ja: seo.slugJa || fallback?.slugs?.ja || seo.slug || fallbackSlug,
    "zh-CN": seo.slugZhCn || fallback?.slugs?.["zh-CN"] || seo.slug || fallbackSlug,
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
    metaTitle: { en: seo.metaTitleEn || seo.metaTitle || fallback?.metaTitle.en || "", ja: seo.metaTitleJa || fallback?.metaTitle.ja || "", "zh-CN": seo.metaTitleZhCn || fallback?.metaTitle["zh-CN"] || "" },
    metaDescription: { en: seo.metaDescriptionEn || seo.metaDescription || fallback?.metaDescription.en || "", ja: seo.metaDescriptionJa || fallback?.metaDescription.ja || "", "zh-CN": seo.metaDescriptionZhCn || fallback?.metaDescription["zh-CN"] || "" },
    keywords: { en: seo.keywordsEn.length ? seo.keywordsEn : fallback?.keywords.en ?? [], ja: seo.keywordsJa.length ? seo.keywordsJa : fallback?.keywords.ja ?? [], "zh-CN": seo.keywordsZhCn.length ? seo.keywordsZhCn : fallback?.keywords["zh-CN"] ?? [] },
    ogTitle: { en: seo.ogTitleEn || seo.ogTitle || fallback?.ogTitle.en || "", ja: seo.ogTitleJa || fallback?.ogTitle.ja || "", "zh-CN": seo.ogTitleZhCn || fallback?.ogTitle["zh-CN"] || "" },
    ogDescription: { en: seo.ogDescriptionEn || seo.ogDescription || fallback?.ogDescription.en || "", ja: seo.ogDescriptionJa || fallback?.ogDescription.ja || "", "zh-CN": seo.ogDescriptionZhCn || fallback?.ogDescription["zh-CN"] || "" },
    ogImage: seo.ogImage || fallback?.ogImage || "",
    ogImageAlt: { en: seo.ogImageAltEn || fallback?.ogImageAlt.en || "", ja: seo.ogImageAltJa || fallback?.ogImageAlt.ja || "", "zh-CN": seo.ogImageAltZhCn || fallback?.ogImageAlt["zh-CN"] || "" },
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