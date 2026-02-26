ALTER TABLE "viral_clip"
  ADD COLUMN "smart_crop_status" text,
  ADD COLUMN "smart_crop_storage_key" text,
  ADD COLUMN "smart_crop_storage_url" text;

CREATE INDEX "idx_viralClip_smartCropStatus" ON "viral_clip" ("smart_crop_status");
