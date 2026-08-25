import { boolean, pgTable, serial, text, jsonb, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pageSeoTable = pgTable(
  "page_seo",
  {
    id: serial("id").primaryKey(),
    page: text("page").notNull(),
    slug: text("slug").notNull(),
    metaTitle: text("meta_title").notNull(),
    metaDescription: text("meta_description").notNull(),
    keywords: jsonb("keywords").notNull().$type<string[]>().default([]),
    ogTitle: text("og_title").notNull(),
    ogDescription: text("og_description").notNull(),
    ogImage: text("og_image").notNull().default(""),
    // The original scalar columns remain so existing rows can be read safely.
    // Localized columns are the canonical values for new writes.
    metaTitleEn: text("meta_title_en").notNull().default(""),
    metaTitleJa: text("meta_title_ja").notNull().default(""),
    metaDescriptionEn: text("meta_description_en").notNull().default(""),
    metaDescriptionJa: text("meta_description_ja").notNull().default(""),
    keywordsEn: jsonb("keywords_en").notNull().$type<string[]>().default([]),
    keywordsJa: jsonb("keywords_ja").notNull().$type<string[]>().default([]),
    ogTitleEn: text("og_title_en").notNull().default(""),
    ogTitleJa: text("og_title_ja").notNull().default(""),
    ogDescriptionEn: text("og_description_en").notNull().default(""),
    ogDescriptionJa: text("og_description_ja").notNull().default(""),
    ogImageAltEn: text("og_image_alt_en").notNull().default(""),
    ogImageAltJa: text("og_image_alt_ja").notNull().default(""),
    canonicalUrl: text("canonical_url").notNull().default(""),
    allowIndexing: boolean("allow_indexing").notNull().default(true),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [unique("page_seo_page_unique").on(table.page)],
);

export const insertPageSeoSchema = createInsertSchema(pageSeoTable).omit({ id: true });
export type InsertPageSeo = z.infer<typeof insertPageSeoSchema>;
export type PageSeo = typeof pageSeoTable.$inferSelect;
