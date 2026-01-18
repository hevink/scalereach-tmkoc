CREATE TABLE "viral_clip" (
	"id" text PRIMARY KEY NOT NULL,
	"video_id" text NOT NULL,
	"start_time" integer NOT NULL,
	"end_time" integer NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"reason" text,
	"transcript" text,
	"storage_key" text,
	"storage_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"token" text NOT NULL,
	"invited_by" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"accepted_at" timestamp,
	CONSTRAINT "workspace_invitation_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "video" DROP CONSTRAINT "video_user_id_user_id_fk";
--> statement-breakpoint
DROP INDEX "idx_video_userId";--> statement-breakpoint
ALTER TABLE "video" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "viral_clip" ADD CONSTRAINT "viral_clip_video_id_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."video"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitation" ADD CONSTRAINT "workspace_invitation_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitation" ADD CONSTRAINT "workspace_invitation_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_viralClip_videoId" ON "viral_clip" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "idx_viralClip_status" ON "viral_clip" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_viralClip_score" ON "viral_clip" USING btree ("score");--> statement-breakpoint
CREATE INDEX "idx_invitation_workspaceId" ON "workspace_invitation" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_invitation_email" ON "workspace_invitation" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_invitation_token" ON "workspace_invitation" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_invitation_status" ON "workspace_invitation" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_invitation_workspace_email" ON "workspace_invitation" USING btree ("workspace_id","email");--> statement-breakpoint
ALTER TABLE "video" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "video" DROP COLUMN "transcript";--> statement-breakpoint
ALTER TABLE "video" DROP COLUMN "transcript_words";