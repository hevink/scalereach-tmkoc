-- Add workspaceId to video table
ALTER TABLE "video" ADD COLUMN "workspace_id" text REFERENCES "workspace"("id") ON DELETE CASCADE;

-- Create index for workspace_id
CREATE INDEX "idx_video_workspaceId" ON "video" ("workspace_id");
