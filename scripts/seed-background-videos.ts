/**
 * Seed script for background videos (4 per category)
 * Run: bun run scripts/seed-background-videos.ts
 */

import { db } from "../src/db";
import { backgroundCategory, backgroundVideo } from "../src/db/schema/background-video.schema";
import { nanoid } from "nanoid";

interface VideoSeed {
  displayName: string;
  duration: number;
  width: number;
  height: number;
  fileSize: number;
  storageKey: string;
  thumbnailKey: string;
}

const VIDEOS_PER_CATEGORY: Record<string, VideoSeed[]> = {
  "subway-surfer": [
    {
      displayName: "Subway Run 1",
      duration: 45,
      width: 1080,
      height: 1920,
      fileSize: 22_500_000,
      storageKey: "backgrounds/subway-surfer/video-1.mp4",
      thumbnailKey: "backgrounds/subway-surfer/thumb-1.gif",
    },
    {
      displayName: "Subway Run 2",
      duration: 52,
      width: 1080,
      height: 1920,
      fileSize: 26_000_000,
      storageKey: "backgrounds/subway-surfer/video-2.mp4",
      thumbnailKey: "backgrounds/subway-surfer/thumb-2.gif",
    },
  ],
  minecraft: [
    {
      displayName: "Mining Diamonds",
      duration: 55,
      width: 1080,
      height: 1920,
      fileSize: 27_500_000,
      storageKey: "backgrounds/minecraft/video-1.mp4",
      thumbnailKey: "backgrounds/minecraft/thumb-1.gif",
    },
    {
      displayName: "Building House",
      duration: 48,
      width: 1080,
      height: 1920,
      fileSize: 24_000_000,
      storageKey: "backgrounds/minecraft/video-2.mp4",
      thumbnailKey: "backgrounds/minecraft/thumb-2.gif",
    },
    {
      displayName: "Nether Portal",
      duration: 42,
      width: 1080,
      height: 1920,
      fileSize: 21_000_000,
      storageKey: "backgrounds/minecraft/video-3.mp4",
      thumbnailKey: "backgrounds/minecraft/thumb-3.gif",
    },
    {
      displayName: "Speedrun Bridge",
      duration: 50,
      width: 1080,
      height: 1920,
      fileSize: 25_000_000,
      storageKey: "backgrounds/minecraft/video-4.mp4",
      thumbnailKey: "backgrounds/minecraft/thumb-4.gif",
    },
  ],
  asmr: [
    {
      displayName: "Tapping Sounds",
      duration: 60,
      width: 1080,
      height: 1920,
      fileSize: 30_000_000,
      storageKey: "backgrounds/asmr/video-1.mp4",
      thumbnailKey: "backgrounds/asmr/thumb-1.gif",
    },
    {
      displayName: "Whispering",
      duration: 55,
      width: 1080,
      height: 1920,
      fileSize: 27_500_000,
      storageKey: "backgrounds/asmr/video-2.mp4",
      thumbnailKey: "backgrounds/asmr/thumb-2.gif",
    },
    {
      displayName: "Crinkling Paper",
      duration: 47,
      width: 1080,
      height: 1920,
      fileSize: 23_500_000,
      storageKey: "backgrounds/asmr/video-3.mp4",
      thumbnailKey: "backgrounds/asmr/thumb-3.gif",
    },
    {
      displayName: "Brushing Mic",
      duration: 52,
      width: 1080,
      height: 1920,
      fileSize: 26_000_000,
      storageKey: "backgrounds/asmr/video-4.mp4",
      thumbnailKey: "backgrounds/asmr/thumb-4.gif",
    },
    {
      displayName: "ASMR Video 5",
      duration: 47,
      width: 1080,
      height: 1080,
      fileSize: 18_314_499,
      storageKey: "backgrounds/asmr/video-5.mp4",
      thumbnailKey: "backgrounds/asmr/thumb-5.gif",
    },
    {
      displayName: "ASMR Video 6",
      duration: 60,
      width: 1920,
      height: 1080,
      fileSize: 39_046_303,
      storageKey: "backgrounds/asmr/video-6.mp4",
      thumbnailKey: "backgrounds/asmr/thumb-6.gif",
    },
    {
      displayName: "ASMR Video 7",
      duration: 60,
      width: 1920,
      height: 1080,
      fileSize: 36_258_728,
      storageKey: "backgrounds/asmr/video-7.mp4",
      thumbnailKey: "backgrounds/asmr/thumb-7.gif",
    },
    {
      displayName: "ASMR Video 8",
      duration: 60,
      width: 1920,
      height: 1080,
      fileSize: 6_824_567,
      storageKey: "backgrounds/asmr/video-8.mp4",
      thumbnailKey: "backgrounds/asmr/thumb-8.gif",
    },
    {
      displayName: "ASMR Video 9",
      duration: 60,
      width: 1920,
      height: 1080,
      fileSize: 12_626_399,
      storageKey: "backgrounds/asmr/video-9.mp4",
      thumbnailKey: "backgrounds/asmr/thumb-9.gif",
    },
    {
      displayName: "ASMR Video 10",
      duration: 60,
      width: 1920,
      height: 1080,
      fileSize: 15_205_709,
      storageKey: "backgrounds/asmr/video-10.mp4",
      thumbnailKey: "backgrounds/asmr/thumb-10.gif",
    },
  ],
  satisfying: [
    {
      displayName: "Sand Cutting",
      duration: 40,
      width: 1080,
      height: 1920,
      fileSize: 20_000_000,
      storageKey: "backgrounds/satisfying/video-1.mp4",
      thumbnailKey: "backgrounds/satisfying/thumb-1.gif",
    },
    {
      displayName: "Paint Mixing",
      duration: 45,
      width: 1080,
      height: 1920,
      fileSize: 22_500_000,
      storageKey: "backgrounds/satisfying/video-2.mp4",
      thumbnailKey: "backgrounds/satisfying/thumb-2.gif",
    },
    {
      displayName: "Pressure Washing",
      duration: 50,
      width: 1080,
      height: 1920,
      fileSize: 25_000_000,
      storageKey: "backgrounds/satisfying/video-3.mp4",
      thumbnailKey: "backgrounds/satisfying/thumb-3.gif",
    },
    {
      displayName: "Kinetic Sand",
      duration: 38,
      width: 1080,
      height: 1920,
      fileSize: 19_000_000,
      storageKey: "backgrounds/satisfying/video-4.mp4",
      thumbnailKey: "backgrounds/satisfying/thumb-4.gif",
    },
  ],
  parkour: [
    {
      displayName: "Rooftop Run",
      duration: 35,
      width: 1080,
      height: 1920,
      fileSize: 17_500_000,
      storageKey: "backgrounds/parkour/video-1.mp4",
      thumbnailKey: "backgrounds/parkour/thumb-1.gif",
    },
    {
      displayName: "Wall Flip",
      duration: 42,
      width: 1080,
      height: 1920,
      fileSize: 21_000_000,
      storageKey: "backgrounds/parkour/video-2.mp4",
      thumbnailKey: "backgrounds/parkour/thumb-2.gif",
    },
    {
      displayName: "Urban Flow",
      duration: 48,
      width: 1080,
      height: 1920,
      fileSize: 24_000_000,
      storageKey: "backgrounds/parkour/video-3.mp4",
      thumbnailKey: "backgrounds/parkour/thumb-3.gif",
    },
    {
      displayName: "Gym Session",
      duration: 55,
      width: 1080,
      height: 1920,
      fileSize: 27_500_000,
      storageKey: "backgrounds/parkour/video-4.mp4",
      thumbnailKey: "backgrounds/parkour/thumb-4.gif",
    },
  ],
  "soap-cutting": [
    {
      displayName: "Colorful Bars",
      duration: 44,
      width: 1080,
      height: 1920,
      fileSize: 22_000_000,
      storageKey: "backgrounds/soap-cutting/video-1.mp4",
      thumbnailKey: "backgrounds/soap-cutting/thumb-1.gif",
    },
    {
      displayName: "Layered Soap",
      duration: 50,
      width: 1080,
      height: 1920,
      fileSize: 25_000_000,
      storageKey: "backgrounds/soap-cutting/video-2.mp4",
      thumbnailKey: "backgrounds/soap-cutting/thumb-2.gif",
    },
    {
      displayName: "Glitter Soap",
      duration: 38,
      width: 1080,
      height: 1920,
      fileSize: 19_000_000,
      storageKey: "backgrounds/soap-cutting/video-3.mp4",
      thumbnailKey: "backgrounds/soap-cutting/thumb-3.gif",
    },
    {
      displayName: "Carved Soap",
      duration: 46,
      width: 1080,
      height: 1920,
      fileSize: 23_000_000,
      storageKey: "backgrounds/soap-cutting/video-4.mp4",
      thumbnailKey: "backgrounds/soap-cutting/thumb-4.gif",
    },
  ],
  slime: [
    {
      displayName: "Fluffy Slime",
      duration: 42,
      width: 1080,
      height: 1920,
      fileSize: 21_000_000,
      storageKey: "backgrounds/slime/video-1.mp4",
      thumbnailKey: "backgrounds/slime/thumb-1.gif",
    },
    {
      displayName: "Butter Slime",
      duration: 48,
      width: 1080,
      height: 1920,
      fileSize: 24_000_000,
      storageKey: "backgrounds/slime/video-2.mp4",
      thumbnailKey: "backgrounds/slime/thumb-2.gif",
    },
    {
      displayName: "Glitter Slime",
      duration: 36,
      width: 1080,
      height: 1920,
      fileSize: 18_000_000,
      storageKey: "backgrounds/slime/video-3.mp4",
      thumbnailKey: "backgrounds/slime/thumb-3.gif",
    },
    {
      displayName: "Cloud Slime",
      duration: 52,
      width: 1080,
      height: 1920,
      fileSize: 26_000_000,
      storageKey: "backgrounds/slime/video-4.mp4",
      thumbnailKey: "backgrounds/slime/thumb-4.gif",
    },
  ],
  cooking: [
    {
      displayName: "Chopping Veggies",
      duration: 40,
      width: 1080,
      height: 1920,
      fileSize: 20_000_000,
      storageKey: "backgrounds/cooking/video-1.mp4",
      thumbnailKey: "backgrounds/cooking/thumb-1.gif",
    },
    {
      displayName: "Sizzling Pan",
      duration: 45,
      width: 1080,
      height: 1920,
      fileSize: 22_500_000,
      storageKey: "backgrounds/cooking/video-2.mp4",
      thumbnailKey: "backgrounds/cooking/thumb-2.gif",
    },
    {
      displayName: "Cake Decorating",
      duration: 55,
      width: 1080,
      height: 1920,
      fileSize: 27_500_000,
      storageKey: "backgrounds/cooking/video-3.mp4",
      thumbnailKey: "backgrounds/cooking/thumb-3.gif",
    },
    {
      displayName: "Pasta Making",
      duration: 50,
      width: 1080,
      height: 1920,
      fileSize: 25_000_000,
      storageKey: "backgrounds/cooking/video-4.mp4",
      thumbnailKey: "backgrounds/cooking/thumb-4.gif",
    },
  ],
};

