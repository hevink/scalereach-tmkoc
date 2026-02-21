/**
 * Quick R2/MinIO connectivity test
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!;
const R2_ENDPOINT = process.env.R2_ENDPOINT;

const endpoint = R2_ENDPOINT || `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

console.log("R2/MinIO Connection Test");
console.log("========================");
console.log(`Endpoint: ${endpoint}`);
console.log(`Bucket: ${R2_BUCKET_NAME}`);
console.log(`Access Key: ${R2_ACCESS_KEY_ID?.slice(0, 8)}...`);

if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
  console.error("\n✗ Missing environment variables");
  process.exit(1);
}

const client = new S3Client({
  region: "auto",
  endpoint,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: !!R2_ENDPOINT, // Required for MinIO
});

async function test() {
  const testKey = `test/r2-test-${Date.now()}.txt`;
  const testContent = `Test at ${new Date().toISOString()}`;

  try {
    console.log(`\nUploading: ${testKey}`);
    
    await client.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: testKey,
      Body: Buffer.from(testContent),
      ContentType: "text/plain",
    }));
    
    console.log("✓ Upload successful");

    console.log("Deleting test file...");
    await client.send(new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: testKey,
    }));
    
    console.log("✓ Delete successful");
    console.log("\n✓ Storage is working!");
    
  } catch (err: any) {
    console.error("\n✗ Test failed:", err.message);
    process.exit(1);
  }
}

test();
