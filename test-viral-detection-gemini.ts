import { ViralDetectionService } from "./src/services/viral-detection.service";

// Test transcript - simulating a 2-minute video
const testTranscript = `
Welcome everyone to today's episode. I want to share something that completely changed my perspective on productivity.
Most people think they need to work harder, but that's actually the wrong approach. The secret is working smarter, not harder.
Let me explain what I mean by that. When I started my business five years ago, I was working 80 hours a week and barely making progress.
I was exhausted, burned out, and ready to quit. Then I discovered this one simple trick that tripled my output while cutting my hours in half.
It's all about focusing on high-impact activities and eliminating time wasters. Here's the framework I use every single day.
First, identify your top three priorities for the day. Not ten, not twenty, just three. These should be the tasks that will move the needle the most.
Second, block out dedicated time for deep work. Turn off notifications, close your email, and focus on one thing at a time.
And third, ruthlessly eliminate distractions. Say no to meetings that don't matter. Delegate tasks that others can do.
This changed everything for me, and I know it can work for you too. The results speak for themselves.
My revenue tripled, my stress levels dropped, and I finally had time for my family again.
So if you're feeling overwhelmed and overworked, try this framework for just one week and see what happens.
I guarantee you'll be amazed at the results. Thanks for watching, and I'll see you in the next video.
`;

// Create realistic word timings (average 2.5 words per second)
const words = testTranscript.trim().split(/\s+/);
const testWords = words.map((word, i) => ({
  word: word.trim(),
  start: i * 0.4, // ~2.5 words per second
  end: (i + 1) * 0.4,
}));

async function testViralDetection() {
  console.log("Testing Viral Detection with Gemini...\n");

  try {
    const clips = await ViralDetectionService.detectViralClips(
      testTranscript,
      testWords,
      {
        maxClips: 3,
        minDuration: 15,
        maxDuration: 45,
        videoTitle: "The Productivity Secret Nobody Talks About",
        model: "gemini-2.5-flash-lite",
        enableEmojis: true,
        enableIntroTitle: true,
      }
    );

    console.log(`\n✅ Success! Found ${clips.length} viral clips:\n`);

    clips.forEach((clip, i) => {
      console.log(`\n--- Clip ${i + 1} ---`);
      console.log(`Title: ${clip.title}`);
      console.log(`Intro Title: ${clip.introTitle}`);
      console.log(`Duration: ${(clip.endTime - clip.startTime).toFixed(1)}s (${clip.startTime}s - ${clip.endTime}s)`);
      console.log(`Virality Score: ${clip.viralityScore}/100`);
      console.log(`Platforms: ${clip.recommendedPlatforms.join(", ")}`);
      console.log(`Reason: ${clip.viralityReason}`);
      console.log(`Transcript: ${clip.transcript.substring(0, 100)}...`);
      if (clip.transcriptWithEmojis) {
        console.log(`With Emojis: ${clip.transcriptWithEmojis.substring(0, 100)}...`);
      }
    });
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

testViralDetection();
