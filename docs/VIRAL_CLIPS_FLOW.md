# Viral Clips Generation Flow

## Overview

This system extracts viral-worthy clips from YouTube videos by:
1. Downloading audio from YouTube
2. Transcribing audio to text with timestamps
3. Using LLM to identify viral moments
4. Downloading only the specific video segments
5. Adding captions to the final clips

## Flow Diagram

```
YouTube URL
     │
     ▼
┌─────────────────┐
│ 1. Download     │
│    Audio Only   │  ← yt-dlp (m4a format)
│    (smaller)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 2. Speech to    │
│    Text (STT)   │  ← Deepgram API
│    + Timestamps │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 3. LLM Analysis │
│    Find Viral   │  ← OpenAI / Gemini / Claude
│    Moments      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 4. Download     │
│    Video Clips  │  ← yt-dlp (specific timestamps)
│    (MP4)        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 5. Add Captions │
│    to Clips     │  ← FFmpeg
└────────┬────────┘
         │
         ▼
    Final Clips
    with Captions
```

## Step Details

### Step 1: Audio Download
- **Tool**: yt-dlp
- **Format**: m4a (AAC audio)
- **Why audio only?**: Faster download, smaller file size for transcription

### Step 2: Speech-to-Text
- **Service**: Deepgram
- **Output**: Text with word-level timestamps
- **Format**:
```json
{
  "transcript": "full text here...",
  "words": [
    { "word": "hello", "start": 0.0, "end": 0.5 },
    { "word": "world", "start": 0.6, "end": 1.0 }
  ]
}
```

### Step 3: LLM Analysis
- **Input**: Full transcript with timestamps
- **Output**: Array of viral clip suggestions
```json
{
  "clips": [
    {
      "title": "Unexpected plot twist",
      "start_time": 125.5,
      "end_time": 145.2,
      "reason": "High emotional impact moment",
      "transcript_segment": "..."
    }
  ]
}
```

### Step 4: Video Clip Download
- **Tool**: yt-dlp with timestamp flags
- **Command**: `yt-dlp --download-sections "*START-END" -f mp4 URL`
- **Output**: Individual MP4 clips

### Step 5: Caption Generation
- **Tool**: FFmpeg
- **Input**: Video clip + transcript segment
- **Output**: Video with burned-in captions

---

## Speech-to-Text Models

### Deepgram (Recommended)

| Model | Cost | Speed | Accuracy | Best For |
|-------|------|-------|----------|----------|
| `nova-2` | $0.0043/min | Fast | Best | Production (Recommended) |
| `nova` | $0.0040/min | Fast | Great | General use |
| `enhanced` | $0.0145/min | Medium | Good | Legacy |
| `base` | $0.0125/min | Fast | Basic | Budget |

**Free Tier**: $200 credit on signup (no credit card required)

### Alternatives

| Service | Free Tier | Paid Cost | Notes |
|---------|-----------|-----------|-------|
| **Deepgram** | $200 credit | $0.0043/min | Best accuracy, word timestamps |
| **AssemblyAI** | 100 hrs free | $0.00025/sec | Good accuracy |
| **OpenAI Whisper API** | None | $0.006/min | Good, no word timestamps |
| **Whisper (local)** | Free | Free | Requires GPU, slower |
| **Google Speech** | 60 min/month | $0.006/min | Complex setup |

### Recommendation

**For Development**: Use Deepgram's free $200 credit with `nova-2` model
**For Production**: Deepgram `nova-2` - best balance of cost and accuracy

---

## LLM Models for Viral Detection

### Free Options

| Model | Provider | Limit | Quality |
|-------|----------|-------|---------|
| **Gemini 1.5 Flash** | Google | 15 RPM free | Good |
| **Claude Haiku** | Anthropic | Pay-as-go cheap | Good |
| **Llama 3.1** | Groq | Very fast, free tier | Good |

### Paid Options

| Model | Cost (1M tokens) | Quality |
|-------|------------------|---------|
| **GPT-4o-mini** | $0.15 input / $0.60 output | Great |
| **Claude Sonnet** | $3 input / $15 output | Excellent |
| **Gemini Pro** | $1.25 input / $5 output | Great |

### Recommendation

**For Development**: Gemini 1.5 Flash (free) or GPT-4o-mini (cheap)
**For Production**: GPT-4o-mini or Claude Haiku

---

## Environment Variables

```env
# Deepgram
DEEPGRAM_API_KEY=your_deepgram_key

# LLM (choose one)
OPENAI_API_KEY=your_openai_key
GOOGLE_AI_API_KEY=your_gemini_key
ANTHROPIC_API_KEY=your_claude_key
```

---

## API Endpoints

### POST /api/videos/youtube
Submit YouTube URL for processing

### GET /api/videos/:id/status
Check processing status

### GET /api/videos/:id/clips
Get generated viral clips

### GET /api/videos/:id/transcript
Get full transcript with timestamps
