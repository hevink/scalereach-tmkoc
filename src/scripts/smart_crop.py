#!/usr/bin/env python3
"""
Smart Crop Sidecar — Production Script
Called by Node.js worker via child_process.spawn

Usage: python3 smart_crop.py <videoUrl> <clipId> <tmpDir>

Output: {tmpDir}/{clipId}_coords.json
  [{ "t": 0.0, "x": 0, "y": 0, "w": 607, "h": 1080 }, ...]
  OR for split-screen mode:
  { "mode": "split", "top": {...}, "bottom": {...} }

Exit 0 on success, non-zero on failure.

Environment:
  HF_TOKEN   — HuggingFace token for pyannote.audio (optional)
  MODEL_PATH — Path to blaze_face_short_range.tflite (default: /tmp/blaze_face_short_range.tflite)

Video type detection (auto):
  - podcast/talking-head  → face tracking crop (9:16)
  - screen + PiP face cam → split screen (screen top 60%, face bottom 40%)
  - no face detected      → center crop fallback
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
local_video = os.path.join(tmp_dir, f"{clip_id}_src.mp4")

log(f"clip_id={clip_id} tmp_dir={tmp_dir}")

# ── Imports ───────────────────────────────────────────────────────────────────

try:
    import cv2
    import numpy as np
    import mediapipe as mp
    from mediapipe.tasks import python as mp_python
    from mediapipe.tasks.python import vision as mp_vision
except ImportError as e:
    log(f"ERROR: Missing dependency: {e}")
    sys.exit(2)

# ── Step 1: Download video ────────────────────────────────────────────────────

log("Downloading video to tmp...")
dl = subprocess.run(
    ["ffmpeg", "-y", "-i", video_url, "-c", "copy", local_video],
    capture_output=True
)
if dl.returncode != 0:
    log(f"ERROR: ffmpeg download failed: {dl.stderr.decode()[-500:]}")
    sys.exit(1)
log("Download done.")

# ── Step 2: Video dimensions ──────────────────────────────────────────────────

cap      = cv2.VideoCapture(local_video)
src_w    = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
src_h    = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
fps      = cap.get(cv2.CAP_PROP_FPS)
total_f  = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
duration = total_f / fps if fps > 0 else 0
cap.release()

log(f"Video: {src_w}x{src_h} @ {fps:.1f}fps, {duration:.1f}s")

crop_w = int(src_h * 9 / 16)
if crop_w > src_w:
    crop_w = src_w
crop_w = crop_w - (crop_w % 2)  # ensure even for libx264
crop_h = src_h - (src_h % 2)    # ensure even for libx264

# ── Step 3: Face detection setup ──────────────────────────────────────────────

model_path = os.environ.get("MODEL_PATH", "/tmp/blaze_face_short_range.tflite")
if not os.path.exists(model_path):
    log(f"Downloading face detector model...")
    import urllib.request
    urllib.request.urlretrieve(
        "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
        model_path
    )

base_options  = mp_python.BaseOptions(model_asset_path=model_path)
detector_opts = mp_vision.FaceDetectorOptions(base_options=base_options, min_detection_confidence=0.4)
face_detector = mp_vision.FaceDetector.create_from_options(detector_opts)

def detect_faces_in_frame(frame):
    rgb      = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    results  = face_detector.detect(mp_image)
    faces = []
    if results.detections:
        for det in results.detections:
            bb = det.bounding_box
            x, y, w, h = bb.origin_x, bb.origin_y, bb.width, bb.height
            faces.append({"x": x, "y": y, "w": w, "h": h, "cx": x + w//2, "cy": y + h//2, "area": w * h})
    return faces

# ── Step 4: Video type detection ─────────────────────────────────────────────
# Sample 10 frames spread across the video to classify the layout

log("Detecting video type...")

sample_times = [duration * i / 10 for i in range(1, 10)]
sample_faces = []
pip_detections = 0  # frames where face is in corner (PiP / screen recording)
full_detections = 0  # frames where face fills most of the frame

cap = cv2.VideoCapture(local_video)
for t in sample_times:
    cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
    ret, frame = cap.read()
    if not ret:
        continue
    faces = detect_faces_in_frame(frame)
    sample_faces.append(faces)

    for face in faces:
        # PiP = face is on the left or right edge (horizontally off-center)
        # regardless of vertical position — side-mounted face cams are common
        on_side = face["cx"] < src_w * 0.30 or face["cx"] > src_w * 0.65
        is_centered = src_w * 0.25 < face["cx"] < src_w * 0.75 and \
                      src_h * 0.15 < face["cy"] < src_h * 0.85
        if on_side:
            pip_detections += 1
        elif is_centered:
            full_detections += 1

    # Multiple centered faces = podcast (two people talking side by side)
    centered_faces = [f for f in faces if src_w * 0.25 < f["cx"] < src_w * 0.75]
    if len(centered_faces) >= 2:
        full_detections += 2

cap.release()

total_face_frames = sum(1 for f in sample_faces if f)
no_face_frames    = len(sample_times) - total_face_frames

# Classify video type
if total_face_frames == 0:
    video_type = "no_face"
elif pip_detections > full_detections and pip_detections >= 3:
    video_type = "screen_pip"  # screen recording with PiP face cam
else:
    video_type = "podcast"     # talking head / podcast

log(f"Video type: {video_type} (pip={pip_detections}, full={full_detections}, no_face={no_face_frames})")

# ── Step 5: Handle each video type ───────────────────────────────────────────

# ── 5a: No face → skip reframing, keep original 16:9 ─────────────────────────
if video_type == "no_face":
    log("No faces detected — skipping reframe, keeping original 16:9")
    with open(coords_path, "w") as f:
        json.dump({"mode": "skip"}, f)
    log("Done (skip — no face).")
    sys.exit(0)

# ── 5b: Screen + PiP → split screen ──────────────────────────────────────────
if video_type == "screen_pip":
    log("Screen recording with PiP face cam — using split screen mode")
    # Output a special marker so the Node worker uses FFmpeg split-screen filter
    # Top 60% = screen content (cropped to 9:16 from center)
    # Bottom 40% = face cam region (detected corner, scaled up)

    # Find the PiP face — use same detection logic as classification
    pip_region = {"x": src_w - src_w // 4, "y": src_h - src_h // 4, "w": src_w // 4, "h": src_h // 4}  # default: bottom-right
    for faces in sample_faces:
        for face in faces:
            face_w_ratio = face["w"] / src_w
            in_corner = (face["cx"] < src_w * 0.35 or face["cx"] > src_w * 0.65) and \
                        (face["cy"] < src_h * 0.35 or face["cy"] > src_h * 0.65)
            is_small  = face_w_ratio < 0.25
            if in_corner or is_small:
                # Expand bbox to capture full PiP box
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

    # Crop screen from the side opposite to the PiP face cam
    # Use only the area NOT covered by the face cam to avoid overlap
    pip_cx = pip_region["x"] + pip_region["w"] // 2
    if pip_cx > src_w * 0.5:
        # Face cam is on the right → screen content is on the left
        screen_x = 0
        screen_w = pip_region["x"]
    else:
        # Face cam is on the left → screen content is on the right
        screen_x = pip_region["x"] + pip_region["w"]
        screen_w = src_w - screen_x

    # Ensure minimum width
    if screen_w < 100:
        screen_w = crop_w
        screen_x = 0 if pip_cx > src_w * 0.5 else src_w - crop_w

    result = {
        "mode": "split",
        "screen": {
            "x": screen_x,
            "y": 0,
            "w": screen_w,
            "h": src_h,
        },
        "pip": pip_region,
        "split_ratio": 50,  # screen takes 50% height, face takes 50%
    }
    with open(coords_path, "w") as f:
        json.dump(result, f)
    log("Done (split screen mode).")
    sys.exit(0)

# ── 5c: Podcast / talking head → face tracking crop ──────────────────────────

log("Podcast/talking-head — running face tracking...")

# Extract audio for diarization
log("Extracting audio...")
subprocess.run(
    ["ffmpeg", "-y", "-i", local_video,
     "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", audio_path],
    check=True, capture_output=True
)

# Speaker diarization (optional)
hf_token = os.environ.get("HF_TOKEN")
diarization_segments = []
if hf_token:
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
        log(f"WARNING: Diarization failed ({e}) — face-only tracking")

def get_speaker_at(t):
    for seg in diarization_segments:
        if seg["start"] <= t <= seg["end"]:
            return seg["speaker"]
    return None

# Face detection on all frames
cap = cv2.VideoCapture(local_video)
sample_interval = 0.1
frame_data = []
t = 0.0
while t < duration:
    cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
    ret, frame = cap.read()
    if not ret:
        break
    faces = detect_faces_in_frame(frame)
    frame_data.append({"t": round(t, 2), "faces": faces})
    t += sample_interval
cap.release()

detected = sum(1 for f in frame_data if f["faces"])
log(f"Face detection done: {detected}/{len(frame_data)} frames have faces")

# Speaker → face side mapping
speaker_side = {}
for fd in frame_data:
    if len(fd["faces"]) >= 2:
        spk = get_speaker_at(fd["t"])
        if spk and not speaker_side:
            speaker_side[spk] = "left"
            log(f"Speaker mapping: {spk} → left")
        break

def get_crop_x(faces, t):
    if not faces:
        return None
    if len(faces) == 1:
        target_cx = faces[0]["cx"]
    else:
        spk = get_speaker_at(t)
        if spk and spk in speaker_side:
            side = speaker_side[spk]
            sorted_faces = sorted(faces, key=lambda f: f["cx"])
            target_cx = sorted_faces[0]["cx"] if side == "left" else sorted_faces[-1]["cx"]
        else:
            # Largest face wins — biggest area = closest to camera = main subject
            target_cx = max(faces, key=lambda f: f["area"])["cx"]
    crop_x = target_cx - crop_w // 2
    return max(0, min(crop_x, src_w - crop_w))

# Raw crop coords
last_x = (src_w - crop_w) // 2
raw_coords = []
for fd in frame_data:
    x = get_crop_x(fd["faces"], fd["t"])
    has_face = bool(fd["faces"])
    if x is None:
        x = last_x
    raw_coords.append({"t": fd["t"], "x": x, "face": has_face})
    last_x = x

# EMA smoothing + dead zone + snap
ALPHA     = 0.05
DEAD_ZONE = 80
SNAP_ZONE = 250

smoothed_x = float(raw_coords[0]["x"])
coords = []
for rc in raw_coords:
    raw_x = float(rc["x"])
    delta = abs(raw_x - smoothed_x)
    if delta > SNAP_ZONE:
        smoothed_x = raw_x
    elif delta > DEAD_ZONE:
        smoothed_x = ALPHA * raw_x + (1 - ALPHA) * smoothed_x
    coords.append({"t": rc["t"], "x": int(smoothed_x), "y": 0, "w": crop_w, "h": crop_h, "face": rc["face"]})

log(f"Generated {len(coords)} crop keyframes")

# Interpolate to per-frame
frame_coords = []
frame_interval = 1.0 / fps
for i in range(len(coords) - 1):
    a, b = coords[i], coords[i + 1]
    steps = max(1, round((b["t"] - a["t"]) / frame_interval))
    for step in range(steps):
        alpha    = step / steps
        interp_x = int(a["x"] + alpha * (b["x"] - a["x"]))
        frame_coords.append({"t": round(a["t"] + step * frame_interval, 4), "x": interp_x, "y": 0, "w": crop_w, "h": crop_h, "face": a["face"]})
frame_coords.append(coords[-1])
log(f"Interpolated to {len(frame_coords)} per-frame coords ({fps}fps)")

# Build segments: contiguous face / no-face blocks
segments = []
if frame_coords:
    seg_type = "face" if frame_coords[0].get("face") else "letterbox"
    seg_start = frame_coords[0]["t"]
    seg_coords = [frame_coords[0]]
    for fc in frame_coords[1:]:
        t = "face" if fc.get("face") else "letterbox"
        if t != seg_type:
            segments.append({"type": seg_type, "start": seg_start, "end": fc["t"], "coords": seg_coords})
            seg_type = t
            seg_start = fc["t"]
            seg_coords = [fc]
        else:
            seg_coords.append(fc)
    segments.append({"type": seg_type, "start": seg_start, "end": round(duration, 4), "coords": seg_coords})

has_face     = any(s["type"] == "face"      for s in segments)
has_letterbox = any(s["type"] == "letterbox" for s in segments)

# Write output
with open(coords_path, "w") as f:
    if has_face and has_letterbox:
        # Mixed: face sections cropped 9:16, no-face sections letterboxed
        json.dump({"mode": "mixed", "segments": segments, "crop_w": crop_w, "crop_h": crop_h}, f)
    elif has_face:
        # All face — simple crop mode
        clean = [{k: v for k, v in c.items() if k != "face"} for c in frame_coords]
        json.dump({"mode": "crop", "coords": clean}, f)
    else:
        # No face at all — skip
        json.dump({"mode": "skip"}, f)

# Cleanup
for path in [audio_path, local_video]:
    try:
        os.unlink(path)
    except Exception:
        pass

log("Done.")
sys.exit(0)
