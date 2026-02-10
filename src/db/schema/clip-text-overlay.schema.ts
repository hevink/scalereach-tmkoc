import { relations } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { viralClip } from "./project.schema";

/**
 * Text overlay data — mirrors the frontend TextOverlay interface
 */
export interface TextOverlayData {
  id: string;
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: "normal" | "bold";
  fontStyle: "normal" | "italic";
  textColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  alignment: "left" | "center" | "right";
  x: number;
  y: number;
  rotation: number;
  shadow: boolean;
  outline: boolean;
  outlineColor: string;
  startTime: number;
  endTime: number;
}

/**
 * Clip Text Overlay table — stores user-created text overlays per clip
 */
export const clipTextOverlay = pgTable(
  "clip_text_overlay",
  {
    id: text("id").primaryKey(),
    clipId: text("clip_id")
      .notNull()
      .unique()
      .references(() => viralClip.id, { onDelete: "cascade" }),
    overlays: jsonb("overlays").$type<TextOverlayData[]>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    clipIdIdx: index("idx_clipTextOverlay_clipId").on(table.clipId),
  })
);

export const clipTextOverlayRelations = relations(clipTextOverlay, ({ one }) => ({
  clip: one(viralClip, {
    fields: [clipTextOverlay.clipId],
    references: [viralClip.id],
  }),
}));
