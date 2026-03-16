# ScaleReach Backend — Complete Flow Documentation

> For any new developer joining the team. This doc explains every backend flow,
> every conditional branch, and which worker handles what.

---

## 📦 Tech Stack (Quick Reference)

| Layer             | Tech                         |
| ----------------- | ---------------------------- |
| HTTP Framework    | Hono (Bun runtime)           |
| Queue System      | BullMQ + Redis               |
| Database          | PostgreSQL (Drizzle ORM)     |
| File Storage      | Cloudflare R2                |
| Video Download    | yt-dlp                       |
| Video Processing  | FFmpeg                       |
| Transcription     | Deepgram                     |
| AI Clip Detection | Gemini                       |
| Translation       | DeepL                        |
| TTS (Dubbing)     | ElevenLabs / other providers |
| Error Tracking    | Sentry                       |

---

## 🗺️ Big Picture — All Queues & Workers

```
┌─────────────────────────────────────────────────────────────┐
│                        BullMQ Queues                        │
│                                                             │
│  video-processing  →  [Video Worker]                        │
│  clip-generation   →  [Clip Worker]                         │
│  video-translation →  [Translation Worker]                  │
│  voice-dubbing     →  [Dubbing Worker]                      │
│  smart-crop        →  [Smart Crop Worker]                   │
│  social-posting    →  [Social Worker]                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 1️⃣ VIDEO PROCESSING WORKER

**File:** `src/jobs/video.worker.ts`  
**Queue:** `video-processing`  
**Concurrency:** 2  
**Retries:** 2 (exponential backoff, 5s base)

This is the **entry point** for every video. It runs first before any clips are made.

---

### 📥 Source Type Branch

```
User submits video
        │
        ├── sourceType === "youtube"
        │         └── processYouTubeVideo()
        │
        └── sourceType === "upload"
                  └── processUploadedVideo()
```

---

### 🎬 Flow A — YouTube Video

```
[START] User submits YouTube URL
        │
        ▼
[DB] Load video record + videoConfig
        │
        ▼
[RESUME CHECK] Has transcript already in DB?
        │
        ├── YES (transcript exists) ──────────────────────────────────────────┐
        │   Skip download + transcription entirely                            │
        │   Jump straight to → [AI VIRAL DETECTION]                          │
        │                                                                     │
        ├── PARTIAL (storageKey exists, no transcript) ──────────────────────┐│
        │   Skip download, audio already in R2                               ││
        │   Jump to → [TRANSCRIPTION]                                        ││
        │                                                                     ││
        └── NONE (fresh job) ─────────────────────────────────────────────┐  ││
                                                                          │  ││
                                                                          ▼  ▼▼
                                                                [DOWNLOAD AUDIO]
                                                          YouTubeService.streamAudio()
                                                          yt-dlp streams audio only
                                                          timeframeStart/End applied if set
                                                                          │
                                                                          ▼
                                                                 [UPLOAD TO R2]
                                                          R2Service.uploadFromStream()
                                                          storageKey saved to DB
                                                                          │
                                                                          ▼
                                                                 [TRANSCRIPTION]
                                                          DeepgramService.transcribeFromUrl()
                                                          language: from config or auto-detect
                                                          words[] with timestamps saved to DB
                                                                          │
                                                                          ▼
                                                             [AI VIRAL DETECTION]
                                                          ViralDetectionService.detectViralClips()
                                                          Gemini AI analyzes transcript
                                                          Returns: clips with scores, hooks,
                                                          emotions, recommended platforms
                                                                          │
                                                                          ▼
                                                         [videoConfig.skipClipping?]
                                                                  │
                                                         YES ─────┤
                                                         Mark video "completed", done
                                                                  │
                                                         NO ──────┤
                                                                  ▼
                                                     [SAVE CLIPS TO DB + QUEUE GENERATION]
                                                     For each detected clip:
                                                       1. Insert viralClip record
                                                       2. ClipCaptionModel.create() (words + style)
                                                       3. addClipGenerationJob() → clip-generation queue
