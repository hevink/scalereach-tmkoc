/**
 * Quick R2 connectivity test
 * Usage: bun run scripts/test-r2.ts
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!;

console.log("R2 Connection Test");
console.log("==================");
console.log(`Account ID: ${R2_ACCOUNT_ID ? R2_ACCOUNT_ID.slice(0, 8) + "..." : "NOT SET"}`);
console.log(`Access Key: ${R2_ACCESS_KEY_ID ? R2_ACCESS_KEY_ID.slice(0, 8) + "..." : "NOT SET"}`);
console.log(`Secret Key: ${R2_SECRET_ACCESS_KEY ? "SET" : "NOT SET"}`);
console.log(`Bucket: ${R2_BUCKET_NAME || "NOT SET"}`);

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
  console.error("\n✗ Missing R2 environment variables");
  process.exit(1);
}

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

async function test() {
  const testKey = `test/r2-test-${Date.now()}.txt`;
  const testContent = `R2 test at ${new Date().toISOString()}`;

  try {
    console.log(`\nUploading test file: ${testKey}`);
    
    await s3Client.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: testKey,
      Body: Buffer.from(testContent),
      ContentType: "text/plain",
    }));
    
    console.log("✓ Upload successful");

    // Clean up
    console.log("Deleting test file...");
    await s3Client.send(new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: testKey,
    }));
    
    console.log("✓ Delete successful");
    console.log("\n✓ R2 is working correctly!");
    
  } catch (err: any) {
    console.error("\n✗ R2 test failed:");
    console.error(`  Error: ${err.message}`);
    if (err.$response) {
      console.error(`  Status: ${err.$response.statusCode}`);
      console.error(`  Body: ${err.$response.body?.slice(0, 500)}`);
    }
    process.exit(1);
  }
}

test();
