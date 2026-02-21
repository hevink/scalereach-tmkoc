/**
 * Clean up orphaned files in storage that don't have corresponding database records
 * Usage: bun run scripts/cleanup-orphaned-files.ts [--dry-run]
 */

import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!;
const R2_ENDPOINT = process.env.R2_ENDPOINT;
const DATABASE_URL = process.env.DATABASE_URL!;

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

async function listAllFilesWithPrefix(prefix: string): Promise<string[]> {
  const files: string[] = [];
  let continuationToken: string | undefined;
  
  do {
    const response = await s3Client.send(new ListObjectsV2Command({
      Bucket: R2_BUCKET_NAME,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    
    for (const obj of response.Contents || []) {
      if (obj.Key) {
        files.push(obj.Key);
      }
    }
    
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);
  
  return files;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  
  console.log("Orphaned Files Cleanup");
  console.log("======================");
  console.log(`Mode: ${dryRun ? "DRY RUN (no deletions)" : "LIVE"}`);
  
  const client = postgres(DATABASE_URL);
  const db = drizzle(client);

  // Get all storage keys from database (videos, clips, thumbnails, audio, exports, dubbing)
  const videoKeys = await db.execute(sql`
    SELECT storage_key, audio_storage_key, thumbnail_key 
    FROM video 
    WHERE storage_key IS NOT NULL OR audio_storage_key IS NOT NULL OR thumbnail_key IS NOT NULL
  `);
  const clipKeys = await db.execute(sql`
    SELECT storage_key, raw_storage_key, thumbnail_key 
    FROM viral_clip 
    WHERE storage_key IS NOT NULL OR raw_storage_key IS NOT NULL OR thumbnail_key IS NOT NULL
  `);
  const exportKeys = await db.execute(sql`
    SELECT storage_key FROM video_export WHERE storage_key IS NOT NULL
  `);
  const dubbingKeys = await db.execute(sql`
    SELECT dubbed_audio_key, mixed_audio_key FROM voice_dubbing 
    WHERE dubbed_audio_key IS NOT NULL OR mixed_audio_key IS NOT NULL
  `);
  const clipAudioKeys = await db.execute(sql`
    SELECT audio_key FROM dubbed_clip_audio WHERE audio_key IS NOT NULL
  `);
  
  const dbKeys = new Set<string>();
  (videoKeys as any[]).forEach(r => {
    if (r.storage_key) dbKeys.add(r.storage_key);
    if (r.audio_storage_key) dbKeys.add(r.audio_storage_key);
    if (r.thumbnail_key) dbKeys.add(r.thumbnail_key);
  });
  (clipKeys as any[]).forEach(r => {
    if (r.storage_key) dbKeys.add(r.storage_key);
    if (r.raw_storage_key) dbKeys.add(r.raw_storage_key);
    if (r.thumbnail_key) dbKeys.add(r.thumbnail_key);
  });
  (exportKeys as any[]).forEach(r => r.storage_key && dbKeys.add(r.storage_key));
  (dubbingKeys as any[]).forEach(r => {
    if (r.dubbed_audio_key) dbKeys.add(r.dubbed_audio_key);
    if (r.mixed_audio_key) dbKeys.add(r.mixed_audio_key);
  });
  (clipAudioKeys as any[]).forEach(r => r.audio_key && dbKeys.add(r.audio_key));
  
  console.log(`\nFound ${dbKeys.size} storage keys in database`);

  // List all files in storage from various prefixes
  // Old structure: videos/, clips/, thumbnails/
  // New structure: {userId}/{videoId}/...
  // Dubbing: dubbing/
  console.log("\nScanning storage for files...");
  
  const allFiles: string[] = [];
  
  // Scan old structure prefixes
  const oldPrefixes = ["videos/", "clips/", "thumbnails/"];
  for (const prefix of oldPrefixes) {
    const files = await listAllFilesWithPrefix(prefix);
    allFiles.push(...files);
    console.log(`  Found ${files.length} files in ${prefix}`);
  }
  
  // Scan dubbing prefix
  const dubbingFiles = await listAllFilesWithPrefix("dubbing/");
  allFiles.push(...dubbingFiles);
  console.log(`  Found ${dubbingFiles.length} files in dubbing/`);
  
  // For new structure, we need to scan user prefixes
  // Get all user IDs from database
  const userIds = await db.execute(sql`SELECT id FROM "user"`);
  for (const row of userIds as any[]) {
    const files = await listAllFilesWithPrefix(`${row.id}/`);
    allFiles.push(...files);
    if (files.length > 0) {
      console.log(`  Found ${files.length} files in ${row.id}/`);
    }
  }

  // Find orphaned files
  const orphanedFiles = allFiles.filter(key => !dbKeys.has(key));

  console.log(`\nTotal files in storage: ${allFiles.length}`);
  console.log(`Orphaned files: ${orphanedFiles.length}`);

  if (orphanedFiles.length === 0) {
    console.log("\n✓ No orphaned files to clean up");
    await client.end();
    process.exit(0);
  }

  console.log("\nOrphaned files:");
  orphanedFiles.slice(0, 50).forEach(f => console.log(`  - ${f}`));
  if (orphanedFiles.length > 50) {
    console.log(`  ... and ${orphanedFiles.length - 50} more`);
  }

  if (dryRun) {
    console.log("\n[DRY RUN] Would delete the above files. Run without --dry-run to delete.");
  } else {
    console.log("\nDeleting orphaned files...");
    let deleted = 0;
    let failed = 0;
    for (const key of orphanedFiles) {
      try {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: key,
        }));
        deleted++;
        if (deleted % 10 === 0) {
          console.log(`  Progress: ${deleted}/${orphanedFiles.length} deleted`);
        }
      } catch (err: any) {
        failed++;
        console.log(`  ✗ Failed to delete ${key}: ${err.message}`);
      }
    }
    console.log(`\n✓ Cleanup complete: ${deleted} deleted, ${failed} failed`);
  }

  await client.end();
  process.exit(0);
}

main().catch(console.error);
