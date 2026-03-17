#!/usr/bin/env python3
"""
Smart Crop Sidecar - Production Script (Improved)
Called by Node.js worker via child_process.spawn

Usage: python3 smart_crop.py <videoUrl> <clipId> <tmpDir>

Output: {tmpDir}/{clipId}_coords.json
  [{ "t": 0.0, "x": 0, "y": 0, "w": 607, "h": 1080 }, ...]
  OR for split-screen mode:
  { "mode": "split", "top": {...}, "bottom": {...} }

Exit 0 on success, non-zero on failure.

Environment:
  HF_TOKEN   - HuggingFace token for pyannote.audio (optional)
  MODEL_PATH - Path to blaze_face_short_range.tflite (default: /tmp/blaze_face_short_range.tflite)

Video type detection (auto):
  - podcast/talking-head  → face tracking crop (9:16)
  - screen + PiP face cam → split screen (screen top 60%, face bottom 40%)
  - no face detected      → center crop fallback

Improvements over v1:
  - Adaptive alpha (velocity-aware EMA smoothing)
  - Velocity-based prediction when face is missing (no more freeze-then-jump)
  - Face identity matching across frames (no more ID swaps in two-person scenes)
  - Head room / vertical crop positioning (face placed at 20% from top)
  - fd_map for fast timestamp → face lookup
"""

import sys
import os
import json
import subprocess

def log(msg):
    print(f"[SMART CROP PY] {msg}", flush=True)

# ── Args ──────────────────────────────────────────────────────────────────────

if len(sys.argv) < 4:
    print("Usage: python3 smart_crop.py <videoUrl> <clipId> <tmpDir>")
    sys.exit(1)

video_url = sys.argv[1]
clip_id   = sys.argv[2]
tmp_dir   = sys.argv[3]

audio_path  = os.path.join(tmp_dir, f"{clip_id}.wav")
coords_path = os.path.join(tmp_dir, f"{clip_id}_coords.json")

log(f"clip_id={clip_id} tmp_dir={tmp_dir}")

# ── Safe fallback helper ──────────────────────────────────────────────────────
# If ANYTHING goes wrong, write a skip file so the Node.js worker can still
# produce a center-cropped clip instead of failing entirely.

def write_fallback_and_exit(reason, exit_code=0):
    """Write a safe skip coords file and exit. The clip won't be smart-cropped
    but it won't fail either — Node.js will fall back to center crop."""
    log(f"FALLBACK: {reason} — writing skip coords so clip generation continues")
    try:
        with open(coords_path, "w") as f:
            json.dump({"mode": "skip", "fallback_reason": reason}, f)
    except Exception as e:
        # Last resort: even if we can't write the file, exit cleanly
        log(f"FALLBACK: Could not write coords file: {e}")
    sys.exit(exit_code)

# ── Imports ───────────────────────────────────────────────────────────────────

try:
    import cv2
    import numpy as np
    import mediapipe as mp
    from mediapipe.tasks import python as mp_python
    from mediapipe.tasks.python import vision as mp_vision
except ImportError as e:
    log(f"ERROR: Missing dependency: {e}")
    write_fallback_and_exit(f"missing dependency: {e}", exit_code=0)

# ── Step 1: Use source video directly (already downloaded by Node.js worker) ──
# The input file is a local temp file passed by the clip generator - no copy needed.

local_video = video_url  # video_url is actually a local file path from Node.js

if not os.path.exists(local_video):
    log(f"ERROR: Source file not found: {local_video}")
    write_fallback_and_exit("source file not found")

log(f"Using source file directly: {local_video}")

# ── Step 2: Video dimensions ──────────────────────────────────────────────────

try:
    cap      = cv2.VideoCapture(local_video)
    if not cap.isOpened():
        write_fallback_and_exit("cv2.VideoCapture failed to open source file")
    src_w    = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    src_h    = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps      = cap.get(cv2.CAP_PROP_FPS)
    total_f  = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_f / fps if fps > 0 else 0
    cap.release()
except Exception as e:
    write_fallback_and_exit(f"failed to read video dimensions: {e}")

if src_w == 0 or src_h == 0 or fps <= 0 or duration <= 0:
    write_fallback_and_exit(f"invalid video dimensions ({src_w}x{src_h}, fps={fps}, dur={duration})")

log(f"Video: {src_w}x{src_h} @ {fps:.1f}fps, {duration:.1f}s")

# ── Speed optimization: pre-downscale large videos for face detection ─────────
# OpenCV decodes full-res frames even if we resize after. For 4K+ videos,
# create a 720p proxy for face detection (FFmpeg decode is much faster).
# Proxy is keyed by source file path so multiple clips from the same video reuse it.
PROXY_MAX_H = 720
proxy_video = local_video
proxy_scale = 1.0
if src_h > PROXY_MAX_H:
    # Use source file basename (without clip-specific prefix) to share proxy across clips
    import hashlib
    source_hash = hashlib.md5(os.path.realpath(local_video).encode()).hexdigest()[:12]
    proxy_video = os.path.join(tmp_dir, f"proxy_{source_hash}_{PROXY_MAX_H}p.mp4")
    proxy_scale = PROXY_MAX_H / src_h

    if os.path.exists(proxy_video):
        log(f"Reusing existing proxy: {proxy_video}")
    else:
        log(f"Pre-downscaling {src_w}x{src_h} → {int(src_w * proxy_scale)}x{PROXY_MAX_H} for face detection...")
        proxy_result = subprocess.run(
            ["ffmpeg", "-y", "-i", local_video,
             "-vf", f"scale=-2:{PROXY_MAX_H}", "-c:v", "libx264", "-preset", "ultrafast",
             "-crf", "28", "-an", proxy_video],
            capture_output=True
        )
        if proxy_result.returncode != 0:
            log("WARNING: Proxy downscale failed, using original")
            proxy_video = local_video
            proxy_scale = 1.0
        else:
            log("Proxy ready.")

