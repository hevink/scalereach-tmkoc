import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../../.env.local") });
config({ path: resolve(__dirname, "../../.env") });

import { db } from "../db";
import { workspace, video, viralClip, captionStyle } from "../db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

const SOURCE_VIDEO_ID = "H0RckMc-ssyrebOrSCHp4";
const TARGET_WORKSPACE_SLUG = "wowww";

async function copyVideoToWorkspace() {
  // 1. Find target workspace
  const [targetWs] = await db
    .select()
    .from(workspace)
    .where(eq(workspace.slug, TARGET_WORKSPACE_SLUG));

  if (!targetWs) {
    console.error(`Workspace "${TARGET_WORKSPACE_SLUG}" not found`);
    process.exit(1);
  }
  console.log(`Target workspace: ${targetWs.name} (${targetWs.id})`);

  // 2. Find source video
  const [sourceVideo] = await db
    .select()
    .from(video)
    .where(eq(video.id, SOURCE_VIDEO_ID));

  if (!sourceVideo) {
    console.error(`Video "${SOURCE_VIDEO_ID}" not found`);
    process.exit(1);
  }
  console.log(`Source video: ${sourceVideo.title} (workspace: ${sourceVideo.workspaceId})`);

  // 3. Copy video into target workspace (new ID, same owner user)
  const newVideoId = nanoid();
  await db.insert(video).values({
    ...sourceVideo,
    id: newVideoId,
    workspaceId: targetWs.id,
    projectId: null, // no project association
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  console.log(`✓ Copied video → new ID: ${newVideoId}`);

  // 4. Find all clips for source video
  const clips = await db
    .select()
    .from(viralClip)
    .where(eq(viralClip.videoId, SOURCE_VIDEO_ID));

  console.log(`Found ${clips.length} clips to copy`);

  // 5. Copy each clip + its caption style
  for (const clip of clips) {
    const newClipId = nanoid();

    await db.insert(viralClip).values({
      ...clip,
      id: newClipId,
      videoId: newVideoId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Copy caption style if exists
    const [style] = await db
      .select()
      .from(captionStyle)
      .where(eq(captionStyle.clipId, clip.id));

    if (style) {
      await db.insert(captionStyle).values({
        ...style,
        id: nanoid(),
        clipId: newClipId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log(`  ✓ Clip "${clip.title ?? clip.id}" + caption style copied`);
    } else {
      console.log(`  ✓ Clip "${clip.title ?? clip.id}" copied`);
    }
  }

  console.log(`\nDone! Video and ${clips.length} clips copied to workspace "${targetWs.name}".`);
  console.log(`New video ID: ${newVideoId}`);
  process.exit(0);
}

copyVideoToWorkspace().catch((err) => {
  console.error(err);
  process.exit(1);
});
