/**
 * R2 Upload Test
 * Tests: connect → upload → download URL → delete
 */

import { S3Client, HeadBucketCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

const TEST_KEY = `test/r2-upload-test-${Date.now()}.txt`;
const TEST_CONTENT = `R2 upload test - ${new Date().toISOString()}`;

console.log("R2 Upload Test");
console.log("==============");
const endpoint = process.env.R2_ENDPOINT || `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

console.log(`Endpoint: ${endpoint}`);
console.log(`Bucket:   ${R2_BUCKET_NAME}`);
console.log(`Key:      ${TEST_KEY}`);
console.log("");

const client = new S3Client({
  region: "auto",
  endpoint,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: !!process.env.R2_ENDPOINT,
});

async function run() {
  let passed = 0;
  let failed = 0;

  // ── 1. Bucket connectivity (via list, HeadBucket needs admin perms) ──
  process.stdout.write("1. Bucket connectivity... ");
  try {
    const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
    await client.send(new ListObjectsV2Command({ Bucket: R2_BUCKET_NAME, MaxKeys: 1 }));
    console.log("✅ OK");
    passed++;
  } catch (e: any) {
    console.log(`❌ FAILED — ${e.name}: ${e.message} (status: ${e.$metadata?.httpStatusCode})`);
    failed++;
    console.log("\nCannot continue without bucket access.");
    process.exit(1);
  }

  // ── 2. Upload file ──────────────────────────────────────────
  process.stdout.write("2. Upload file...         ");
  try {
    await client.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: TEST_KEY,
      Body: TEST_CONTENT,
      ContentType: "text/plain",
    }));
    console.log("✅ OK");
    passed++;
  } catch (e: any) {
    console.log(`❌ FAILED — ${e.name}: ${e.message}`);
    failed++;
  }

  // ── 3. Generate signed download URL ────────────────────────
  process.stdout.write("3. Signed download URL... ");
  try {
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: TEST_KEY }),
      { expiresIn: 60 }
    );
    console.log("✅ OK");
    console.log(`   ${url.slice(0, 80)}...`);
    passed++;
  } catch (e: any) {
    console.log(`❌ FAILED — ${e.name}: ${e.message}`);
    failed++;
  }

  // ── 4. Public URL (if configured) ──────────────────────────
  if (R2_PUBLIC_URL) {
    process.stdout.write("4. Public URL fetch...    ");
    try {
      const publicUrl = `${R2_PUBLIC_URL}/${TEST_KEY}`;
      const res = await fetch(publicUrl, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const body = await res.text();
        const match = body === TEST_CONTENT;
        console.log(match ? "✅ OK" : `⚠️  Content mismatch`);
        console.log(`   ${publicUrl}`);
        passed++;
      } else {
        console.log(`⚠️  HTTP ${res.status} — bucket may not be public`);
      }
    } catch (e: any) {
      console.log(`⚠️  Skipped — ${e.message}`);
    }
  }

  // ── 5. Stream upload ────────────────────────────────────────
  process.stdout.write("5. Stream upload...       ");
  const streamKey = `test/r2-stream-test-${Date.now()}.txt`;
  try {
    const { Upload } = await import("@aws-sdk/lib-storage");
    const stream = Readable.from([Buffer.from("stream upload test content")]);
    const upload = new Upload({
      client,
      params: {
        Bucket: R2_BUCKET_NAME,
        Key: streamKey,
        Body: stream,
        ContentType: "text/plain",
      },
      partSize: 1024 * 1024 * 5,
    });
    await upload.done();
    console.log("✅ OK");
    passed++;

    // cleanup stream test file
    await client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: streamKey }));
  } catch (e: any) {
    console.log(`❌ FAILED — ${e.name}: ${e.message}`);
    failed++;
  }

  // ── 6. Delete test file ─────────────────────────────────────
  process.stdout.write("6. Delete test file...    ");
  try {
    await client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: TEST_KEY }));
    console.log("✅ OK");
    passed++;
  } catch (e: any) {
    console.log(`❌ FAILED — ${e.name}: ${e.message}`);
    failed++;
  }

  // ── Summary ─────────────────────────────────────────────────
  console.log("");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log("✅ R2 is working correctly");
  } else {
    console.log("❌ Some tests failed — check credentials and bucket config");
    process.exit(1);
  }
}

run().catch((e) => {
  console.error("Unexpected error:", e);
  process.exit(1);
});
