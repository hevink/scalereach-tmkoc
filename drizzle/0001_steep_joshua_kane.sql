ALTER TABLE "video" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "transcript" text;--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "transcript_words" jsonb;--> statement-breakpoint
ALTER TABLE "video" ADD CONSTRAINT "video_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_video_userId" ON "video" USING btree ("user_id");