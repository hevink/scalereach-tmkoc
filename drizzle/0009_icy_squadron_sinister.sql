CREATE TABLE "background_category" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"thumbnail_url" text,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "background_category_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "background_video" (
	"id" text PRIMARY KEY NOT NULL,
	"category_id" text NOT NULL,
	"display_name" text NOT NULL,
	"storage_key" text NOT NULL,
	"thumbnail_key" text,
	"duration" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"file_size" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "video_config" ALTER COLUMN "enable_emojis" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "video_config" ALTER COLUMN "enable_intro_title" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "thumbnail_key" text;--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "thumbnail_url" text;--> statement-breakpoint
ALTER TABLE "viral_clip" ADD COLUMN "clip_type" text;--> statement-breakpoint
ALTER TABLE "video_config" ADD COLUMN "clip_type" text DEFAULT 'viral-clips';--> statement-breakpoint
ALTER TABLE "video_config" ADD COLUMN "enable_split_screen" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "video_config" ADD COLUMN "split_screen_bg_video_id" text;--> statement-breakpoint
ALTER TABLE "video_config" ADD COLUMN "split_screen_bg_category_id" text;--> statement-breakpoint
ALTER TABLE "video_config" ADD COLUMN "split_ratio" integer DEFAULT 50;--> statement-breakpoint
ALTER TABLE "background_video" ADD CONSTRAINT "background_video_category_id_background_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."background_category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_bg_video_category" ON "background_video" USING btree ("category_id");