import { pgTable, serial, text, jsonb, timestamp, unique } from "drizzle-orm/pg-core";
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
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [unique("page_seo_page_unique").on(table.page)],
);

export const insertPageSeoSchema = createInsertSchema(pageSeoTable).omit({ id: true });
export type InsertPageSeo = z.infer<typeof insertPageSeoSchema>;
export type PageSeo = typeof pageSeoTable.$inferSelect;
