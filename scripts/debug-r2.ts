/**
 * Debug R2 connection
 */

import { S3Client, HeadBucketCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!;

console.log("R2 Debug");
console.log("========");
console.log(`Endpoint: https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`);
console.log(`Bucket: ${R2_BUCKET_NAME}`);
console.log(`Access Key: ${R2_ACCESS_KEY_ID?.slice(0, 10)}...`);

const client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

async function debug() {
  // Test 1: HeadBucket
  console.log("\n1. Testing HeadBucket...");
  try {
    const head = await client.send(new HeadBucketCommand({ Bucket: R2_BUCKET_NAME }));
    console.log("   ✓ Bucket exists, status:", head.$metadata.httpStatusCode);
  } catch (e: any) {
    console.log("   ✗ HeadBucket failed:", e.name, "-", e.message);
    console.log("   Status:", e.$metadata?.httpStatusCode);
  }

  // Test 2: ListObjects
  console.log("\n2. Testing ListObjects...");
  try {
    const list = await client.send(new ListObjectsV2Command({ 
      Bucket: R2_BUCKET_NAME, 
      MaxKeys: 5 
    }));
    console.log("   ✓ Listed objects, count:", list.KeyCount);
    if (list.Contents) {
      list.Contents.slice(0, 3).forEach(obj => {
        console.log("     -", obj.Key);
      });
    }
  } catch (e: any) {
    console.log("   ✗ ListObjects failed:", e.name, "-", e.message);
    console.log("   Status:", e.$metadata?.httpStatusCode);
  }
}

debug().catch(console.error);
