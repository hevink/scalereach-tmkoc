# Split Screen Background Clips - Source Links

## How to Download

Use `yt-dlp` to download these clips in HD vertical (1080x1920) format:

```bash
# Download single video in best quality
yt-dlp -f "bestvideo[height>=1080]+bestaudio/best" -o "seed-background-video/<category>/<name>.mp4" "<URL>"

# If video is horizontal, crop to vertical 9:16 after download:
ffmpeg -i input.mp4 -vf "crop=ih*9/16:ih" -c:a copy output.mp4
```

Place downloaded files in `seed-background-video/<category>/` folder, then run:
```bash
bun run add-split-screen-clips.ts
```

---

## Existing Categories (already in R2)
- **Subway Surfer** — 2 clips ✅
- **Minecraft** — 8 clips ✅
- **ASMR** — 1 clip ✅
- **GTA 5** — 13 clips ✅

---

## NEW: ASMR Clips (additional)

Search YouTube for: `"ASMR satisfying" vertical 9:16 no copyright gameplay background`

Recommended sources (vertical 9:16, HD, no commentary):
1. https://www.youtube.com/results?search_query=asmr+satisfying+vertical+9%3A16+no+copyright+background
2. https://www.youtube.com/results?search_query=satisfying+slime+soap+cutting+vertical+free+to+use
3. https://pixabay.com/videos/search/oddly%20satisfying%20video/ (royalty-free)

Target files:
- `seed-background-video/asmr/asmr-2.mp4`
- `seed-background-video/asmr/asmr-3.mp4`
- `seed-background-video/asmr/asmr-4.mp4`
- `seed-background-video/asmr/asmr-5.mp4`

---

## NEW: Fortnite Clips

Search YouTube for: `"fortnite gameplay" vertical 9:16 no copyright free to use background`

Recommended sources (vertical 9:16, HD, no commentary):
1. https://www.youtube.com/results?search_query=fortnite+gameplay+vertical+9%3A16+no+copyright+free+background
2. https://www.youtube.com/results?search_query=fortnite+building+gameplay+vertical+free+to+use
3. https://pixabay.com/videos/search/fortnite/ (royalty-free stock clips)
4. https://ko-fi.com search for "fortnite gameplay vertical 9:16 no copyright"

Target files:
- `seed-background-video/fortnite/fortnite-1.mp4`
- `seed-background-video/fortnite/fortnite-2.mp4`
- `seed-background-video/fortnite/fortnite-3.mp4`
- `seed-background-video/fortnite/fortnite-4.mp4`
- `seed-background-video/fortnite/fortnite-5.mp4`

---

## NEW: Trackmania Clips

Search YouTube for: `"trackmania gameplay" vertical 9:16 no copyright free background`

Recommended sources (vertical 9:16, HD, no commentary):
1. https://www.youtube.com/results?search_query=trackmania+gameplay+vertical+9%3A16+no+copyright+free+background
2. https://www.youtube.com/results?search_query=trackmania+racing+vertical+free+to+use+background
3. https://ko-fi.com search for "trackmania gameplay vertical no copyright"

Target files:
- `seed-background-video/trackmania/trackmania-1.mp4`
- `seed-background-video/trackmania/trackmania-2.mp4`
- `seed-background-video/trackmania/trackmania-3.mp4`
- `seed-background-video/trackmania/trackmania-4.mp4`
- `seed-background-video/trackmania/trackmania-5.mp4`

---

## Requirements for all clips
- **Resolution**: 1080x1920 (vertical 9:16) preferred, or horizontal that can be cropped
- **Duration**: 60+ seconds minimum (longer is better, the system loops short clips)
- **Quality**: HD (1080p minimum)
- **Audio**: Not important (audio is stripped during split-screen composition)
- **Content**: Engaging gameplay footage, no commentary/facecam overlays
