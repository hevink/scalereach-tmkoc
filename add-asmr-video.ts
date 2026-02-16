import { db } from "./src/db";
import { backgroundVideo, backgroundCategory } from "./src/db/schema/background-video.schema";
import { eq } from "drizzle-orm";
import { R2Service } from "./src/services/r2.service";
import { nanoid } from "nanoid";
import * as fs from "fs";
import * as path from "path";

async function addAsmrVideo() {
  console.log("🎧 Adding ASMR video...\n");

  try {
    // Check if ASMR category exists
    let asmrCategory = await db
      .select()
      .from(backgroundCategory)
      .where(eq(backgroundCategory.slug, "asmr"))
      .limit(1);

    let categoryId: string;

    if (asmrCategory.length === 0) {
      // Create ASMR category
      console.log("📁 Creating ASMR category...");
      const newCategory = await db
        .insert(backgroundCategory)
        .values({
          id: nanoid(),
          slug: "asmr",
          displayName: "ASMR",
          thumbnailUrl: null,
          sortOrder: 1,
        })
        .returning();
      
      categoryId = newCategory[0].id;
      console.log(`   ✅ Created category: ${categoryId}\n`);
    } else {
      categoryId = asmrCategory[0].id;
      console.log(`✅ ASMR category already exists: ${categoryId}\n`);
    }

    // Upload the video
    const videoPath = "seed-background-video/asmr/asmr-1.mp4";
    const fullPath = path.join(__dirname, videoPath);

    if (!fs.existsSync(fullPath)) {
      console.error(`❌ Video file not found: ${fullPath}`);
      return;
    }

    // Get file stats
    const stats = fs.statSync(fullPath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`📹 Processing: ${videoPath}`);
    console.log(`   Size: ${fileSizeMB} MB`);

    // Read file
    const fileBuffer = fs.readFileSync(fullPath);

    // Upload to R2
    const r2Key = "backgrounds/asmr/video-1.mp4";
    console.log(`   Uploading to R2: ${r2Key}...`);
    const result = await R2Service.uploadFile(r2Key, fileBuffer, "video/mp4");

    console.log(`   ✅ Uploaded successfully!`);
    console.log(`   URL: ${result.url}`);

    // Create database entry
    const videoId = nanoid();
    console.log(`\n   Creating database entry: ${videoId}...`);
    
    await db.insert(backgroundVideo).values({
      id: videoId,
      categoryId: categoryId,
      displayName: "ASMR 1",
      storageKey: r2Key,
      thumbnailKey: null,
      duration: 60, // Will be updated if you run metadata extraction
      width: 1080,
      height: 1920,
      fileSize: stats.size,
    });

    console.log(`   ✅ Database entry created!`);

    console.log("\n\n✅ ASMR video added successfully!");
    console.log("\n📊 Summary:");
    console.log("   - Category: ASMR");
    console.log("   - Video: asmr-1.mp4");
    console.log("   - R2 Key: backgrounds/asmr/video-1.mp4");
    console.log("   - Video ID: " + videoId);

  } catch (error) {
    console.error("\n❌ Error adding ASMR video:", error);
    throw error;
  }
}

addAsmrVideo();