crop_w = int(src_h * 9 / 16)
if crop_w > src_w:
    crop_w = src_w
crop_w = crop_w - (crop_w % 2)  # ensure even for libx264
crop_h = src_h - (src_h % 2)    # ensure even for libx264

# ── Early exit: already portrait or nearly square ─────────────────────────────

aspect_ratio = src_w / src_h if src_h > 0 else 1.0
if aspect_ratio <= 0.65:
    log(f"Video is already portrait ({src_w}x{src_h}, ratio={aspect_ratio:.2f}) - skipping reframe")
    with open(coords_path, "w") as f:
        json.dump({"mode": "skip"}, f)
    sys.exit(0)

# ── Step 3: Face detection setup ──────────────────────────────────────────────

model_path = os.environ.get("MODEL_PATH", "/tmp/blaze_face_short_range.tflite")
if not os.path.exists(model_path):
    log(f"Downloading face detector model...")
    try:
        import urllib.request
        urllib.request.urlretrieve(
            "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
            model_path
        )
    except Exception as e:
        write_fallback_and_exit(f"failed to download face detector model: {e}")

try:
    base_options  = mp_python.BaseOptions(model_asset_path=model_path)
    detector_opts = mp_vision.FaceDetectorOptions(base_options=base_options, min_detection_confidence=0.25)
    face_detector = mp_vision.FaceDetector.create_from_options(detector_opts)
except Exception as e:
    write_fallback_and_exit(f"failed to initialize face detector: {e}")

# ── Speed optimization: downscale large frames for face detection ─────────────
# MediaPipe doesn't need full resolution - 480p is plenty for face detection.
# This gives ~4-6x speedup on 1080p and ~16x on 4K.
DETECT_MAX_H = 480

