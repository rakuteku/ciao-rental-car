import { Router, type IRouter, type Request } from "express";
import { eq } from "drizzle-orm";
import { db, pageContentTable, pageSeoTable, roomsTable } from "@workspace/db";
import { KNOWN_PAGES } from "./content";
import { DEFAULT_SEO, localizedRoute, normalizeSeo, type SupportedLanguage } from "./seo";

const router: IRouter = Router();
const languages: SupportedLanguage[] = ["en", "ja", "zh-CN"];

function resolveOrigin(req: Request): string {
  const origin = typeof req.query["origin"] === "string" ? req.query["origin"] : "";
  if (origin) return origin.replace(/\/$/, "");
  const proto = req.get("x-forwarded-proto") ?? req.protocol;
  const host = req.get("host") ?? "";
  return `${proto}://${host}`;
}

function xml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function absolute(origin: string, path: string): string {
  return path.startsWith("http") ? path : `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

router.get("/sitemap.xml", async (req, res): Promise<void> => {
  const origin = resolveOrigin(req);
  const rows = await db.select().from(pageContentTable);
  const seoRows = await db.select().from(pageSeoTable);
  const pageEntries: string[] = [];

  for (const row of rows) {
    if (!row.published) continue;
    const seoRow = seoRows.find((candidate) => candidate.page === row.page);
    if (!seoRow) continue;
    const seo = normalizeSeo(row.page, seoRow);
    if (!seo.allowIndexing) continue;
    for (const language of languages) {
      const route = localizedRoute(language, seo.slugs[language] || seo.slugs.en);
      pageEntries.push(`  <url>\n    <loc>${xml(absolute(origin, route))}</loc>\n    <lastmod>${row.updatedAt.toISOString()}</lastmod>\n  </url>`);
    }
  }

  // Seeded built-in pages can be absent until first requested. Keep their legacy
  // English URLs in the sitemap while the normal page query remains additive.
  for (const page of KNOWN_PAGES) {
    if (rows.some((row) => row.page === page)) continue;
    const defaults = DEFAULT_SEO[page];
    if (!defaults || !defaults.allowIndexing) continue;
    for (const language of languages) {
      pageEntries.push(`  <url>\n    <loc>${xml(absolute(origin, localizedRoute(language, defaults.slug)))}</loc>\n  </url>`);
    }
  }

  const publishedRooms = await db.select().from(roomsTable).where(eq(roomsTable.published, true));
  const lodgingEntries = publishedRooms.map(
    (room) => `  <url>\n    <loc>${xml(absolute(origin, `/lodging/${room.slug}`))}</loc>\n    <lastmod>${room.updatedAt.toISOString()}</lastmod>\n  </url>`,
  );

  res.set("Content-Type", "application/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...pageEntries, ...lodgingEntries].join("\n")}\n</urlset>\n`);
});

router.get("/robots.txt", (req, res): void => {
  const origin = resolveOrigin(req);
  res.set("Content-Type", "text/plain");
  res.send(`User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`);
});

export default router;