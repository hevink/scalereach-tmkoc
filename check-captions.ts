import { db } from './src/db/index.ts';
import { viralClip } from './src/db/schema/index.ts';
import { clipCaption } from './src/db/schema/clip-caption.schema.ts';
import { eq } from 'drizzle-orm';

const allClips = await db.select({ id: viralClip.id, status: viralClip.status }).from(viralClip).where(eq(viralClip.videoId, 'ynqSkHv4J3lxxr-68EqO3'));
console.log('Clips:', JSON.stringify(allClips, null, 2));

for (const c of allClips) {
  const captions = await db.select().from(clipCaption).where(eq(clipCaption.clipId, c.id));
  if (captions.length > 0) {
    const words = captions[0].words;
    const style = captions[0].styleConfig;
    console.log('Clip', c.id, '-> words:', Array.isArray(words) ? words.length : 0, 'hasStyle:', style !== null && style !== undefined);
  } else {
    console.log('Clip', c.id, '-> NO CAPTIONS SAVED');
  }
}
process.exit(0);