async function seed() {
  console.log("Seeding background videos...\n");

  // Clear existing background videos first
  await db.delete(backgroundVideo);
  console.log("Cleared existing background videos.\n");

  // Fetch all categories from DB
  const categories = await db.select().from(backgroundCategory);

  if (categories.length === 0) {
    console.error("No categories found. Run seed-background-categories.ts first.");
    process.exit(1);
  }

  let total = 0;

  for (const cat of categories) {
    const videoList = VIDEOS_PER_CATEGORY[cat.slug];
    if (!videoList) {
      console.log(`  ⚠ No video data defined for "${cat.slug}", skipping`);
      continue;
    }

    console.log(`${cat.displayName}:`);

    for (let i = 0; i < videoList.length; i++) {
      const v = videoList[i];
      try {
        await db.insert(backgroundVideo).values({
          id: nanoid(),
          categoryId: cat.id,
          displayName: v.displayName,
          storageKey: v.storageKey,
          thumbnailKey: v.thumbnailKey,
          duration: v.duration,
          width: v.width,
          height: v.height,
          fileSize: v.fileSize,
        });
        console.log(`  ✓ ${v.displayName}`);
        total++;
      } catch (err: any) {
        if (err.message?.includes("duplicate")) {
          console.log(`  - ${v.displayName} (already exists)`);
        } else {
          console.error(`  ✗ ${v.displayName}: ${err.message}`);
        }
      }
    }
    console.log();
  }

  console.log(`Done! Seeded ${total} background videos.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
