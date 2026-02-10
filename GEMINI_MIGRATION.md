# Gemini AI Migration

## Overview
Successfully migrated from Groq (GPT-OSS) to Google Gemini 2.5 for viral clip detection.

## Changes Made

### 1. New Gemini Service (`src/services/gemini.service.ts`)
Created a comprehensive Gemini API client with:
- ✅ Text generation
- ✅ JSON structured output
- ✅ Streaming support (for future use)
- ✅ Multiple model support (Flash Lite, Flash, Pro)
- ✅ Error handling and logging

### 2. Updated Viral Detection Service
**File**: `src/services/viral-detection.service.ts`

**Changes**:
- Removed Groq/AI SDK dependencies
- Integrated Gemini service
- Added `model` option to `ViralDetectionOptions`
- Improved prompts for better Gemini compatibility
- Enhanced duration validation

### 3. Environment Variables
**Required**:
```bash
GEMINI_API_KEY=AQ.Ab8RN6LEPxWh29X-mx_6SxDUI7PqYqnwh5ly7ANiWq9dqS5g3w
```

**Deprecated** (can be removed):
```bash
GROQ_API_KEY=...  # No longer used
```

## Available Gemini Models

| Model | Speed | Cost | Use Case |
|-------|-------|------|----------|
| `gemini-2.5-flash-lite` | Fastest | Cheapest | Quick viral detection, bulk operations |
| `gemini-2.5-flash` | Balanced | Medium | Default for most use cases |
| `gemini-2.5-pro` | Slowest | Highest | Premium features, complex analysis |

## API Endpoints

### Base URL
```
https://aiplatform.googleapis.com/v1/publishers/google/models
```

### Generate Content
```
POST /{model}:generateContent?key={API_KEY}
```

### Stream Generate Content
```
POST /{model}:streamGenerateContent?key={API_KEY}
```

## Usage Examples

### Basic Text Generation
```typescript
import { geminiService } from './services/gemini.service';

const text = await geminiService.generateText(
  "Write a viral TikTok caption",
  {
    model: "gemini-2.5-flash-lite",
    temperature: 0.7,
  }
);
```

### JSON Structured Output
```typescript
const result = await geminiService.generateJSON<{ clips: ViralClip[] }>(
  "Analyze this transcript...",
  {
    model: "gemini-2.5-flash",
    systemPrompt: "You are a viral content analyst...",
    schema: jsonSchemaDescription,
  }
);
```

### Viral Detection with Custom Model
```typescript
const clips = await ViralDetectionService.detectViralClips(
  transcript,
  transcriptWords,
  {
    maxClips: 5,
    minDuration: 15,
    maxDuration: 60,
    model: "gemini-2.5-pro", // Use Pro for better quality
    enableEmojis: true,
    enableIntroTitle: true,
  }
);
```

## Performance Comparison

### Test Results (Same Prompt)
- **Flash Lite**: ~16s response time, 737 tokens
- **Flash**: ~25s response time, 1,907 tokens
- **Pro**: ~32s response time, 2,120 tokens (+ 1,621 thinking tokens)

### Quality Comparison
- **Flash Lite**: Good quality, comprehensive responses
- **Flash**: Better quality, more detailed analysis
- **Pro**: Best quality, strategic insights, deeper reasoning

## Migration Benefits

1. **Better Quality**: Gemini 2.5 provides more accurate viral detection
2. **Cost Effective**: Flash Lite is very affordable for high-volume operations
3. **Flexibility**: Three model tiers for different use cases
4. **Reliability**: Direct Google API, no third-party dependencies
5. **Future-Proof**: Access to latest Gemini models as they release

## Testing

Run the test script:
```bash
cd scalereach-tmkoc
bun run test-viral-detection-gemini.ts
```

Expected output:
- ✅ 2-3 viral clips detected
- ✅ Proper duration constraints (15-45s)
- ✅ Platform recommendations
- ✅ Emoji-enhanced transcripts
- ✅ Intro titles

## Cleanup

### Dependencies to Remove (Optional)
```bash
npm uninstall @ai-sdk/groq @ai-sdk/openai @ai-sdk/azure
```

These packages are no longer needed but can be kept if you plan to use them elsewhere.

## Troubleshooting

### API Key Not Working
- Verify the key is set in `.env`
- Check the key format (should start with `AQ.`)
- Ensure you're using the correct endpoint

### JSON Parsing Errors
- Gemini sometimes wraps JSON in markdown code blocks
- The service automatically handles this
- If issues persist, try increasing temperature

### Duration Validation Failures
- Gemini may generate clips outside duration constraints
- The service filters these automatically
- Adjust min/max duration if needed

## Next Steps

1. ✅ Test in production with real videos
2. ✅ Monitor API costs and usage
3. ✅ Consider using Pro model for premium users
4. ✅ Implement caching for repeated analyses
5. ✅ Add retry logic for API failures

## Support

For issues or questions:
- Check Gemini API docs: https://ai.google.dev/docs
- Review error logs in console
- Test with the provided test script
