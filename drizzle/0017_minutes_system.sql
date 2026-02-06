CREATE TABLE IF NOT EXISTS "workspace_minutes" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"minutes_total" integer DEFAULT 0 NOT NULL,
	"minutes_used" integer DEFAULT 0 NOT NULL,
	"minutes_remaining" integer DEFAULT 0 NOT NULL,
	"minutes_reset_date" timestamp,
	"editing_operations_used" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_minutes_workspace_id_unique" UNIQUE("workspace_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "minute_transaction" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text,
	"video_id" text,
	"type" text NOT NULL,
	"minutes_amount" integer NOT NULL,
	"minutes_before" integer NOT NULL,
	"minutes_after" integer NOT NULL,
	"description" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "regeneration_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "minutes_consumed" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_minutes" ADD CONSTRAINT "workspace_minutes_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "minute_transaction" ADD CONSTRAINT "minute_transaction_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "minute_transaction" ADD CONSTRAINT "minute_transaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "minute_transaction" ADD CONSTRAINT "minute_transaction_video_id_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."video"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_workspace_minutes_workspace_id" ON "workspace_minutes" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_minute_transaction_workspace_id" ON "minute_transaction" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_minute_transaction_user_id" ON "minute_transaction" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_minute_transaction_video_id" ON "minute_transaction" USING btree ("video_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_minute_transaction_type" ON "minute_transaction" USING btree ("type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_minute_transaction_created_at" ON "minute_transaction" USING btree ("created_at");
