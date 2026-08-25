import { Router, type IRouter, type Request } from "express";
import { eq } from "drizzle-orm";
import { db, pageContentTable, pageSeoTable, roomsTable } from "@workspace/db";
import { KNOWN_PAGES } from "./content";
import { DEFAULT_SEO } from "./seo";

const router: IRouter = Router();

function resolveOrigin(req: Request): string {
  const origin = typeof req.query["origin"] === "string" ? req.query["origin"] : "";
  if (origin) {
    return origin.replace(/\/$/, "");
  }
  const proto = req.get("x-forwarded-proto") ?? req.protocol;
  const host = req.get("host") ?? "";
  return `${proto}://${host}`;
}

router.get("/sitemap.xml", async (req, res): Promise<void> => {
  const origin = resolveOrigin(req);

  const pageEntries = (await Promise.all(
    KNOWN_PAGES.map(async (page) => {
      const [contentRow] = await db.select().from(pageContentTable).where(eq(pageContentTable.page, page));
      const [seoRow] = await db.select().from(pageSeoTable).where(eq(pageSeoTable.page, page));

      if (seoRow?.allowIndexing === false) return null;
      const slug = seoRow?.slug ?? DEFAULT_SEO[page]?.slug ?? `/${page}`;
      const canonical = seoRow?.canonicalUrl || slug;
      const lastmodDate = contentRow?.updatedAt ?? seoRow?.updatedAt ?? new Date();
      const loc = canonical.startsWith("http") ? canonical : canonical === "/" ? origin || "/" : `${origin}${canonical}`;

      return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmodDate.toISOString()}</lastmod>\n  </url>`;
    }),
  )).filter((entry): entry is string => entry !== null);

  const publishedRooms = await db.select().from(roomsTable).where(eq(roomsTable.published, true));
  const lodgingEntries = [
    ...publishedRooms.map(
      (room) =>
        `  <url>\n    <loc>${origin}/lodging/${room.slug}</loc>\n    <lastmod>${room.updatedAt.toISOString()}</lastmod>\n  </url>`,
    ),
  ];

  const entries = [...pageEntries, ...lodgingEntries];

  res.set("Content-Type", "application/xml");
  res.send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`,
  );
});

router.get("/robots.txt", (req, res): void => {
  const origin = resolveOrigin(req);
  res.set("Content-Type", "text/plain");
  res.send(`User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`);
});

export default router;
