# ScaleReach Backend Flow - Complete Analysis

## Current Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND FLOW                                     │
└──────────────────────────────────────────────────────────────────────────────┘

User submits YouTube URL or uploads video
              │
              ▼
┌─────────────────────────────────────┐
│  1. VIDEO SUBMISSION                │
│  POST /api/videos/youtube           │
│  POST /api/videos/upload            │
│                                     │
│  Creates video record with          │
│  status: "pending_config"           │
└─────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  2. CONFIGURATION                   │
│  POST /api/videos/:id/configure     │
│                                     │
│  Saves to video_config table:       │
│  - skipClipping (bool)              │
│  - clipModel                        │
│  - genre                            │
│  - captionTemplateId                │
│  - aspectRatio (9:16, 16:9, 1:1)    │
│  - clipDurationMin/Max              │
│  - timeframeStart/End               │
│  - customPrompt                     │
│                                     │
│  Updates status → "downloading"     │
│  Adds job to Redis queue            │
└─────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  3. VIDEO WORKER (BullMQ)           │
│  src/jobs/video.worker.ts           │
│                                     │
│  Queue: "video-processing"          │
│  Concurrency: 2                     │
│  Retries: 3 (exponential backoff)   │
└─────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         VIDEO PROCESSING PIPELINE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  STEP 1: DOWNLOAD (10-30%)                                                   │
│  ├─ YouTube: YouTubeService.streamAudio() → streams m4a                      │
│  └─ Upload: Already in R2, extract audio with FFmpegService                  │
│                                                                              │
│  STEP 2: UPLOAD TO R2 (30-60%)                                               │
│  ├─ R2Service.uploadFromStream() for YouTube                                 │
│  └─ FFmpegService.extractAudioToR2() for uploads                             │
│                                                                              │
│  STEP 3: TRANSCRIBE (60-70%)                                                 │
│  └─ DeepgramService.transcribeFromUrl()                                      │
│     Returns: { transcript, words[], language, confidence }                   │
│     Words have: { word, start, end, confidence }                             │
│                                                                              │
│  STEP 4: VIRAL DETECTION (70-90%)                                            │
│  └─ ViralDetectionService.detectViralClips()                                 │
│     Uses: Groq AI (mixtral-8x7b-32768)                                       │
│     Input: Transcript + word timestamps                                      │
│     Output: Array of viral clips with:                                       │
│       - title, startTime, endTime                                            │
│       - viralityScore (0-100)                                                │
│       - viralityReason, hooks[], emotions[]                                  │
│                                                                              │
│  STEP 5: SAVE CLIPS & QUEUE GENERATION (90-100%)                             │
│  ├─ Insert clips to viral_clip table                                         │
│  ├─ Extract words for each clip's time range                                 │
│  ├─ Adjust word timings (relative to clip start)                             │
│  ├─ Get caption template style                                               │
│  ├─ Save to clip_caption table                                               │
│  └─ Queue clip generation job                                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  4. CLIP WORKER (BullMQ)            │
│  src/jobs/clip.worker.ts            │
│                                     │
│  Queue: "clip-generation"           │
│  Concurrency: 2                     │
│  Retries: 3                         │
└─────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CLIP GENERATION PIPELINE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ClipGeneratorService.generateClip()                                         │
│                                                                              │
│  FOR YOUTUBE:                                                                │
│  1. downloadYouTubeSegment()                                                 │
│     └─ yt-dlp --download-sections *start-end                                 │
│  2. generateASSSubtitles() → creates .ass file                               │
│  3. convertAspectRatioFile() with FFmpeg                                     │
│     └─ scale + crop + burn subtitles                                         │
│                                                                              │
│  FOR UPLOAD:                                                                 │
│  1. Get signed URL from R2                                                   │
│  2. generateASSSubtitles() → creates .ass file                               │
│  3. FFmpeg: -ss start -t duration -vf "crop,ass=subs.ass"                    │
│                                                                              │
│  OUTPUT:                                                                     │
│  - Upload final MP4 to R2: clips/{videoId}/{clipId}-9x16.mp4                 │
│  - Update clip status → "ready"                                              │
│  - Store storageKey, storageUrl                                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema (Key Tables)

