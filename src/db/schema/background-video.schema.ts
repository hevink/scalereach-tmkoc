import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Background Category Table
 * Organizes background videos into categories (subway-surfer, minecraft, asmr, etc.)
 */
export const backgroundCategory = pgTable("background_category", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Background Video Table
 * Stores background video files used in split-screen clip generation
 */
export const backgroundVideo = pgTable(
  "background_video",
  {
    id: text("id").primaryKey(),
    categoryId: text("category_id")
      .notNull()
      .references(() => backgroundCategory.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    storageKey: text("storage_key").notNull(),
    thumbnailKey: text("thumbnail_key"),
    duration: integer("duration").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    fileSize: integer("file_size").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    categoryIdx: index("idx_bg_video_category").on(table.categoryId),
  })
);

// Relations
export const backgroundCategoryRelations = relations(backgroundCategory, ({ many }) => ({
  videos: many(backgroundVideo),
}));

export const backgroundVideoRelations = relations(backgroundVideo, ({ one }) => ({
  category: one(backgroundCategory, {
    fields: [backgroundVideo.categoryId],
    references: [backgroundCategory.id],
  }),
}));

// TypeScript types
export type BackgroundCategory = typeof backgroundCategory.$inferSelect;
export type NewBackgroundCategory = typeof backgroundCategory.$inferInsert;
export type BackgroundVideo = typeof backgroundVideo.$inferSelect;
export type NewBackgroundVideo = typeof backgroundVideo.$inferInsert;
