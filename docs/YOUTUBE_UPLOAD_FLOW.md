# YouTube Video Upload Flow

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT (Frontend)                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ 1. POST /api/videos/youtube
                                      │    { projectId, youtubeUrl }
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API SERVER (Hono)                               │
│  ┌─────────────────┐    ┌──────────────────┐    ┌───────────────────────┐  │
│  │ Video Controller│───▶│   Video Model    │───▶│   PostgreSQL (Neon)   │  │
│  │                 │    │                  │    │   - Create video      │  │
│  │ - Validate URL  │    │ - Create record  │    │   - status: pending   │  │
│  │ - Check project │    │ - Update status  │    │                       │  │
│  └────────┬────────┘    └──────────────────┘    └───────────────────────┘  │
│           │                                                                  │
│           │ 2. Add job to queue                                             │
│           ▼                                                                  │
│  ┌─────────────────┐                                                        │
│  │ BullMQ Queue    │                                                        │
│  │ (video-process) │                                                        │
│  └────────┬────────┘                                                        │
└───────────┼─────────────────────────────────────────────────────────────────┘
            │
            │ 3. Job dispatched via Redis
            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                   REDIS                                      │
│                         (Job Queue Storage)                                  │
└─────────────────────────────────────────────────────────────────────────────┘
            │
            │ 4. Worker picks up job
            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              WORKER PROCESS                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        Video Worker                                  │   │
│  │                                                                      │   │
│  │  ┌──────────────────────────────────────────────────────────────┐   │   │
│  │  │ 5. Stream YouTube → R2 (Direct, No Disk Storage)            │   │   │
│  │  │                                                              │   │   │
│  │  │    YouTube ──[yt-dlp stdout]──▶ R2 Upload                   │   │   │
│  │  │                                                              │   │   │
│  │  │    ✓ Zero disk usage                                        │   │   │
│  │  │    ✓ Faster processing                                      │   │   │
│  │  │    ✓ Memory efficient                                       │   │   │
│  │  └──────────────────────────────────────────────────────────────┘   │   │
│  │         │                   │                                       │   │
│  │         ▼                   ▼                                       │   │
│  │  ┌──────────────┐    ┌──────────────┐                              │   │
│  │  │   YouTube    │    │ Cloudflare   │                              │   │
│  │  │   Servers    │    │     R2       │                              │   │
│  │  └──────────────┘    └──────────────┘                              │   │
│  │                                                                      │   │
│  │  6. Update Database (completed)                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Detailed Flow Sequence

```
┌────────┐     ┌────────┐     ┌────────┐     ┌────────┐     ┌────────┐     ┌────────┐
│ Client │     │  API   │     │Database│     │ Redis  │     │ Worker │     │   R2   │
└───┬────┘     └───┬────┘     └───┬────┘     └───┬────┘     └───┬────┘     └───┬────┘
    │              │              │              │              │              │
    │ POST /youtube│              │              │              │              │
    │─────────────▶│              │              │              │              │
    │              │              │              │              │              │
    │              │ Validate URL │              │              │              │
    │              │──────┐       │              │              │              │
    │              │      │       │              │              │              │
    │              │◀─────┘       │              │              │              │
    │              │              │              │              │              │
    │              │ Check Project│              │              │              │
    │              │─────────────▶│              │              │              │
    │              │◀─────────────│              │              │              │
    │              │              │              │              │              │
    │              │ Create Video │              │              │              │
    │              │ (pending)    │              │              │              │
    │              │─────────────▶│              │              │              │
    │              │◀─────────────│              │              │              │
    │              │              │              │              │              │
    │              │ Add Job      │              │              │              │
    │              │─────────────────────────────▶              │              │
    │              │              │              │              │              │
    │ 201 Created  │              │              │              │              │
    │◀─────────────│              │              │              │              │
    │              │              │              │              │              │
    │              │              │              │ Poll Job     │              │
    │              │              │              │◀─────────────│              │
    │              │              │              │              │              │
    │              │              │              │ Job Data     │              │
    │              │              │              │─────────────▶│              │
    │              │              │              │              │              │
    │              │              │              │              │              │
    │              │              │ Update:      │              │              │
    │              │              │ downloading  │              │              │
    │              │              │◀─────────────────────────────              │
    │              │              │              │              │              │
    │              │              │              │    Stream YouTube → R2      │
    │              │              │              │    (Direct, No Disk)        │
    │              │              │              │              │──────┐       │
    │              │              │              │              │      │       │
    │              │              │              │              │◀─────┘       │
    │              │              │              │              │              │
    │              │              │ Update:      │              │              │
    │              │              │ uploading    │              │              │
    │              │              │◀─────────────────────────────              │
    │              │              │              │              │              │
    │              │              │              │              │ Stream       │
    │              │              │              │              │─────────────▶│
    │              │              │              │              │◀─────────────│
    │              │              │              │              │              │
    │              │              │ Update:      │              │              │
    │              │              │ completed    │              │              │
    │              │              │◀─────────────────────────────              │
    │              │              │              │              │              │
```