def detect_faces_in_frame(frame, proxy_scale=1.0):
    """Detect faces in a single frame. Returns empty list on any error
    so one bad frame never crashes the entire pipeline."""
    try:
        orig_h, orig_w = frame.shape[:2]
        if orig_h == 0 or orig_w == 0:
            return []
        # If we're already using a proxy video, coordinates need to be scaled back
        # to original resolution. Also downscale further for detection if still large.
        if orig_h > DETECT_MAX_H:
            det_scale = DETECT_MAX_H / orig_h
            small = cv2.resize(frame, (int(orig_w * det_scale), DETECT_MAX_H), interpolation=cv2.INTER_AREA)
        else:
            small = frame
            det_scale = 1.0

        rgb      = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        results  = face_detector.detect(mp_image)
        faces = []
        # Total scale from detection pixels back to original video resolution
        total_scale = 1.0 / (det_scale * proxy_scale) if proxy_scale != 1.0 else 1.0 / det_scale
        if results.detections:
            for det in results.detections:
                bb = det.bounding_box
                # Scale coordinates back to original resolution
                x = int(bb.origin_x * total_scale)
                y = int(bb.origin_y * total_scale)
                w = int(bb.width * total_scale)
                h = int(bb.height * total_scale)
                if w <= 0 or h <= 0:
                    continue  # skip degenerate detections
                orig_full_w = int(orig_w / proxy_scale) if proxy_scale != 1.0 else orig_w
                # Use nose+eye blend as face center - more accurate than bbox center
                kps = det.keypoints
                if len(kps) >= 3:
                    eye_cx  = int((kps[0].x + kps[1].x) / 2 * orig_full_w)
                    nose_cx = int(kps[2].x * orig_full_w)
                    face_cx = int(eye_cx * 0.4 + nose_cx * 0.6)
                elif len(kps) >= 2:
                    face_cx = int((kps[0].x + kps[1].x) / 2 * orig_full_w)
                else:
                    face_cx = x + w // 2
                # Clamp face center to valid range
                face_cx = max(0, min(face_cx, src_w))
                faces.append({"x": x, "y": y, "w": w, "h": h, "cx": face_cx, "cy": y + h//2, "area": w * h})
        return faces
    except Exception as e:
        # Log but don't crash — this frame just has no faces
        log(f"WARNING: Face detection failed on frame: {e}")
        return []

# ── IMPROVEMENT 1: Face identity matching across frames ───────────────────────

def match_faces_across_frames(prev_faces, curr_faces):
    if not prev_faces or not curr_faces:
        return curr_faces
    matched = []
    used = set()
    for pf in prev_faces:
        candidates = [(i, cf) for i, cf in enumerate(curr_faces) if i not in used]
        if not candidates:
            break
        best_i, best_face = min(
            candidates,
            key=lambda ic: abs(ic[1]["cx"] - pf["cx"]) + abs(ic[1]["cy"] - pf["cy"])
        )
        used.add(best_i)
        matched.append(best_face)
    for i, cf in enumerate(curr_faces):
        if i not in used:
            matched.append(cf)
    return matched

# ── IMPROVEMENT 2: Head room - vertical crop positioning ──────────────────────

def get_crop_y(faces, src_h, crop_h):
    if not faces:
        # No face - center crop vertically (better for B-roll / text screens)
        return max(0, (src_h - crop_h) // 2)
    top_face_y = min(f["y"] for f in faces)
    target_y = top_face_y - int(crop_h * 0.20)
    return max(0, min(target_y, src_h - crop_h))

# ── Step 4: Video type detection ─────────────────────────────────────────────

log("Detecting video type...")

# Sample more frames for better classification (15 instead of 9)
sample_times = [duration * i / 16 for i in range(1, 16)]
sample_faces = []
pip_detections = 0
full_detections = 0
small_corner_count = 0  # Track consistent small corner faces

try:
    cap = cv2.VideoCapture(proxy_video)
    if not cap.isOpened():
        log("WARNING: Could not open proxy video for type detection, trying original")
        cap = cv2.VideoCapture(local_video)
        proxy_scale = 1.0
        if not cap.isOpened():
            write_fallback_and_exit("could not open video for type detection")
    for t in sample_times:
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ret, frame = cap.read()
        if not ret:
            continue
        faces = detect_faces_in_frame(frame, proxy_scale)
        sample_faces.append(faces)

        for face in faces:
            w_ratio = face["w"] / src_w if src_w > 0 else 0
            h_ratio = face["h"] / src_h if src_h > 0 else 0

            log(f"  face: cx={face['cx']}, cy={face['cy']}, w={face['w']}, h={face['h']}, w_ratio={w_ratio:.3f}, area={face['area']}")

            is_small_face = w_ratio < 0.10
            in_corner = (face["cx"] < src_w * 0.30 or face["cx"] > src_w * 0.70) and \
                        (face["cy"] < src_h * 0.30 or face["cy"] > src_h * 0.70)
            on_side = face["cx"] < src_w * 0.25 or face["cx"] > src_w * 0.75
            is_centered = src_w * 0.15 < face["cx"] < src_w * 0.85 and \
                          src_h * 0.15 < face["cy"] < src_h * 0.85 and \
                          w_ratio >= 0.08

            if is_small_face and in_corner:
                pip_detections += 2
                small_corner_count += 1
            elif is_small_face and on_side:
                pip_detections += 1
            elif is_small_face:
                pip_detections += 1
            elif is_centered:
                full_detections += 1
            else:
                full_detections += 1

        centered_faces = [f for f in faces if src_w * 0.25 < f["cx"] < src_w * 0.75
                          and f["w"] / src_w >= 0.08]
        if len(centered_faces) >= 2:
            full_detections += 2

    cap.release()
except Exception as e:
    log(f"WARNING: Video type detection failed: {e}")
    try: cap.release()
    except: pass
    # If type detection fails entirely, fall back to skip (center crop)
    write_fallback_and_exit(f"video type detection crashed: {e}")

total_face_frames = sum(1 for f in sample_faces if f)
no_face_frames    = len(sample_times) - total_face_frames

# Detect group shots: if 4+ faces appear consistently, it's a group/panel shot
group_shot_frames = sum(1 for f in sample_faces if len(f) >= 4)
is_group_shot = group_shot_frames >= len(sample_times) * 0.4  # 4+ faces in 40%+ of samples

# Detect dual-face podcast: exactly 2 faces in 40%+ of sampled frames
dual_face_frames = sum(1 for f in sample_faces if len(f) == 2)
# Also check that the two faces are reasonably sized (not tiny PiP)
# AND sufficiently far apart (real 2-person podcasts have speakers on opposite sides)
dual_face_big_frames = 0
dual_face_spread_frames = 0
for faces in sample_faces:
    if len(faces) == 2:
        both_big = all(f["w"] / src_w >= 0.08 for f in faces)
        if both_big:
            dual_face_big_frames += 1
            # Check if the two faces are far enough apart to be separate speakers
            # Real dual podcasts: speakers are typically 30%+ of frame width apart
            sorted_f = sorted(faces, key=lambda f: f["cx"])
            gap_ratio = (sorted_f[1]["cx"] - sorted_f[0]["cx"]) / src_w
            if gap_ratio >= 0.25:
                dual_face_spread_frames += 1
is_dual_face_podcast = dual_face_spread_frames >= len(sample_times) * 0.35

# Screen PiP detection:
# - If we see consistent small corner faces (even just 2+), it's screen_pip
# - Or if pip score is high enough relative to full
if total_face_frames == 0:
    video_type = "no_face"
elif is_group_shot:
    video_type = "group"
elif small_corner_count >= 2:
    # Consistent small face in corner = definitely screen recording with webcam
    video_type = "screen_pip"
elif pip_detections >= 3 and pip_detections >= full_detections * 0.5:
    video_type = "screen_pip"
elif is_dual_face_podcast:
    video_type = "podcast_dual"
else:
    video_type = "podcast"

log(f"Video type: {video_type} (pip={pip_detections}, full={full_detections}, no_face={no_face_frames}, small_corner={small_corner_count}, group_frames={group_shot_frames}/{len(sample_times)}, dual_face={dual_face_spread_frames}/{len(sample_times)})")

# ── Step 5: Handle each video type ───────────────────────────────────────────

if video_type == "no_face":
    log("No faces detected - skipping reframe, keeping original 16:9")
    with open(coords_path, "w") as f:
        json.dump({"mode": "skip"}, f)
    log("Done (skip - no face).")
    sys.exit(0)

if video_type == "group":
    log(f"Group shot detected (4+ faces) - letterboxing full frame into 9:16")
    with open(coords_path, "w") as f:
        json.dump({"mode": "letterbox", "src_w": src_w, "src_h": src_h}, f)
    log("Done (letterbox - group shot).")
    sys.exit(0)

if video_type == "screen_pip":
    log("Screen recording with PiP face cam - using split screen mode")

    pip_region = {"x": src_w - src_w // 4, "y": src_h - src_h // 4, "w": src_w // 4, "h": src_h // 4}
    for faces in sample_faces:
        for face in faces:
            face_w_ratio = face["w"] / src_w
            in_corner = (face["cx"] < src_w * 0.35 or face["cx"] > src_w * 0.65) and \
                        (face["cy"] < src_h * 0.35 or face["cy"] > src_h * 0.65)
            is_small  = face_w_ratio < 0.25
            if in_corner or is_small:
                pad = int(face["w"] * 0.8)
                pip_region = {
                    "x": max(0, face["x"] - pad),
                    "y": max(0, face["y"] - pad),
                    "w": min(src_w - max(0, face["x"] - pad), face["w"] + pad * 2),
                    "h": min(src_h - max(0, face["y"] - pad), face["h"] + pad * 2),
                }
                break
        else:
            continue
        break

    log(f"PiP region: {pip_region}")

    # Screen region: everything except the PiP corner
    pip_cx = pip_region["x"] + pip_region["w"] // 2
    if pip_cx > src_w * 0.5:
        screen_x = 0
        screen_w = pip_region["x"]
    else:
        screen_x = pip_region["x"] + pip_region["w"]
        screen_w = src_w - screen_x

    if screen_w < 100:
        screen_w = src_w
        screen_x = 0

    # Layout: face on TOP, screen on BOTTOM (zoomed 1.25x)
    # Target: 1080x1920 portrait
    target_w = crop_w if crop_w > 0 else int(src_h * 9 / 16)
    target_h = src_h  # full portrait height
    # Face takes ~55% of height, screen takes ~45%
    face_h = int(target_h * 0.55)
    screen_h = target_h - face_h

    result = {
        "mode": "split",
        "screen": {"x": screen_x, "y": 0, "w": screen_w, "h": src_h},
        "pip": pip_region,
        "src_w": src_w,
        "src_h": src_h,
        "target_w": target_w,
        "face_h": face_h,
        "screen_h": screen_h,
        "screen_zoom": 1.25,
    }
    with open(coords_path, "w") as f:
        json.dump(result, f)
    log("Done (split screen mode).")
    sys.exit(0)

# ── 5c-dual: Podcast with 2 speakers → stacked dual-face crop ────────────────

if video_type == "podcast_dual":
    log("Podcast dual-face detected - using static stacked layout...")

    # ── Collect face positions from all 2-face sample frames ──────────────
    left_faces_all = []
    right_faces_all = []
    for faces in sample_faces:
        if len(faces) >= 2:
            sorted_f = sorted(faces, key=lambda f: f["cx"])
            left_faces_all.append(sorted_f[0])
            right_faces_all.append(sorted_f[1])

    if not left_faces_all:
        log("WARNING: No dual-face frames found, falling back to single-face podcast")
        video_type = "podcast"
    else:
        # Average face positions and sizes
        avg_left_cx = int(sum(f["cx"] for f in left_faces_all) / len(left_faces_all))
        avg_left_cy = int(sum(f["cy"] for f in left_faces_all) / len(left_faces_all))
        avg_left_w  = int(sum(f["w"]  for f in left_faces_all) / len(left_faces_all))

        avg_right_cx = int(sum(f["cx"] for f in right_faces_all) / len(right_faces_all))
        avg_right_cy = int(sum(f["cy"] for f in right_faces_all) / len(right_faces_all))
        avg_right_w  = int(sum(f["w"]  for f in right_faces_all) / len(right_faces_all))

        log(f"Left speaker:  cx={avg_left_cx}, cy={avg_left_cy}, face_w={avg_left_w}")
        log(f"Right speaker: cx={avg_right_cx}, cy={avg_right_cy}, face_w={avg_right_w}")

        # ── Static crop approach (like Opus Clip / ClipsAI) ───────────────
        # Each panel is 9:8 aspect ratio (half of 9:16 output).
        # We compute ONE static crop rectangle per speaker, centered on their face.
        # No dynamic tracking needed — podcast speakers don't move much.
        panel_aspect = 9.0 / 8.0

        # The midpoint between speakers — crops must not cross this
        mid_x = (avg_left_cx + avg_right_cx) // 2

        # Max crop width per speaker = distance from edge to midpoint
        left_max_w = mid_x
        right_max_w = src_w - mid_x
        max_crop_w = min(left_max_w, right_max_w)

        # Crop height = full source height, derive width from aspect ratio
        face_crop_h = src_h
        face_crop_w = int(face_crop_h * panel_aspect)

        # Cap to available space (no overlap possible)
        if face_crop_w > max_crop_w:
            face_crop_w = max_crop_w
            face_crop_h = int(face_crop_w / panel_aspect)

        # Ensure even dimensions
        face_crop_w = face_crop_w - (face_crop_w % 2)
        face_crop_h = face_crop_h - (face_crop_h % 2)

        # ── Compute static crop X for each speaker ───────────────────────
        # Center the crop on the face, clamp so it stays on its own side
        left_x = avg_left_cx - face_crop_w // 2
        left_x = max(0, min(left_x, mid_x - face_crop_w))  # must end before midpoint

        right_x = avg_right_cx - face_crop_w // 2
        right_x = max(mid_x, min(right_x, src_w - face_crop_w))  # must start at/after midpoint

        # Compute crop Y — center vertically on the face with headroom
        left_y = max(0, avg_left_cy - int(face_crop_h * 0.40))
        left_y = max(0, min(left_y, src_h - face_crop_h))

        right_y = max(0, avg_right_cy - int(face_crop_h * 0.40))
        right_y = max(0, min(right_y, src_h - face_crop_h))

        log(f"Crop size: {face_crop_w}x{face_crop_h} (panel 9:8)")
        log(f"Left crop:  x={left_x}, y={left_y}")
        log(f"Right crop: x={right_x}, y={right_y}")
        log(f"Gap between crops: {right_x - (left_x + face_crop_w)}px")

        # Write static crop output — much simpler than dynamic coords
        with open(coords_path, "w") as f:
            json.dump({
                "mode": "podcast_dual",
                "left_crop":  {"x": left_x,  "y": left_y,  "w": face_crop_w, "h": face_crop_h},
                "right_crop": {"x": right_x, "y": right_y, "w": face_crop_w, "h": face_crop_h},
                "src_w": src_w,
                "src_h": src_h,
            }, f)

        log("Done (podcast_dual - static crop).")
        sys.exit(0)

# ── 5c: Podcast / talking head → face tracking crop ──────────────────────────

log("Podcast/talking-head - running face tracking...")

hf_token = os.environ.get("HF_TOKEN")
has_audio = False
diarization_segments = []

# Only extract audio if HF_TOKEN is set (needed for diarization)
if hf_token:
    log("Extracting audio for diarization...")
    audio_result = subprocess.run(
        ["ffmpeg", "-y", "-i", local_video,
         "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", audio_path],
        capture_output=True
    )
    has_audio = audio_result.returncode == 0
    if not has_audio:
        log("WARNING: No audio track found - skipping diarization")

    if has_audio:
        try:
            log("Running speaker diarization...")
            from pyannote.audio import Pipeline
            pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1", token=hf_token)
            diarization = pipeline(audio_path)
            for turn, _, speaker in diarization.itertracks(yield_label=True):
                diarization_segments.append({"start": turn.start, "end": turn.end, "speaker": speaker})
            speakers = set(s["speaker"] for s in diarization_segments)
            log(f"Diarization done: {len(diarization_segments)} segments, {len(speakers)} speakers")
        except Exception as e:
            log(f"WARNING: Diarization failed ({e}) - face-only tracking. "
                f"To fix: pip install pyannote.audio && accept model terms at "
                f"https://huggingface.co/pyannote/speaker-diarization-3.1")
else:
    log("No HF_TOKEN - skipping audio extraction & diarization")

def get_speaker_at(t):
    for seg in diarization_segments:
        if seg["start"] <= t <= seg["end"]:
            return seg["speaker"]
    return None

# ── IMPROVEMENT 3: Face detection loop with identity matching ─────────────────

cap = cv2.VideoCapture(proxy_video)
if not cap.isOpened():
    log("WARNING: Could not open proxy for face tracking, trying original")
    cap = cv2.VideoCapture(local_video)
    proxy_scale = 1.0
    if not cap.isOpened():
        write_fallback_and_exit("could not open video for face tracking")
# Adaptive sample interval: 0.1s for short clips, 0.2s for longer ones
sample_interval = 0.2 if duration > 30 else 0.1
log(f"Face tracking interval: {sample_interval}s ({int(duration / sample_interval)} samples)")
frame_data = []
prev_faces = []
t = 0.0
try:
    while t < duration:
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ret, frame = cap.read()
        if not ret:
            break
        faces = detect_faces_in_frame(frame, proxy_scale)
        faces = match_faces_across_frames(prev_faces, faces)
        frame_data.append({"t": round(t, 2), "faces": faces})
        prev_faces = faces
        t += sample_interval
except Exception as e:
    log(f"WARNING: Face tracking loop error at t={t:.2f}s: {e} — using {len(frame_data)} frames collected so far")
finally:
    cap.release()

# If we got zero usable frames, fall back
if not frame_data:
    write_fallback_and_exit("face tracking produced zero frames")

detected = sum(1 for f in frame_data if f["faces"])
log(f"Face detection done: {detected}/{len(frame_data)} frames have faces")

fd_map = {}
for fd in frame_data:
    # Use string key to avoid floating point comparison issues
    fd_map[f"{fd['t']:.2f}"] = fd

speaker_pos = {}  # speaker_id → average face cx position

# Build speaker → face position mapping by correlating diarization with face detections
# For each frame with 2+ faces where someone is speaking, record which face is closest
# to where that speaker has been seen before (or assign by elimination)
speaker_face_samples = {}  # speaker_id → list of cx values

for fd in frame_data:
    if len(fd["faces"]) < 2:
        continue
    spk = get_speaker_at(fd["t"])
    if not spk:
        continue

    sorted_faces = sorted(fd["faces"], key=lambda f: f["cx"])

    if spk in speaker_pos:
        # Already have a position estimate - pick the closest face
        best_face = min(sorted_faces, key=lambda f: abs(f["cx"] - speaker_pos[spk]))
        speaker_face_samples.setdefault(spk, []).append(best_face["cx"])
    else:
        # First time seeing this speaker - pick the face NOT claimed by other speakers
        claimed_positions = set(speaker_pos.keys())
        unclaimed_faces = sorted_faces[:]

        # Remove faces that are closest to already-mapped speakers
        for mapped_spk, mapped_cx in speaker_pos.items():
            if unclaimed_faces:
                closest = min(unclaimed_faces, key=lambda f: abs(f["cx"] - mapped_cx))
                unclaimed_faces.remove(closest)

        if unclaimed_faces:
            # Assign the first unclaimed face (leftmost remaining)
            best_face = unclaimed_faces[0]
        else:
            # All faces claimed - just pick the closest to center as fallback
            best_face = min(sorted_faces, key=lambda f: abs(f["cx"] - src_w // 2))

        speaker_face_samples.setdefault(spk, []).append(best_face["cx"])

    # Update running average position for this speaker
    samples = speaker_face_samples[spk]
    speaker_pos[spk] = int(sum(samples) / len(samples))

if speaker_pos:
    for spk, cx in speaker_pos.items():
        log(f"Speaker mapping: {spk} → cx={cx}")
else:
    log("No speaker-face mapping established")

# Fallback: if diarization exists but no mapping was built (e.g., never 2+ faces while speaking)
# Map speakers to evenly spaced positions across the frame
if not speaker_pos and diarization_segments:
    all_speakers = sorted(set(s["speaker"] for s in diarization_segments),
                          key=lambda sp: next(s["start"] for s in diarization_segments if s["speaker"] == sp))
    for i, spk in enumerate(all_speakers):
        speaker_pos[spk] = int(src_w * (i + 1) / (len(all_speakers) + 1))
        log(f"Speaker mapping (fallback): {spk} → cx={speaker_pos[spk]}")

def get_crop_x(faces, t, last_crop_cx=None):
    """Get the horizontal crop position for a frame. Returns None if no faces.
    Wrapped in try/catch so a single bad frame never crashes the pipeline."""
    try:
        if not faces:
            return None
        if len(faces) == 1:
            target_cx = faces[0]["cx"]
        else:
            spk = get_speaker_at(t)
            primary_cx = None

            if spk and spk in speaker_pos:
                primary_cx = min(faces, key=lambda f: abs(f["cx"] - speaker_pos[spk]))["cx"]
            elif last_crop_cx is not None:
                edge_margin = crop_w
                interior = [f for f in faces if edge_margin < f["cx"] < src_w - edge_margin]
                candidates = interior if interior else faces
                primary_cx = min(candidates, key=lambda f: abs(f["cx"] - last_crop_cx))["cx"]
            else:
                edge_margin = crop_w
                interior = [f for f in faces if edge_margin < f["cx"] < src_w - edge_margin]
                candidates = interior if interior else faces
                primary_cx = max(candidates, key=lambda f: f["area"])["cx"]

            nearby = [f for f in faces if abs(f["cx"] - primary_cx) < crop_w * 0.8]
            if len(nearby) >= 2:
                left_cx  = min(f["cx"] for f in nearby)
                right_cx = max(f["cx"] for f in nearby)
                group_span = right_cx - left_cx
                face_padding = max(f["w"] for f in nearby) // 2
                if group_span + face_padding * 2 <= crop_w:
                    target_cx = (left_cx + right_cx) // 2
                else:
                    target_cx = primary_cx
            else:
                target_cx = primary_cx

        crop_x = target_cx - crop_w // 2
        return max(0, min(crop_x, src_w - crop_w))
    except Exception as e:
        log(f"WARNING: get_crop_x failed at t={t}: {e}")
        return None

# ── IMPROVEMENT 4: Velocity-based prediction when face is missing ─────────────

last_x        = (src_w - crop_w) // 2
last_cx       = src_w // 2
last_velocity = 0.0
raw_coords    = []

for fd in frame_data:
    x        = get_crop_x(fd["faces"], fd["t"], last_cx)
    has_face = bool(fd["faces"])

    if x is None:
        # No face detected - smoothly transition toward center crop
        # instead of blindly holding the last face position.
        # This handles B-roll, text screens, etc. much better.
        center_x = (src_w - crop_w) // 2
        # Blend toward center: 8% per step (reaches center in ~3-4s)
        # Slower than before (was 20%) to avoid visible drift when face
        # detection flickers for just 1-2 frames
        predicted_x = last_x + (center_x - last_x) * 0.08
        x             = int(max(0, min(predicted_x, src_w - crop_w)))
        last_velocity *= 0.3
    else:
        last_velocity = x - last_x
        last_cx       = x + crop_w // 2

    raw_coords.append({"t": fd["t"], "x": x, "face": has_face})
    last_x = x

# ── IMPROVEMENT 5: Adaptive alpha (velocity-aware EMA smoothing) ──────────────

# DEAD_ZONE: ignore movements smaller than this (prevents micro-jitter from face detection noise)
# MOVE_ZONE: start slow panning only above this threshold (prevents wobble from natural head sway)
# SNAP_ZONE: instant jump for speaker switches / scene cuts
# All thresholds are RELATIVE to video width so they scale correctly for 720p, 1080p, 4K, etc.
DEAD_ZONE = max(60, int(src_w * 0.025))   # ~2.5% of width (e.g. 96px on 4K, 48px on 1080p)
MOVE_ZONE = max(120, int(src_w * 0.055))   # ~5.5% of width (e.g. 211px on 4K, 105px on 1080p)
SNAP_ZONE = max(400, int(src_w * 0.12))    # ~12% of width (e.g. 460px on 4K, 230px on 1080p)

log(f"Smoothing thresholds (scaled to {src_w}px): DEAD={DEAD_ZONE}, MOVE={MOVE_ZONE}, SNAP={SNAP_ZONE}")

# Velocity history: track recent movement directions to detect oscillation.
# If the face is bouncing left-right (gesturing, laughing), we suppress the pan
# instead of chasing every frame. Window of 8 samples ≈ 1.6s of history at 0.2s interval.
VELOCITY_WINDOW = 8

if not raw_coords:
    log("WARNING: No raw coordinates - skipping reframe")
    with open(coords_path, "w") as f:
        json.dump({"mode": "skip"}, f)
    try: os.unlink(audio_path)
    except: pass
    sys.exit(0)

smoothed_x    = float(raw_coords[0]["x"])
# Initialize smoothed_y from the first frame's faces
init_faces    = fd_map.get(f"{raw_coords[0]['t']:.2f}", {}).get("faces", [])
smoothed_y    = float(get_crop_y(init_faces, src_h, crop_h))
prev_had_face = raw_coords[0]["face"]
coords        = []
velocity_hist = []  # recent (raw_x - smoothed_x) deltas to detect oscillation

def is_oscillating(hist):
    """Detect if recent movement is oscillating (direction changes ≥ 3 times in window).
    This catches gesturing, laughing, leaning back-and-forth — movements where
    the camera should hold still instead of chasing."""
    if len(hist) < 4:
        return False
    signs = [1 if v > 0 else -1 if v < 0 else 0 for v in hist]
    # Filter out zero-deltas (no movement) before counting direction changes
    non_zero = [s for s in signs if s != 0]
    if len(non_zero) < 3:
        return False
    direction_changes = sum(1 for i in range(1, len(non_zero)) if non_zero[i] != non_zero[i-1])
    return direction_changes >= 3

# Y-axis dead zones — scaled to video height like X thresholds
Y_DEAD_ZONE = max(30, int(src_h * 0.015))   # ~1.5% of height
Y_MOVE_ZONE = max(60, int(src_h * 0.035))    # ~3.5% of height
Y_SNAP_ZONE = max(180, int(src_h * 0.10))    # ~10% of height
y_velocity_hist = []

for rc in raw_coords:
    raw_x = float(rc["x"])
    delta = raw_x - smoothed_x  # signed delta (direction matters for oscillation)
    abs_delta = abs(delta)

    # Track velocity history for oscillation detection
    velocity_hist.append(delta)
    if len(velocity_hist) > VELOCITY_WINDOW:
        velocity_hist.pop(0)

    oscillating = is_oscillating(velocity_hist)

    if rc["face"] and not prev_had_face:
        # Face reappeared - DON'T snap instantly, blend quickly instead
        # This prevents a jarring jump when face detection flickers
        ALPHA = 0.35
        smoothed_x = ALPHA * raw_x + (1 - ALPHA) * smoothed_x
        velocity_hist.clear()
    elif abs_delta > SNAP_ZONE:
        # Big jump (speaker switch) - snap instantly
        smoothed_x = raw_x
        velocity_hist.clear()
    elif oscillating and abs_delta < SNAP_ZONE:
        # Face is bouncing around (gesturing, laughing) - hold position.
        # Only apply a very tiny correction toward the average recent position
        # so the crop doesn't drift if the person genuinely shifted.
        avg_raw = smoothed_x + sum(velocity_hist) / len(velocity_hist)
        ALPHA = 0.005
        smoothed_x = ALPHA * avg_raw + (1 - ALPHA) * smoothed_x
    elif abs_delta > MOVE_ZONE:
        # Intentional movement - smooth pan with moderate alpha
        # Capped at 0.06 for cinematic, non-jittery panning
        ALPHA = min(0.06, 0.02 + abs_delta / 3000.0)
        smoothed_x = ALPHA * raw_x + (1 - ALPHA) * smoothed_x
    elif abs_delta > DEAD_ZONE:
        # Small drift - very slow correction to avoid visible wobble
        ALPHA = 0.01
        smoothed_x = ALPHA * raw_x + (1 - ALPHA) * smoothed_x
    # else: abs_delta <= DEAD_ZONE - do nothing, hold position

    # Y-axis smoothing - same approach with oscillation detection
    frame_faces = fd_map.get(f"{rc['t']:.2f}", {}).get("faces", [])
    raw_y       = float(get_crop_y(frame_faces, src_h, crop_h))
    delta_y     = raw_y - smoothed_y
    abs_delta_y = abs(delta_y)

    y_velocity_hist.append(delta_y)
    if len(y_velocity_hist) > VELOCITY_WINDOW:
        y_velocity_hist.pop(0)

    y_oscillating = is_oscillating(y_velocity_hist)

    if rc["face"] and not prev_had_face:
        ALPHA_Y = 0.30
        smoothed_y = ALPHA_Y * raw_y + (1 - ALPHA_Y) * smoothed_y
        y_velocity_hist.clear()
    elif abs_delta_y > Y_SNAP_ZONE:
        smoothed_y = raw_y
        y_velocity_hist.clear()
    elif y_oscillating and abs_delta_y < Y_SNAP_ZONE:
        avg_raw_y = smoothed_y + sum(y_velocity_hist) / len(y_velocity_hist)
        ALPHA_Y = 0.005
        smoothed_y = ALPHA_Y * avg_raw_y + (1 - ALPHA_Y) * smoothed_y
    elif abs_delta_y > Y_MOVE_ZONE:
        ALPHA_Y = min(0.05, 0.02 + abs_delta_y / 2000.0)
        smoothed_y = ALPHA_Y * raw_y + (1 - ALPHA_Y) * smoothed_y
    elif abs_delta_y > Y_DEAD_ZONE:
        ALPHA_Y = 0.01
        smoothed_y = ALPHA_Y * raw_y + (1 - ALPHA_Y) * smoothed_y
    # else: abs_delta_y <= Y_DEAD_ZONE - hold vertical position

    coords.append({
        "t":    rc["t"],
        "x":    int(smoothed_x),
        "y":    int(smoothed_y),
        "w":    crop_w,
        "h":    crop_h,
        "face": rc["face"]
    })
    prev_had_face = rc["face"]

log(f"Generated {len(coords)} crop keyframes")

# Interpolate to per-frame with smooth easing
INTERP_SNAP    = SNAP_ZONE  # match SNAP_ZONE - only hard-cut interpolation for true speaker switches
frame_coords   = []
frame_interval = 1.0 / fps

def ease_in_out(t):
    """Smooth ease-in-out (cubic) for natural camera movement"""
    if t < 0.5:
        return 4 * t * t * t
    return 1 - (-2 * t + 2) ** 3 / 2

for i in range(len(coords) - 1):
    a, b  = coords[i], coords[i + 1]
    steps = max(1, round((b["t"] - a["t"]) / frame_interval))
    is_scene_cut = abs(b["x"] - a["x"]) > INTERP_SNAP

    for step in range(steps):
        if is_scene_cut:
            interp_x = b["x"] if step > 0 else a["x"]
            interp_y = b["y"] if step > 0 else a["y"]
        else:
            t_linear = step / steps
            t_smooth = ease_in_out(t_linear)
            interp_x = a["x"] + t_smooth * (b["x"] - a["x"])
            interp_y = a["y"] + t_smooth * (b["y"] - a["y"])
        frame_coords.append({
            "t":    round(a["t"] + step * frame_interval, 4),
            "x":    interp_x,  # keep as float for now, round after post-smoothing
            "y":    interp_y,
            "w":    crop_w,
            "h":    crop_h,
            "face": a["face"]
        })

frame_coords.append(coords[-1])

# ── Post-smoothing pass: Gaussian-like moving average to eliminate micro-jitter ──
# The EMA + interpolation can still leave tiny 1-3px oscillations that are visible
# as jitter. A final smoothing pass with a wide kernel eliminates these completely.
POST_SMOOTH_RADIUS = max(3, int(fps * 0.15))  # ~0.15s window (3-4 frames at 24fps, 4-5 at 30fps)

def post_smooth(values, radius):
    """Simple moving average with edge clamping. Preserves hard cuts (scene switches)."""
    n = len(values)
    if n <= 1:
        return values
    result = values[:]
    for i in range(n):
        lo = max(0, i - radius)
        hi = min(n, i + radius + 1)
        # Check for hard cuts in the window — don't smooth across them
        window = values[lo:hi]
        max_jump = max(abs(window[j] - window[j-1]) for j in range(1, len(window))) if len(window) > 1 else 0
        if max_jump > SNAP_ZONE:
            # Hard cut in window — don't smooth this frame
            result[i] = values[i]
        else:
            result[i] = sum(window) / len(window)
    return result

x_values = [fc["x"] for fc in frame_coords]
y_values = [fc["y"] for fc in frame_coords]

x_smooth = post_smooth(x_values, POST_SMOOTH_RADIUS)
y_smooth = post_smooth(y_values, POST_SMOOTH_RADIUS)

for i, fc in enumerate(frame_coords):
    fc["x"] = int(round(x_smooth[i]))
    fc["y"] = int(round(y_smooth[i]))
    # Clamp to valid range
    fc["x"] = max(0, min(fc["x"], src_w - crop_w))
    fc["y"] = max(0, min(fc["y"], src_h - crop_h))

log(f"Interpolated to {len(frame_coords)} per-frame coords ({fps}fps) with post-smoothing (radius={POST_SMOOTH_RADIUS})")

# Guard: if no coords were generated, skip
if not frame_coords:
    log("WARNING: No frame coordinates generated - skipping reframe")
    with open(coords_path, "w") as f:
        json.dump({"mode": "skip"}, f)
    try: os.unlink(audio_path)
    except: pass
    sys.exit(0)

# Build segments — wrapped in try/catch so any edge case in segment
# building doesn't kill the clip. If this fails, we still have frame_coords.
try:
    segments = []
    if frame_coords:
        seg_type   = "face" if frame_coords[0].get("face") else "letterbox"
        seg_start  = frame_coords[0]["t"]
        seg_coords = [frame_coords[0]]
        for fc in frame_coords[1:]:
            t = "face" if fc.get("face") else "letterbox"
            if t != seg_type:
                segments.append({"type": seg_type, "start": seg_start, "end": fc["t"], "coords": seg_coords})
                seg_type   = t
                seg_start  = fc["t"]
                seg_coords = [fc]
            else:
                seg_coords.append(fc)
        segments.append({"type": seg_type, "start": seg_start, "end": round(duration, 4), "coords": seg_coords})

    # Merge short segments
    MIN_SEG_DURATION = 1.5
    merged = []
    for seg in segments:
        seg_dur = seg["end"] - seg["start"]
        if merged and seg_dur < MIN_SEG_DURATION:
            merged[-1]["end"] = seg["end"]
            merged[-1]["coords"].extend(seg["coords"])
        else:
            merged.append(seg)
    segments = merged
    log(f"Segments after merge: {len(segments)} (min_dur={MIN_SEG_DURATION}s)")

    has_face      = any(s["type"] == "face"      for s in segments)
    has_letterbox = any(s["type"] == "letterbox" for s in segments)

    with open(coords_path, "w") as f:
        if has_face and has_letterbox:
            json.dump({"mode": "mixed", "segments": segments, "crop_w": crop_w, "crop_h": crop_h}, f)
        elif has_face:
            clean = [{k: v for k, v in c.items() if k != "face"} for c in frame_coords]
            json.dump({"mode": "crop", "coords": clean}, f)
        else:
            json.dump({"mode": "skip"}, f)

except Exception as e:
    log(f"WARNING: Segment building / JSON write failed: {e}")
    # Last-ditch fallback: try to write raw frame_coords as simple crop mode
    try:
        with open(coords_path, "w") as f:
            if frame_coords:
                clean = [{k: v for k, v in c.items() if k != "face"} for c in frame_coords]
                json.dump({"mode": "crop", "coords": clean}, f)
            else:
                json.dump({"mode": "skip", "fallback_reason": f"segment build failed: {e}"}, f)
    except Exception as e2:
        write_fallback_and_exit(f"could not write any coords: {e2}")

for path in [audio_path]:
    if path is None:
        continue
    try:
        os.unlink(path)
    except Exception:
        pass
# NOTE: local_video is NOT deleted here - it's owned by the Node.js worker (cleanup in finally block).
# Proxy video is kept for potential reuse by other clips from the same source.

log("Done.")
sys.exit(0)