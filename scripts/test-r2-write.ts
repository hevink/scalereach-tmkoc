/**
 * Test R2 write with detailed error
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!;

const client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

async function test() {
  const key = `test/write-test-${Date.now()}.txt`;
  console.log("Testing write to:", key);
  
  try {
    const result = await client.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: Buffer.from("test content"),
      ContentType: "text/plain",
    }));
    console.log("✓ Write successful!", result.$metadata.httpStatusCode);
  } catch (e: any) {
    console.log("✗ Write failed");
    console.log("  Name:", e.name);
    console.log("  Message:", e.message);
    console.log("  Code:", e.Code || e.$metadata?.httpStatusCode);
    
    // Check if it's a permissions error
    if (e.name === "AccessDenied" || e.Code === "AccessDenied") {
      console.log("\n⚠️  Your R2 API token doesn't have WRITE permission!");
      console.log("   Go to Cloudflare Dashboard → R2 → Manage R2 API Tokens");
      console.log("   Make sure your token has 'Object Read & Write' permission");
    }
  }
}

test();
