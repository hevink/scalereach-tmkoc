import { relations } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { viralClip, CaptionStyleConfig } from "./project.schema";

/**
 * Caption word with timing information
 */
export interface CaptionWord {
  id: string;
  word: string;
  start: number;
  end: number;
}

/**
 * Text overlay with timing, position, and style
 */
export interface TextOverlayData {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontFamily: string;
  color: string;
  backgroundColor: string;
  backgroundOpacity: number;
  startTime: number;
  endTime: number;
  animation?: "none" | "fade-in" | "slide-up" | "typewriter";
}

/**
 * Clip Caption table - stores editable caption data per clip
 */
export const clipCaption = pgTable(
  "clip_caption",
  {
    id: text("id").primaryKey(),
    clipId: text("clip_id")
      .notNull()
      .unique()
      .references(() => viralClip.id, { onDelete: "cascade" }),
    words: jsonb("words").$type<CaptionWord[]>().notNull(),
    styleConfig: jsonb("style_config").$type<CaptionStyleConfig>(),
    templateId: text("template_id"),
    textOverlays: jsonb("text_overlays").$type<TextOverlayData[]>(),
    isEdited: boolean("is_edited").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    clipIdIdx: index("idx_clipCaption_clipId").on(table.clipId),
  })
);

export const clipCaptionRelations = relations(clipCaption, ({ one }) => ({
  clip: one(viralClip, {
    fields: [clipCaption.clipId],
    references: [viralClip.id],
  }),
}));
