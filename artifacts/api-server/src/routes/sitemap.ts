import { Router, type IRouter, type Request } from "express";
import { eq } from "drizzle-orm";
import { db, pageContentTable, pageSeoTable } from "@workspace/db";
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

  const entries = await Promise.all(
    KNOWN_PAGES.map(async (page) => {
      const [contentRow] = await db.select().from(pageContentTable).where(eq(pageContentTable.page, page));
      const [seoRow] = await db.select().from(pageSeoTable).where(eq(pageSeoTable.page, page));

      const slug = seoRow?.slug ?? DEFAULT_SEO[page]?.slug ?? `/${page}`;
      const lastmodDate = contentRow?.updatedAt ?? seoRow?.updatedAt ?? new Date();
      const loc = slug === "/" ? origin || "/" : `${origin}${slug}`;

      return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmodDate.toISOString()}</lastmod>\n  </url>`;
    }),
  );

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
