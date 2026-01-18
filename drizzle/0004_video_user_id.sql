-- Add userId column to video table and make projectId optional
ALTER TABLE "video" ADD COLUMN IF NOT EXISTS "user_id" text;
ALTER TABLE "video" ADD COLUMN IF NOT EXISTS "transcript" text;
ALTER TABLE "video" ADD COLUMN IF NOT EXISTS "transcript_words" jsonb;

-- Add foreign key constraint for user_id
ALTER TABLE "video" ADD CONSTRAINT "video_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- Make projectId nullable (drop NOT NULL constraint if exists)
ALTER TABLE "video" ALTER COLUMN "project_id" DROP NOT NULL;

-- Create index for user_id
CREATE INDEX IF NOT EXISTS "idx_video_userId" ON "video" ("user_id");