```

---

### 📤 Flow B — Uploaded Video

```
[START] User uploads video file (already in R2)
        │
        ▼
[DB] Load video record + videoConfig
        │
        ▼
[METADATA] FFmpegService.getVideoMetadata()
  - Get duration, width, height
  - Validate against plan limits
  - Deduct minutes from workspace balance
        │
        ▼
[THUMBNAIL] FFmpegService.generateThumbnail()
  - Extract frame at 1s
  - Upload to R2
  - Non-fatal: continues even if fails
        │
        ▼
[AUDIO EXTRACT] FFmpegService.extractAudioToR2()
  - FFmpeg strips video, outputs AAC audio
  - Streams directly to R2 (no disk)
        │
        ▼
[TRANSCRIPTION] DeepgramService.transcribeFromUrl()
  - Same as YouTube flow above
        │
        ▼
[AI VIRAL DETECTION] → same as YouTube flow above
        │
        ▼
[SAVE CLIPS + QUEUE] → same as YouTube flow above
```

---

### ⚙️ videoConfig Options That Change the Flow

| Config Option                   | Effect                                                          |
| ------------------------------- | --------------------------------------------------------------- |
| `skipClipping: true`            | Stops after transcription, no clips created                     |
| `timeframeStart / timeframeEnd` | Only processes that portion of the video                        |
| `language`                      | Forces Deepgram to use specific language instead of auto-detect |
| `clipDurationMin / Max`         | Tells Gemini min/max clip length                                |
| `genre`                         | Genre hint to Gemini for better clip detection                  |
| `clipType`                      | `"viral-clips"` or `"highlights"` — changes Gemini prompt       |
| `customPrompt`                  | Extra instructions injected into Gemini prompt                  |
| `enableCaptions`                | If false, clips queued without caption data                     |
| `enableIntroTitle`              | If false, no intro title overlay on clips                       |
| `enableSplitScreen`             | Triggers split-screen background video selection                |
| `splitScreenBgVideoId`          | Specific background video(s) — or random if empty               |
| `splitRatio`                    | Top/bottom split percentage (default 50)                        |
| `captionTemplateId`             | Which caption style template to use                             |
| `aspectRatio`                   | `"9:16"` / `"16:9"` / `"1:1"`                                   |
| `backgroundStyle`               | `blur` / `black` / `white` / gradients / `mirror` / `zoom`      |

---

### 🔄 Resume Logic (Crash Recovery)

The video worker checks what's already done before starting:

```
Job starts (could be a retry after crash)
        │
        ├── transcript in DB?     → skip to Gemini AI step
        ├── storageKey in DB?     → skip to Deepgram step
        └── nothing?              → full flow from scratch
```

Minutes are only refunded if the transcript was **never saved** (meaning real work wasn't done).

---

## 2️⃣ CLIP GENERATION WORKER

**File:** `src/jobs/clip.worker.ts`  
**Queue:** `clip-generation`  
**Concurrency:** 2  
**Retries:** 5 (exponential backoff, 5s base)

Each clip detected by Gemini gets its own job here. This is the **heaviest FFmpeg work**.

---

### Main Flow

```
[START] ClipGenerationJobData received
        │
        ▼
[STATUS] Mark clip as "generating"
        │
        ▼
[TRANSLATION CHECK] targetLanguage set?
        │
        ├── YES → fetch translated captions from DB
        │         apply language-specific style overrides
        │
        └── NO  → use original captions
        │
        ▼
[VALIDATE] ClipGeneratorService.validateOptions()
  checks: times, duration (5s-180s), aspect ratio, quality, source
        │
        ▼
[GENERATE CLIP] ClipGeneratorService.generateClip()
  (see detailed breakdown below)
        │
        ▼
