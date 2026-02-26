#!/usr/bin/env python3
"""
Smart Crop Sidecar — Production Script (Improved)
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
            # Use nose+eye blend as face center — more accurate than bbox center
            kps = det.keypoints
            if len(kps) >= 3:
                eye_cx  = int((kps[0].x + kps[1].x) / 2 * frame.shape[1])
                nose_cx = int(kps[2].x * frame.shape[1])
                face_cx = int(eye_cx * 0.4 + nose_cx * 0.6)
            elif len(kps) >= 2:
                face_cx = int((kps[0].x + kps[1].x) / 2 * frame.shape[1])
            else:
                face_cx = x + w // 2
            faces.append({"x": x, "y": y, "w": w, "h": h, "cx": face_cx, "cy": y + h//2, "area": w * h})
    return faces

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

# ── IMPROVEMENT 2: Head room — vertical crop positioning ──────────────────────

def get_crop_y(faces, src_h, crop_h):
    if not faces:
        return 0
    top_face_y = min(f["y"] for f in faces)
    target_y = top_face_y - int(crop_h * 0.20)
    return max(0, min(target_y, src_h - crop_h))

# ── Step 4: Video type detection ─────────────────────────────────────────────

log("Detecting video type...")

sample_times = [duration * i / 10 for i in range(1, 10)]
sample_faces = []
pip_detections = 0
full_detections = 0

cap = cv2.VideoCapture(local_video)
for t in sample_times:
    cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
    ret, frame = cap.read()
    if not ret:
        continue
    faces = detect_faces_in_frame(frame)
    sample_faces.append(faces)

    for face in faces:
        on_side    = face["cx"] < src_w * 0.30 or face["cx"] > src_w * 0.65
        is_centered = src_w * 0.25 < face["cx"] < src_w * 0.75 and \
                      src_h * 0.15 < face["cy"] < src_h * 0.85
        if on_side:
            pip_detections += 1
        elif is_centered:
            full_detections += 1

    centered_faces = [f for f in faces if src_w * 0.25 < f["cx"] < src_w * 0.75]
    if len(centered_faces) >= 2:
        full_detections += 2

cap.release()

total_face_frames = sum(1 for f in sample_faces if f)
no_face_frames    = len(sample_times) - total_face_frames

if total_face_frames == 0:
    video_type = "no_face"
elif pip_detections > full_detections and pip_detections >= 3:
    video_type = "screen_pip"
else:
    video_type = "podcast"

log(f"Video type: {video_type} (pip={pip_detections}, full={full_detections}, no_face={no_face_frames})")

# ── Step 5: Handle each video type ───────────────────────────────────────────

if video_type == "no_face":
    log("No faces detected — skipping reframe, keeping original 16:9")
    with open(coords_path, "w") as f:
        json.dump({"mode": "skip"}, f)
    log("Done (skip — no face).")
    sys.exit(0)

if video_type == "screen_pip":
    log("Screen recording with PiP face cam — using split screen mode")

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

    pip_cx = pip_region["x"] + pip_region["w"] // 2
    if pip_cx > src_w * 0.5:
        screen_x = 0
        screen_w = pip_region["x"]
    else:
        screen_x = pip_region["x"] + pip_region["w"]
        screen_w = src_w - screen_x

    if screen_w < 100:
        screen_w = crop_w
        screen_x = 0 if pip_cx > src_w * 0.5 else src_w - crop_w

    result = {
        "mode": "split",
        "screen": {"x": screen_x, "y": 0, "w": screen_w, "h": src_h},
        "pip": pip_region,
        "split_ratio": 50,
    }
    with open(coords_path, "w") as f:
        json.dump(result, f)
    log("Done (split screen mode).")
    sys.exit(0)

# ── 5c: Podcast / talking head → face tracking crop ──────────────────────────

log("Podcast/talking-head — running face tracking...")

log("Extracting audio...")
subprocess.run(
    ["ffmpeg", "-y", "-i", local_video,
     "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", audio_path],
    check=True, capture_output=True
)

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

# ── IMPROVEMENT 3: Face detection loop with identity matching ─────────────────

cap = cv2.VideoCapture(local_video)
sample_interval = 0.1
frame_data = []
prev_faces = []
t = 0.0
while t < duration:
    cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
    ret, frame = cap.read()
    if not ret:
        break
    faces = detect_faces_in_frame(frame)
    faces = match_faces_across_frames(prev_faces, faces)
    frame_data.append({"t": round(t, 2), "faces": faces})
    prev_faces = faces
    t += sample_interval
cap.release()

detected = sum(1 for f in frame_data if f["faces"])
log(f"Face detection done: {detected}/{len(frame_data)} frames have faces")

fd_map = {fd["t"]: fd for fd in frame_data}

speaker_side = {}
for fd in frame_data:
    if len(fd["faces"]) >= 2:
        spk = get_speaker_at(fd["t"])
        if spk and not speaker_side:
            speaker_side[spk] = "left"
            log(f"Speaker mapping: {spk} → left")
        break

def get_crop_x(faces, t, last_crop_cx=None):
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
        elif last_crop_cx is not None:
            # Filter out edge faces (listener/background faces near frame boundary)
            # Use full crop_w as margin — faces within one crop-width of edge are partial
            edge_margin = crop_w
            interior = [f for f in faces if edge_margin < f["cx"] < src_w - edge_margin]
            candidates = interior if interior else faces
            # Among interior candidates, pick closest to current tracking position
            target_cx = min(candidates, key=lambda f: abs(f["cx"] - last_crop_cx))["cx"]
        else:
            edge_margin = crop_w
            interior = [f for f in faces if edge_margin < f["cx"] < src_w - edge_margin]
            candidates = interior if interior else faces
            target_cx = max(candidates, key=lambda f: f["area"])["cx"]
    crop_x = target_cx - crop_w // 2
    return max(0, min(crop_x, src_w - crop_w))

# ── IMPROVEMENT 4: Velocity-based prediction when face is missing ─────────────

last_x        = (src_w - crop_w) // 2
last_cx       = src_w // 2
last_velocity = 0.0
raw_coords    = []

for fd in frame_data:
    x        = get_crop_x(fd["faces"], fd["t"], last_cx)
    has_face = bool(fd["faces"])

    if x is None:
        predicted_x   = last_x + last_velocity * 0.5
        x             = int(max(0, min(predicted_x, src_w - crop_w)))
        last_velocity *= 0.5
    else:
        last_velocity = x - last_x
        last_cx       = x + crop_w // 2

    raw_coords.append({"t": fd["t"], "x": x, "face": has_face})
    last_x = x

# ── IMPROVEMENT 5: Adaptive alpha (velocity-aware EMA smoothing) ──────────────

DEAD_ZONE = 5
SNAP_ZONE = 150

smoothed_x    = float(raw_coords[0]["x"])
prev_had_face = raw_coords[0]["face"]
coords        = []

for rc in raw_coords:
    raw_x = float(rc["x"])
    delta = abs(raw_x - smoothed_x)

    velocity = delta
    ALPHA    = min(0.9, 0.1 + velocity / 200.0)

    if rc["face"] and not prev_had_face:
        smoothed_x = raw_x
    elif delta > SNAP_ZONE:
        smoothed_x = raw_x
    elif delta > DEAD_ZONE:
        smoothed_x = ALPHA * raw_x + (1 - ALPHA) * smoothed_x

    frame_faces = fd_map.get(rc["t"], {}).get("faces", [])
    crop_y      = get_crop_y(frame_faces, src_h, crop_h)

    coords.append({
        "t":    rc["t"],
        "x":    int(smoothed_x),
        "y":    crop_y,
        "w":    crop_w,
        "h":    crop_h,
        "face": rc["face"]
    })
    prev_had_face = rc["face"]

log(f"Generated {len(coords)} crop keyframes")

# Interpolate to per-frame
INTERP_SNAP    = 150
frame_coords   = []
frame_interval = 1.0 / fps

for i in range(len(coords) - 1):
    a, b  = coords[i], coords[i + 1]
    steps = max(1, round((b["t"] - a["t"]) / frame_interval))
    is_scene_cut = abs(b["x"] - a["x"]) > INTERP_SNAP

    for step in range(steps):
        if is_scene_cut:
            interp_x = b["x"] if step > 0 else a["x"]
            interp_y = b["y"] if step > 0 else a["y"]
        else:
            alpha    = step / steps
            interp_x = int(a["x"] + alpha * (b["x"] - a["x"]))
            interp_y = int(a["y"] + alpha * (b["y"] - a["y"]))
        frame_coords.append({
            "t":    round(a["t"] + step * frame_interval, 4),
            "x":    interp_x,
            "y":    interp_y,
            "w":    crop_w,
            "h":    crop_h,
            "face": a["face"]
        })

frame_coords.append(coords[-1])
log(f"Interpolated to {len(frame_coords)} per-frame coords ({fps}fps)")

# Build segments
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

for path in [audio_path, local_video]:
    try:
        os.unlink(path)
    except Exception:
        pass

log("Done.")
sys.exit(0)