### video
```sql
id, user_id, project_id, title, status, source_type, source_url,
storage_key, storage_url, audio_storage_key, audio_storage_url,
duration, transcript, transcript_words (JSONB), transcript_language,
transcript_confidence, error_message, created_at, updated_at
```

### video_config
```sql
id, video_id, skip_clipping, clip_model, genre, caption_template_id,
aspect_ratio, clip_duration_min, clip_duration_max, timeframe_start,
timeframe_end, custom_prompt, created_at, updated_at
```

### viral_clip
```sql
id, video_id, title, start_time, end_time, duration, transcript,
score, virality_reason, hooks (JSONB), emotions (JSONB),
status (detected|generating|ready|exported|failed),
storage_key, storage_url, aspect_ratio, error_message,
created_at, updated_at
```

### clip_caption
```sql
id, clip_id, words (JSONB), style_config (JSONB), template_id,
is_edited, created_at, updated_at
```

---

## Caption System

### Word Structure
```typescript
{
  id: string,      // nanoid(8)
  word: string,    // "Hello"
  start: number,   // 0.5 (relative to clip start)
  end: number      // 0.8
}
```

### Style Config
```typescript
{
  fontFamily: "Arial",
  fontSize: 48,
  textColor: "#FFFFFF",
  backgroundColor: "#000000",
  backgroundOpacity: 0.5,
  position: "bottom" | "center" | "top",
  alignment: "center",
  animation: "none" | "word-by-word" | "karaoke" | "bounce" | "fade",
  highlightColor: "#FFFF00",
  highlightEnabled: true,
  shadow: true,
  outline: true,
  outlineColor: "#000000"
}
```

### ASS Subtitle Generation
- Groups words into lines (~5 words each)
- Karaoke effect: scales highlighted word 1.2x + color change
- Supports position (top/center/bottom)
- Burns into video with FFmpeg: `-vf "ass=captions.ass"`

---

## Caption Editing API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/clips/:id/captions` | Get words + style (auto-creates if missing) |
| PUT | `/api/clips/:id/captions/words` | Bulk update all words |
| PATCH | `/api/clips/:id/captions/style` | Update style only |
| POST | `/api/clips/:id/captions/words` | Add new word |
| PATCH | `/api/clips/:id/captions/words/:wordId` | Edit single word |
| DELETE | `/api/clips/:id/captions/words/:wordId` | Remove word |
| POST | `/api/clips/:id/captions/reset` | Reset to original transcript |

---

## Video Status Flow

```
pending_config → downloading → uploading → transcribing → analyzing → completed
                                                                    ↘ failed
```

## Clip Status Flow

```
detected → generating → ready → exported
                      ↘ failed
```

---

## Services Summary

| Service | Purpose |
|---------|---------|
| `YouTubeService` | Stream audio from YouTube URLs |
| `R2Service` | Cloudflare R2 storage (upload/download/signed URLs) |
| `DeepgramService` | Audio transcription with word timestamps |
| `ViralDetectionService` | AI clip detection using Groq |
| `ClipGeneratorService` | FFmpeg clip extraction + caption burning |
| `FFmpegService` | Audio extraction, video metadata |

---

## What's Already Built ✅

1. **Video Input**
   - YouTube URL submission
   - Direct video upload
   - Validation & metadata extraction

2. **Processing Pipeline**
   - BullMQ job queues (video + clip)
   - Audio extraction
   - Deepgram transcription
   - Word-level timestamps

3. **AI Clip Detection**
   - Groq integration
   - Virality scoring
   - Configurable duration/genre/prompt

4. **Clip Generation**
   - yt-dlp segment download
   - FFmpeg aspect ratio conversion
   - Center-crop strategy

5. **Caption System**
   - Word-level storage
   - Style configuration
   - ASS subtitle generation
   - Karaoke highlight effect
   - Caption burning into video

6. **Caption Editing API**
   - CRUD for words
   - Style updates
   - Reset to original

---

## What's Missing for MVP 🔴

1. **Frontend Caption Editor UI**
   - Video preview with captions
   - Inline word editing
   - Drag to adjust timing
   - Style controls panel
   - Real-time preview

2. **Re-export After Edit**
   - API to regenerate clip with edited captions
   - Queue new clip generation job

3. **Download Endpoint**
   - Signed URL for clip download
   - Track exports
