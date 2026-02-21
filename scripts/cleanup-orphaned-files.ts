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

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  
  console.log("Orphaned Files Cleanup");
  console.log("======================");
  console.log(`Mode: ${dryRun ? "DRY RUN (no deletions)" : "LIVE"}`);
  
  const client = postgres(DATABASE_URL);
  const db = drizzle(client);

  // Get all storage keys from database
  const videoKeys = await db.execute(sql`SELECT storage_key FROM video WHERE storage_key IS NOT NULL`);
  const clipKeys = await db.execute(sql`SELECT storage_key FROM viral_clip WHERE storage_key IS NOT NULL`);
  
  const dbKeys = new Set<string>();
  (videoKeys as any[]).forEach(r => r.storage_key && dbKeys.add(r.storage_key));
  (clipKeys as any[]).forEach(r => r.storage_key && dbKeys.add(r.storage_key));
  
  console.log(`\nFound ${dbKeys.size} storage keys in database`);

  // List all files in storage
  let orphanedFiles: string[] = [];
  let continuationToken: string | undefined;
  
  do {
    const response = await s3Client.send(new ListObjectsV2Command({
      Bucket: R2_BUCKET_NAME,
      Prefix: "videos/",
      ContinuationToken: continuationToken,
    }));
    
    for (const obj of response.Contents || []) {
      if (obj.Key && !dbKeys.has(obj.Key)) {
        orphanedFiles.push(obj.Key);
      }
    }
    
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  console.log(`Found ${orphanedFiles.length} orphaned files in storage`);

  if (orphanedFiles.length === 0) {
    console.log("\n✓ No orphaned files to clean up");
    await client.end();
    process.exit(0);
  }

  console.log("\nOrphaned files:");
  orphanedFiles.forEach(f => console.log(`  - ${f}`));

  if (dryRun) {
    console.log("\n[DRY RUN] Would delete the above files. Run without --dry-run to delete.");
  } else {
    console.log("\nDeleting orphaned files...");
    for (const key of orphanedFiles) {
      try {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: key,
        }));
        console.log(`  ✓ Deleted: ${key}`);
      } catch (err: any) {
        console.log(`  ✗ Failed to delete ${key}: ${err.message}`);
      }
    }
    console.log("\n✓ Cleanup complete");
  }

  await client.end();
  process.exit(0);
}

main().catch(console.error);