[SMART CROP CHECK] smartCropEnabled?
        │
        ├── YES → run Python face detection sidecar (inline, not queued)
        │         apply FFmpeg crop based on result
        │         (see Smart Crop section below)
        │
        └── NO  → skip
        │
        ▼
[THUMBNAIL] ClipGeneratorService.generateThumbnail()
  FFmpeg extracts frame at 1s → upload to R2
  Non-fatal: continues even if fails
        │
        ▼
[STATUS] Mark clip as "ready"
  storageKey, storageUrl, rawStorageKey, rawStorageUrl, thumbnailKey saved
        │
        ▼
[EMAIL CHECK] Are ALL clips for this video now ready?
        │
        ├── YES → send "all clips ready" email to user
        └── NO  → skip (other clips still processing)
```

---

### ClipGeneratorService.generateClip() — Internal Steps

```
[STEP 1] Download source segment ONCE to temp file
        │
        ├── sourceType === "youtube"
        │   └── yt-dlp --download-sections *start-end
        │       with --force-keyframes-at-cuts (disabled on retry if code 222)
        │       retries up to 3x with exponential backoff
        │
        └── sourceType === "upload"
            └── FFmpeg -ss {start} -t {duration} -c copy
                (stream copy, no re-encode = fast)
        │
        ▼
[STEP 2] Split-screen background setup
        │
        ├── splitScreen enabled?
        │   └── download background video from R2 to temp file
        │
        └── no split-screen → skip
        │
        ▼
[STEP 3] Generate RAW clip (no captions, no intro title)
        │
        ├── WITH split-screen
        │   └── convertWithSplitScreen() — single FFmpeg pass:
        │       main video top + background video bottom
        │       → vstack → output file
        │
        └── WITHOUT split-screen
            └── convertAspectRatioFile() — single FFmpeg pass:
                applies backgroundStyle filter
                → output file
        │
        ▼
[STEP 4] Generate CAPTIONED clip
        │
        ├── NO captions, no introTitle, no emojis?
        │   └── reuse raw buffer (ZERO extra encoding)
        │
        └── HAS captions / introTitle / emojis
            │
            ▼
            [BUILD ASS SUBTITLES FILE]
            generateASSSubtitles()
            - groups words into lines (wordsPerLine setting)
            - applies animation style:
              ├── "karaoke"      → each word highlighted during its time
              ├── "word-by-word" → words appear one by one
              ├── "bounce"       → scale animation per word
              ├── "fade"         → line fades in
              └── "none"         → whole line appears at once
            - adds introTitle overlay (first 3s, fade in/out)
            - font sizes scaled to output resolution
            │
            ▼
            [FFmpeg single pass: aspect ratio + captions]
            ├── WITH split-screen → convertWithSplitScreen() + subtitlesPath
            └── WITHOUT split-screen → convertAspectRatioFile() + subtitlesPath
        │
        ▼
[STEP 5] Upload BOTH versions to R2
        ├── captioned clip  → storageKey   (what user downloads/shares)
        └── raw clip        → rawStorageKey (used for re-editing captions later)
