/**
 * Migration script to move R2 files from old structure to new hierarchical structure
 * 
 * Old structure:
 *   videos/{projectId}/{timestamp}-{filename}.m4a
 *   clips/{videoId}/{clipId}-{aspectRatio}.mp4
 *   thumbnails/{videoId}.jpg
 * 
 * New structure:
 *   {userId}/{videoId}/source.{ext}
 *   {userId}/{videoId}/thumbnail.jpg
 *   {userId}/{videoId}/audio.m4a
 *   {userId}/{videoId}/clips/{clipId}-{aspectRatio}.mp4
 *   {userId}/{videoId}/clips/{clipId}-{aspectRatio}-raw.mp4
 *   {userId}/{videoId}/clips/{clipId}-{aspectRatio}-thumb.jpg
 * 
 * Usage:
 *   npx tsx scripts/migrate-r2-storage.ts [--dry-run]
 */

import "dotenv/config";
import { db } from "../src/db";
import { video, viralClip } from "../src/db/schema";
import { eq } from "drizzle-orm";
import {
  S3Client,
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!;
const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

const endpoint = R2_ENDPOINT || `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

const s3Client = new S3Client({
  region: "auto",
  endpoint,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: !!R2_ENDPOINT,
});

const isDryRun = process.argv.includes("--dry-run");

interface MigrationResult {
  success: number;
  failed: number;
  skipped: number;
  errors: string[];
}

async function fileExists(key: string): Promise<boolean> {
  console.log(`    Checking if file exists: ${key}`);
  try {
    await s3Client.send(new HeadObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    }));
    console.log(`    ✓ File exists`);
    return true;
  } catch (error: any) {
    console.log(`    ✗ File not found: ${error.name}`);
    return false;
  }
}

async function copyFile(oldKey: string, newKey: string): Promise<boolean> {
  if (isDryRun) {
    console.log(`  [DRY RUN] Would copy: ${oldKey} -> ${newKey}`);
    return true;
  }

  try {
    await s3Client.send(new CopyObjectCommand({
      Bucket: R2_BUCKET_NAME,
      CopySource: `${R2_BUCKET_NAME}/${oldKey}`,
      Key: newKey,
    }));
    console.log(`  ✓ Copied: ${oldKey} -> ${newKey}`);
    return true;
  } catch (error) {
    console.error(`  ✗ Failed to copy ${oldKey}: ${error}`);
    return false;
  }
}

async function deleteFile(key: string): Promise<boolean> {
  if (isDryRun) {
    console.log(`  [DRY RUN] Would delete: ${key}`);
    return true;
  }

  try {
    await s3Client.send(new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    }));
    console.log(`  ✓ Deleted old file: ${key}`);
    return true;
  } catch (error) {
    console.error(`  ✗ Failed to delete ${key}: ${error}`);
    return false;
  }
}

function getPublicUrl(key: string): string {
  return R2_PUBLIC_URL
    ? `${R2_PUBLIC_URL}/${key}`
    : `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET_NAME}/${key}`;
}

function isOldStructure(key: string): boolean {
  // Old structure starts with videos/, clips/, or thumbnails/
  return key.startsWith("videos/") || key.startsWith("clips/") || key.startsWith("thumbnails/");
}

function getExtensionFromKey(key: string): string {
  const match = key.match(/\.([^.]+)$/);
  return match ? match[1] : "m4a";
}

async function migrateVideos(): Promise<MigrationResult> {
  console.log("\n📹 Migrating videos...\n");
  
  const result: MigrationResult = { success: 0, failed: 0, skipped: 0, errors: [] };
  
  const videos = await db.select().from(video);
  console.log(`Found ${videos.length} videos to check\n`);

  for (const v of videos) {
    console.log(`Processing video: ${v.id} (user: ${v.userId})`);
    
    if (!v.userId) {
      console.log(`  ⚠ Skipping - no userId`);
      result.skipped++;
      continue;
    }

    // Migrate storageKey (source video/audio)
    if (v.storageKey && isOldStructure(v.storageKey)) {
      const ext = getExtensionFromKey(v.storageKey);
      const newKey = `${v.userId}/${v.id}/source.${ext}`;
      
      if (await fileExists(v.storageKey)) {
        if (await copyFile(v.storageKey, newKey)) {
          if (!isDryRun) {
            await db.update(video).set({ 
              storageKey: newKey,
              storageUrl: getPublicUrl(newKey),
            }).where(eq(video.id, v.id));
          }
          await deleteFile(v.storageKey);
          result.success++;
        } else {
          result.failed++;
          result.errors.push(`Failed to migrate video storageKey: ${v.id}`);
        }
      } else {
        console.log(`  ⚠ Source file not found: ${v.storageKey}`);
        result.skipped++;
      }
    } else if (v.storageKey) {
      console.log(`  ⚠ Already migrated or different structure: ${v.storageKey}`);
      result.skipped++;
    }

    // Migrate audioStorageKey
    if (v.audioStorageKey && isOldStructure(v.audioStorageKey)) {
      const newKey = `${v.userId}/${v.id}/audio.m4a`;
      
      if (await fileExists(v.audioStorageKey)) {
        if (await copyFile(v.audioStorageKey, newKey)) {
          if (!isDryRun) {
            await db.update(video).set({ 
              audioStorageKey: newKey,
              audioStorageUrl: getPublicUrl(newKey),
            }).where(eq(video.id, v.id));
          }
          await deleteFile(v.audioStorageKey);
          result.success++;
        } else {
          result.failed++;
          result.errors.push(`Failed to migrate video audioStorageKey: ${v.id}`);
        }
      } else {
        console.log(`  ⚠ Audio file not found: ${v.audioStorageKey}`);
        result.skipped++;
      }
    }

    // Migrate thumbnailKey
    if (v.thumbnailKey && isOldStructure(v.thumbnailKey)) {
      const newKey = `${v.userId}/${v.id}/thumbnail.jpg`;
      
      if (await fileExists(v.thumbnailKey)) {
        if (await copyFile(v.thumbnailKey, newKey)) {
          if (!isDryRun) {
            await db.update(video).set({ 
              thumbnailKey: newKey,
              thumbnailUrl: getPublicUrl(newKey),
            }).where(eq(video.id, v.id));
          }
          await deleteFile(v.thumbnailKey);
          result.success++;
        } else {
          result.failed++;
          result.errors.push(`Failed to migrate video thumbnailKey: ${v.id}`);
        }
      } else {
        console.log(`  ⚠ Thumbnail file not found: ${v.thumbnailKey}`);
        result.skipped++;
      }
    }
  }

  return result;
}

async function migrateClips(): Promise<MigrationResult> {
  console.log("\n🎬 Migrating clips...\n");
  
  const result: MigrationResult = { success: 0, failed: 0, skipped: 0, errors: [] };
  
  const clips = await db.select({
    clip: viralClip,
    userId: video.userId,
  }).from(viralClip).leftJoin(video, eq(viralClip.videoId, video.id));
  
  console.log(`Found ${clips.length} clips to check\n`);

  for (const { clip, userId } of clips) {
    console.log(`Processing clip: ${clip.id} (video: ${clip.videoId})`);
    
    if (!userId) {
      console.log(`  ⚠ Skipping - no userId found for video`);
      result.skipped++;
      continue;
    }

    // Migrate storageKey (clip with captions)
    if (clip.storageKey && isOldStructure(clip.storageKey)) {
      // Extract aspect ratio from old key: clips/{videoId}/{clipId}-{aspectRatio}.mp4
      const aspectMatch = clip.storageKey.match(/-(\d+x\d+)\.mp4$/);
      const aspectRatio = aspectMatch ? aspectMatch[1] : "9x16";
      const newKey = `${userId}/${clip.videoId}/clips/${clip.id}-${aspectRatio}.mp4`;
      
      if (await fileExists(clip.storageKey)) {
        if (await copyFile(clip.storageKey, newKey)) {
          if (!isDryRun) {
            await db.update(viralClip).set({ 
              storageKey: newKey,
              storageUrl: getPublicUrl(newKey),
            }).where(eq(viralClip.id, clip.id));
          }
          await deleteFile(clip.storageKey);
          result.success++;
        } else {
          result.failed++;
          result.errors.push(`Failed to migrate clip storageKey: ${clip.id}`);
        }
      } else {
        console.log(`  ⚠ Clip file not found: ${clip.storageKey}`);
        result.skipped++;
      }
    } else if (clip.storageKey) {
      console.log(`  ⚠ Already migrated or different structure: ${clip.storageKey}`);
      result.skipped++;
    }

    // Migrate rawStorageKey (clip without captions)
    if (clip.rawStorageKey && isOldStructure(clip.rawStorageKey)) {
      const aspectMatch = clip.rawStorageKey.match(/-(\d+x\d+)-raw\.mp4$/);
      const aspectRatio = aspectMatch ? aspectMatch[1] : "9x16";
      const newKey = `${userId}/${clip.videoId}/clips/${clip.id}-${aspectRatio}-raw.mp4`;
      
      if (await fileExists(clip.rawStorageKey)) {
        if (await copyFile(clip.rawStorageKey, newKey)) {
          if (!isDryRun) {
            await db.update(viralClip).set({ 
              rawStorageKey: newKey,
              rawStorageUrl: getPublicUrl(newKey),
            }).where(eq(viralClip.id, clip.id));
          }
          await deleteFile(clip.rawStorageKey);
          result.success++;
        } else {
          result.failed++;
          result.errors.push(`Failed to migrate clip rawStorageKey: ${clip.id}`);
        }
      } else {
        console.log(`  ⚠ Raw clip file not found: ${clip.rawStorageKey}`);
        result.skipped++;
      }
    }

    // Migrate thumbnailKey
    if (clip.thumbnailKey && isOldStructure(clip.thumbnailKey)) {
      // Old: clips/{videoId}/{clipId}-{aspectRatio}-thumb.jpg or similar
      const newKey = `${userId}/${clip.videoId}/clips/${clip.id}-thumb.jpg`;
      
      if (await fileExists(clip.thumbnailKey)) {
        if (await copyFile(clip.thumbnailKey, newKey)) {
          if (!isDryRun) {
            await db.update(viralClip).set({ 
              thumbnailKey: newKey,
              thumbnailUrl: getPublicUrl(newKey),
            }).where(eq(viralClip.id, clip.id));
          }
          await deleteFile(clip.thumbnailKey);
          result.success++;
        } else {
          result.failed++;
          result.errors.push(`Failed to migrate clip thumbnailKey: ${clip.id}`);
        }
      } else {
        console.log(`  ⚠ Clip thumbnail not found: ${clip.thumbnailKey}`);
        result.skipped++;
      }
    }
  }

  return result;
}

async function main() {
  console.log("🚀 R2 Storage Migration Script");
  console.log("================================");
  
  if (isDryRun) {
    console.log("\n⚠️  DRY RUN MODE - No changes will be made\n");
  }

  console.log(`Bucket: ${R2_BUCKET_NAME}`);
  console.log(`Endpoint: ${endpoint}`);

  const videoResult = await migrateVideos();
  const clipResult = await migrateClips();

  console.log("\n================================");
  console.log("📊 Migration Summary");
  console.log("================================\n");

  console.log("Videos:");
  console.log(`  ✓ Success: ${videoResult.success}`);
  console.log(`  ✗ Failed: ${videoResult.failed}`);
  console.log(`  ⚠ Skipped: ${videoResult.skipped}`);

  console.log("\nClips:");
  console.log(`  ✓ Success: ${clipResult.success}`);
  console.log(`  ✗ Failed: ${clipResult.failed}`);
  console.log(`  ⚠ Skipped: ${clipResult.skipped}`);

  const totalErrors = [...videoResult.errors, ...clipResult.errors];
  if (totalErrors.length > 0) {
    console.log("\n❌ Errors:");
    totalErrors.forEach(e => console.log(`  - ${e}`));
  }

  if (isDryRun) {
    console.log("\n⚠️  This was a dry run. Run without --dry-run to apply changes.");
  }

  console.log("\n✅ Migration complete!");
  process.exit(0);
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
