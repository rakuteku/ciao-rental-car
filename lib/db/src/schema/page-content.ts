import { pgTable, serial, text, jsonb, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pageContentTable = pgTable(
  "page_content",
  {
    id: serial("id").primaryKey(),
    page: text("page").notNull(),
    content: jsonb("content").notNull().$type<Record<string, unknown>>(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [unique("page_content_page_unique").on(table.page)],
);

export const insertPageContentSchema = createInsertSchema(pageContentTable).omit({ id: true });
export type InsertPageContent = z.infer<typeof insertPageContentSchema>;
export type PageContent = typeof pageContentTable.$inferSelect;