```

---

### Background Style Decision Tree (Vertical Clips Only)

```
backgroundStyle
        │
        ├── "blur"              → blurred + darkened zoomed background
        ├── "black"             → solid black background
        ├── "white"             → solid white background
        ├── "gradient-ocean"    → blue gradient (#1CB5E0 → #000851)
        ├── "gradient-midnight" → dark blue gradient (#4b6cb7 → #182848)
        ├── "gradient-sunset"   → orange gradient (#FF512F → #F09819)
        ├── "mirror"            → video mirrored top+bottom as background
        └── "zoom"              → zoomed-in dark version as background
```

---

### Quality & Encoding Settings

```
quality
        │
        ├── "720p" / "1080p"   → preset: ultrafast, CRF: 22 (fast, less CPU)
        └── "2k" / "4k"        → preset: medium,    CRF: 18 (better quality)
```

> Plan limits: free/starter → max 1080p. Pro → up to 4k.  
> Split-screen clips always capped at 1080p regardless of plan.

---

## 3️⃣ SMART CROP WORKER

**File:** `src/jobs/smart-crop.worker.ts`  
**Queue:** `smart-crop`  
**Concurrency:** 1  
**Retries:** 2

AI face-detection reframing. Converts 16:9 → 9:16 by tracking faces.

> **Note:** Smart crop can be triggered TWO ways:
>
> 1. **Inline** inside `clip.worker.ts` (if `smartCropEnabled` on the clip job)
> 2. **Standalone queue** via `smart-crop` queue (for on-demand reframe after clip is ready)

---

### Flow

```
[START] Raw clip ready in R2
        │
        ▼
[STATUS] Mark smartCropStatus = "processing"
        │
        ▼
[PYTHON SIDECAR] smart_crop.py
  - Downloads video from signed R2 URL
  - Runs face detection frame by frame
  - Outputs: {clipId}_coords.json
        │
        ▼
[READ RESULT] Parse coords.json
        │
        ├── mode === "skip"
        │   No face detected
        │   smartCropStatus = "skipped"
        │   Keep original clip as-is
        │
        ├── mode === "split"
        │   Screen + face cam detected (e.g. screen recording with PiP)
        │   FFmpegService.applySplitScreen()
        │   Top = screen content, Bottom = face cam
        │
        ├── mode === "mixed"
        │   Some segments have face, some don't
        │   FFmpegService.applyMixedCrop()
        │   Processes each segment separately → concat
        │
        └── mode === "crop"
            Standard face tracking crop
            FFmpegService.applySmartCrop()
            Uses sendcmd for per-frame crop coordinates
        │
        ▼
[STATUS] smartCropStatus = "done"
  smartCropStorageKey + smartCropStorageUrl saved to DB
```

---

## 4️⃣ TRANSLATION WORKER

**File:** `src/jobs/translation.worker.ts`  
**Queue:** `video-translation`  
**Concurrency:** 1 (API-bound, not CPU-bound)  
**Retries:** 3

Translates the video transcript and generates translated caption timing for all clips.

```
[START] User requests translation (source → target language)
        │
        ▼
[STATUS] translationStatus = "translating"
        │
        ▼
[FETCH] Load transcriptWords from video DB record
        │
        ▼
[TRANSLATE] TranslationService.translateTranscript()
  - Sends full transcript to DeepL
  - Re-aligns word timestamps to translated text
  - Returns: translatedText + translatedWords[]
        │
        ▼
[SAVE] Store translated transcript in DB
        │
        ▼
[CLIP CAPTIONS] For each clip in the video:
  - Filter translatedWords within clip time range
  - Apply language-specific style overrides
    (e.g. Arabic → right-to-left, CJK → different font)
  - TranslationModel.saveClipCaptions()
        │
        ▼
[STATUS] translationStatus = "completed"
```

> When a user later regenerates a clip with `targetLanguage` set,
> the clip worker fetches these pre-translated captions and burns them in.

---

## 5️⃣ DUBBING WORKER

**File:** `src/jobs/dubbing.worker.ts`  
**Queue:** `voice-dubbing`  
**Concurrency:** 1  
**Retries:** 2

Full AI voice dubbing pipeline. Requires translation to exist first.

```
[START] DubbingJobData (requires translationId)
        │
        ▼
[STATUS] dubbingStatus = "generating_tts"
        │
        ▼
[FETCH] Load translatedWords from translation record
        │
        ▼
[SEGMENT] Group words into sentence segments
  Splits on: sentence-ending punctuation (. ! ?) or word gap > 1s
        │
        ▼
[TTS LOOP] For each segment:
  TTSService.generateSegment()
  - Provider: ElevenLabs or configured ttsProvider
  - Voice: user-selected voiceId + settings
  ↓
  AudioMixingService.getAudioDuration() on output
  ↓
  AudioMixingService.timeStretch()
  - Stretches/compresses TTS audio to match original timing
        │
        ▼
[CONCATENATE] AudioMixingService.concatenateWithTiming()
  Joins all segments with silence padding to match full video duration
        │
        ▼
[UPLOAD] TTS-only track → R2 (dubbing/{videoId}/{dubbingId}-tts.mp3)
        │
        ▼
[AUDIO MIX] audioMode branch:
        │
        ├── "replace" → use TTS audio as-is (original audio fully replaced)
        │
        └── "duck"    → AudioMixingService.mixAudio()
                        Lower original audio volume to duckVolume%
                        TTS voice plays on top
        │
        ▼
[UPLOAD] Mixed audio → R2 (dubbing/{videoId}/{dubbingId}-mixed.aac)
        │
        ▼
[CLIP SLICES] For each clip:
  AudioMixingService.sliceAudio(mixedAudio, startTime, endTime)
  Upload per-clip audio → R2
  Save clipAudio record to DB
        │
        ▼
[STATUS] dubbingStatus = "completed"
```

> When user exports a clip with dubbing, the clip worker uses the
> pre-sliced per-clip audio instead of the original video audio.

---

## 6️⃣ SOCIAL POSTING WORKER

**File:** `src/jobs/social.worker.ts`  
**Queue:** `social-posting`  
**Concurrency:** default  
**Retries:** 3

Handles posting clips to TikTok, Instagram, YouTube Shorts etc.

```
[START] SocialPostingJobData
  (postId, clipId, platform, caption, hashtags)
        │
        ▼
[FETCH] Load clip storageUrl from DB
        │
        ▼
[POST] Platform-specific API call
  ├── TikTok   → TikTok Content Posting API
  ├── Instagram → Meta Graph API (Reels)
  └── YouTube  → YouTube Data API (Shorts)
        │
        ▼
[STATUS] Update post status in DB
  success → "published" with platform post ID
  failure → "failed" with error message
```

---

## 🔗 Full End-to-End Flow (Happy Path — YouTube, All Features ON)

```
1.  User submits YouTube URL + config
          │
2.  API adds job → video-processing queue (priority by plan)
          │
3.  Video Worker:
      yt-dlp downloads audio
      → R2 upload
      → Deepgram transcription
      → Gemini detects N viral clips
      → Saves N clip records (status: "detected")
      → Queues N jobs → clip-generation queue
          │
4.  Clip Worker (runs N jobs, concurrency=2):
      For each clip:
        yt-dlp downloads video segment
        → FFmpeg: aspect ratio + background style → raw clip
        → FFmpeg: raw clip + ASS captions → captioned clip
        → Upload both to R2
        → Generate thumbnail → R2
        → [if smartCropEnabled] Python face detection → FFmpeg reframe
        → Mark clip "ready"
          │
5.  All N clips ready → Email sent to user
          │
--- Optional flows user can trigger after this point ---
          │
6.  [OPTIONAL] User requests Translation:
      → video-translation queue
      → DeepL translates transcript
      → Saves translated captions per clip
          │
7.  [OPTIONAL] User requests Dubbing:
      → voice-dubbing queue
      → ElevenLabs TTS per segment
      → Time-stretch to match timing
      → Mix with original audio
      → Save per-clip dubbed audio
          │
8.  [OPTIONAL] User regenerates clip with translated captions:
      → New job → clip-generation queue
      → targetLanguage set → fetches translated captions
      → Burns translated captions into new clip
          │
9.  [OPTIONAL] User schedules social post:
      → social-posting queue
      → Posts to TikTok / Instagram / YouTube
```

---

## 🗄️ Job Priority System

```
Plan    │ Priority
────────┼─────────
pro     │    1     ← processed first
starter │    2
free    │    3     ← processed last
```

Controlled by `getPlanPriority()` in `queue.ts`. Applied to both `video-processing` and `clip-generation` queues.

---

## 🔁 Retry & Failure Handling

| Worker         | Max Retries | Notes                                                                                                                      |
| -------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| Video Worker   | 2           | Only marks failed on last attempt. Minutes refunded if transcript never saved. R2 cleaned up only if uploaded in this run. |
| Clip Worker    | 5           | yt-dlp 202/222 errors retried with backoff. `forceKeyframes` disabled after code 222.                                      |
| Smart Crop     | 2           | Python sidecar failure = non-fatal (clip stays as-is)                                                                      |
| Translation    | 3           | Full retry                                                                                                                 |
| Dubbing        | 2           | Full retry                                                                                                                 |
| Social Posting | 3           | Full retry                                                                                                                 |

---

## 📁 Key File Map

```
src/
├── jobs/
│   ├── queue.ts                   ← All queue definitions, job interfaces, priorities
│   ├── video.worker.ts            ← YouTube + Upload video processing
│   ├── clip.worker.ts             ← FFmpeg clip generation + smart crop inline
│   ├── smart-crop.worker.ts       ← Standalone AI reframe worker
│   ├── translation.worker.ts      ← DeepL translation
│   ├── dubbing.worker.ts          ← TTS + audio mixing
│   └── social.worker.ts           ← Social platform posting
│
├── services/
│   ├── ffmpeg.service.ts          ← FFmpeg wrappers (extract, thumbnail, smart crop apply)
│   ├── clip-generator.service.ts  ← Full clip generation pipeline, ASS subtitle builder
│   ├── youtube.service.ts         ← yt-dlp wrapper, audio streaming
│   ├── deepgram.service.ts        ← Transcription
│   ├── viral-detection.service.ts ← Gemini AI clip detection
│   ├── translation.service.ts     ← DeepL + language style overrides
│   ├── tts.service.ts             ← TTS provider abstraction
│   ├── audio-mixing.service.ts    ← FFmpeg audio concat/mix/stretch/slice
│   ├── r2.service.ts              ← Cloudflare R2 upload/download/sign
│   └── split-screen-compositor.service.ts ← Background video download + input args
│
├── models/
│   ├── video-config.model.ts      ← User video settings (aspect ratio, captions, etc.)
│   ├── clip-caption.model.ts      ← Caption words + style stored per clip
│   ├── translation.model.ts       ← Translation records + clip captions
│   └── dubbing.model.ts           ← Dubbing records + clip audio
│
└── scripts/
    └── smart_crop.py              ← Python face detection sidecar (outputs coords.json)
```

---

## ⚠️ Known Gotchas for New Devs

1. **yt-dlp exit code 222** — caused by `--force-keyframes-at-cuts` on certain streams.
   The retry logic automatically disables it. Do NOT remove the retry logic.

2. **Clip worker concurrency > 2** — can cause exit code 202 errors when multiple
   yt-dlp processes compete. Currently capped at 2. Retry handles it but bump carefully.

3. **Smart crop inline vs queued** — smart crop can run inside the clip worker (inline)
   OR as a separate queue job. Both paths exist. Don't add it twice.

4. **Raw clip = no captions** — `rawStorageKey` is intentionally caption-free.
   It's used when the user edits captions in the UI and triggers a re-render.
   The re-render job takes the raw clip and burns new captions.

5. **Minutes deducted at video level, not clip level** — `creditCost: 0` on clip jobs
   is intentional. Minutes already deducted when video was submitted.

6. **Resume logic only exists in video worker** — the clip worker always starts fresh.
   If a clip job fails partway, it re-encodes from scratch.

7. **Signed URLs expire in 1 hour** — all `getSignedDownloadUrl()` calls use `3600s`.
   If a job takes longer (large video + slow encode), the URL can expire mid-job.
   FFmpeg will fail silently with a 403. Use `removeOnFail` logs to catch this.

8. **`QUEUE_PREFIX` env var** — set `QUEUE_PREFIX=local` in `.env.local` to prevent
   your local worker from picking up production jobs from the same Redis.