---

## Video Status State Machine

```
                    ┌─────────────────────────────────────────┐
                    │                                         │
                    ▼                                         │
              ┌──────────┐                                    │
              │ PENDING  │                                    │
              └────┬─────┘                                    │
                   │                                          │
                   │ Worker picks up job                      │
                   ▼                                          │
            ┌─────────────┐                                   │
            │ DOWNLOADING │                                   │
            └──────┬──────┘                                   │
                   │                                          │
        ┌──────────┴──────────┐                               │
        │                     │                               │
        ▼                     ▼                               │
  ┌───────────┐         ┌──────────┐                          │
  │ UPLOADING │         │  FAILED  │──────────────────────────┤
  └─────┬─────┘         └──────────┘                          │
        │                     ▲                               │
        │                     │                               │
        ▼                     │                               │
  ┌───────────┐               │                               │
  │ COMPLETED │               │                               │
  └───────────┘               │                               │
        │                     │                               │
        └─────────────────────┴───────────────────────────────┘
                          Retry (up to 3 times)
```

---

## Edge Cases Handled

### 1. URL Validation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           URL VALIDATION                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SUPPORTED FORMATS:                                                          │
│  ├── https://www.youtube.com/watch?v=VIDEO_ID                               │
│  ├── https://youtu.be/VIDEO_ID                                              │
│  ├── https://youtube.com/embed/VIDEO_ID                                     │
│  ├── https://youtube.com/v/VIDEO_ID                                         │
│  └── VIDEO_ID (11 characters)                                               │
│                                                                              │
│  VALIDATION CHECKS:                                                          │
│  ├── ✓ Valid URL format                                                     │
│  ├── ✓ Extractable video ID (11 chars, alphanumeric + _ -)                 │
│  └── ✓ YouTube domain verification                                          │
│                                                                              │
│  REJECTED:                                                                   │
│  ├── ✗ Invalid URLs → 400 Bad Request                                       │
│  ├── ✗ Non-YouTube URLs → 400 Bad Request                                   │
│  └── ✗ Malformed video IDs → 400 Bad Request                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2. Job Queue Resilience

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         JOB QUEUE RESILIENCE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  RETRY MECHANISM:                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Attempt 1 ──FAIL──▶ Wait 5s ──▶ Attempt 2 ──FAIL──▶ Wait 10s      │    │
│  │                                                         │           │    │
│  │                                                         ▼           │    │
│  │                                  Attempt 3 ──FAIL──▶ Mark Failed   │    │
│  │                                       │                             │    │
│  │                                       ▼                             │    │
│  │                                   SUCCESS ──▶ Mark Completed        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  CONFIGURATION:                                                              │
│  ├── Max Attempts: 3                                                        │
│  ├── Backoff Type: Exponential                                              │
│  ├── Initial Delay: 5000ms                                                  │
│  ├── Completed Jobs Retention: 100 jobs or 24 hours                         │
│  └── Failed Jobs Retention: 50 jobs or 7 days                               │
│                                                                              │
│  JOB DEDUPLICATION:                                                          │
│  └── Job ID: "video-{videoId}" prevents duplicate processing                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3. Download Failures

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DOWNLOAD FAILURE HANDLING                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  HANDLED SCENARIOS:                                                          │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ 1. VIDEO UNAVAILABLE                                                │    │
│  │    ├── Private video                                                │    │
│  │    ├── Deleted video                                                │    │
│  │    ├── Region-restricted                                            │    │
│  │    └── Age-restricted (without cookies)                             │    │
│  │    Result: Job fails, error message stored in DB                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ 2. NETWORK ISSUES                                                   │    │
│  │    ├── Connection timeout                                           │    │
│  │    ├── DNS resolution failure                                       │    │
│  │    └── Network interruption mid-download                            │    │
│  │    Result: Automatic retry with exponential backoff                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ 3. YT-DLP NOT INSTALLED                                             │    │
│  │    Result: Clear error message "Make sure yt-dlp is installed"      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ 4. RATE LIMITING                                                    │    │
│  │    ├── Optional cookies support via YOUTUBE_COOKIES_PATH            │    │
│  │    └── Exponential backoff on retries                               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ 5. DISK SPACE                                                       │    │
│  │    └── Uses system temp directory, cleaned up after upload          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4. Upload Failures

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          UPLOAD FAILURE HANDLING                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  R2 UPLOAD SCENARIOS:                                                        │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ 1. AUTHENTICATION FAILURE                                           │    │
│  │    ├── Invalid R2 credentials                                       │    │
│  │    └── Expired tokens                                               │    │
│  │    Result: Job fails with clear error, retry won't help             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ 2. BUCKET ISSUES                                                    │    │
│  │    ├── Bucket doesn't exist                                         │    │
│  │    └── No write permissions                                         │    │
│  │    Result: Job fails, requires configuration fix                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ 3. NETWORK TIMEOUT                                                  │    │
│  │    └── Upload interruption during streaming                         │    │
│  │    Result: Automatic retry (stream can be recreated)                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ 4. STREAM ERRORS                                                    │    │
│  │    └── YouTube stream interrupted mid-transfer                      │    │
│  │    Result: Automatic retry with exponential backoff                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  CLEANUP:                                                                    │
│  └── No cleanup needed (no temporary files created)                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5. Disk Space

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DATABASE CONSISTENCY                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  STATUS TRACKING:                                                            │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                     │    │
│  │   API Request                     Worker Processing                 │    │
│  │        │                                │                           │    │
│  │        ▼                                ▼                           │    │
│  │   ┌─────────┐                    ┌─────────────┐                    │    │
│  │   │ pending │───────────────────▶│ downloading │                    │    │
│  │   └─────────┘                    └──────┬──────┘                    │    │
│  │                                         │                           │    │
│  │                                         ▼                           │    │
│  │                                  ┌───────────┐                      │    │
│  │                                  │ uploading │                      │    │
│  │                                  └─────┬─────┘                      │    │
│  │                                        │                            │    │
│  │                              ┌─────────┴─────────┐                  │    │
│  │                              ▼                   ▼                  │    │
│  │                        ┌───────────┐       ┌────────┐              │    │
│  │                        │ completed │       │ failed │              │    │
│  │                        └───────────┘       └────────┘              │    │
│  │                                                 │                   │    │
│  │                                                 ▼                   │    │
│  │                                          errorMessage               │    │
│  │                                            stored                   │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  DATA STORED ON SUCCESS:                                                     │
│  ├── storageKey: R2 object key                                              │
│  ├── storageUrl: Public/signed URL                                          │
│  ├── title: Video title from YouTube                                        │
│  ├── duration: Video length in seconds                                      │
│  ├── fileSize: File size in bytes                                           │
│  ├── mimeType: video/mp4                                                    │
│  └── metadata: { youtubeId, thumbnail, channelName }                        │
│                                                                              │
│  DATA STORED ON FAILURE:                                                     │
│  └── errorMessage: Detailed error description                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6. Concurrent Processing

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CONCURRENT PROCESSING                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  WORKER CONFIGURATION:                                                       │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                     │    │
│  │   Worker Process (concurrency: 2)                                   │    │
│  │   ┌─────────────────────────────────────────────────────────────┐  │    │
│  │   │                                                             │  │    │
│  │   │   ┌─────────────┐         ┌─────────────┐                  │  │    │
│  │   │   │   Slot 1    │         │   Slot 2    │                  │  │    │
│  │   │   │  Processing │         │  Processing │                  │  │    │
│  │   │   │   Video A   │         │   Video B   │                  │  │    │
│  │   │   └─────────────┘         └─────────────┘                  │  │    │
│  │   │                                                             │  │    │
│  │   └─────────────────────────────────────────────────────────────┘  │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  BENEFITS:                                                                   │
│  ├── Parallel video processing                                              │
│  ├── Better resource utilization                                            │
│  └── Faster queue processing                                                │
│                                                                              │
│  SAFEGUARDS:                                                                 │
│  ├── Unique job IDs prevent duplicate processing                            │
│  ├── Each video gets isolated temp directory                                │
│  └── Database updates are atomic per video                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7. Graceful Shutdown

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          GRACEFUL SHUTDOWN                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SIGNAL HANDLING:                                                            │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                     │    │
│  │   SIGTERM/SIGINT received                                          │    │
│  │          │                                                          │    │
│  │          ▼                                                          │    │
│  │   ┌──────────────────────┐                                         │    │
│  │   │ Stop accepting new   │                                         │    │
│  │   │ jobs from queue      │                                         │    │
│  │   └──────────┬───────────┘                                         │    │
│  │              │                                                      │    │
│  │              ▼                                                      │    │
│  │   ┌──────────────────────┐                                         │    │
│  │   │ Wait for current     │                                         │    │
│  │   │ jobs to complete     │                                         │    │
│  │   └──────────┬───────────┘                                         │    │
│  │              │                                                      │    │
│  │              ▼                                                      │    │
│  │   ┌──────────────────────┐                                         │    │
│  │   │ Close Redis          │                                         │    │
│  │   │ connection           │                                         │    │
│  │   └──────────┬───────────┘                                         │    │
│  │              │                                                      │    │
│  │              ▼                                                      │    │
│  │   ┌──────────────────────┐                                         │    │
│  │   │ Exit process         │                                         │    │
│  │   └──────────────────────┘                                         │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  RESULT:                                                                     │
│  ├── No jobs lost mid-processing                                            │
│  ├── Incomplete jobs remain in queue for restart                            │
│  └── Clean resource cleanup                                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Error Response Codes

| Code | Scenario | Response |
|------|----------|----------|
| 400 | Invalid YouTube URL | `{ error: "Invalid YouTube URL" }` |
| 400 | Missing required fields | `{ error: "Project ID and YouTube URL are required" }` |
| 401 | Not authenticated | `{ error: "Unauthorized" }` |
| 404 | Project not found | `{ error: "Project not found" }` |
| 404 | Video not found | `{ error: "Video not found" }` |
| 500 | Server error | `{ error: "Failed to submit video" }` |

---

## Monitoring Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/videos/:id/status` | Get video processing status + job progress |
| `GET /api/videos/validate-youtube?url=` | Pre-validate URL before submission |

---

## File Storage Structure

```
Cloudflare R2 Bucket
└── videos/
    └── {projectId}/
        └── {timestamp}-{youtubeId}.mp4
```

Example: `videos/abc123/1705432800000-dQw4w9WgXcQ.mp4`
