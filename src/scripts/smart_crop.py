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

if src_w == 0 or src_h == 0 or fps <= 0 or duration <= 0:
    log(f"ERROR: Invalid video dimensions or duration ({src_w}x{src_h}, fps={fps}, dur={duration})")
    # Cleanup downloaded file
    try: os.unlink(local_video)
    except: pass
    sys.exit(1)

log(f"Video: {src_w}x{src_h} @ {fps:.1f}fps, {duration:.1f}s")

# ── Speed optimization: pre-downscale large videos for face detection ─────────
# OpenCV decodes full-res frames even if we resize after. For 4K+ videos,
# create a 720p proxy for face detection (FFmpeg decode is much faster).
PROXY_MAX_H = 720
proxy_video = local_video
proxy_scale = 1.0
if src_h > PROXY_MAX_H:
    proxy_video = os.path.join(tmp_dir, f"{clip_id}_proxy.mp4")
    proxy_scale = PROXY_MAX_H / src_h
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
    import urllib.request
    urllib.request.urlretrieve(
        "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
        model_path
    )

base_options  = mp_python.BaseOptions(model_asset_path=model_path)
detector_opts = mp_vision.FaceDetectorOptions(base_options=base_options, min_detection_confidence=0.25)
face_detector = mp_vision.FaceDetector.create_from_options(detector_opts)

# ── Speed optimization: downscale large frames for face detection ─────────────
# MediaPipe doesn't need full resolution - 480p is plenty for face detection.
# This gives ~4-6x speedup on 1080p and ~16x on 4K.
DETECT_MAX_H = 480

def detect_faces_in_frame(frame, proxy_scale=1.0):
    orig_h, orig_w = frame.shape[:2]
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

cap = cv2.VideoCapture(proxy_video)
for t in sample_times:
    cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
    ret, frame = cap.read()
    if not ret:
        continue
    faces = detect_faces_in_frame(frame, proxy_scale)
    sample_faces.append(faces)

    for face in faces:
        w_ratio = face["w"] / src_w   # face width relative to frame
        h_ratio = face["h"] / src_h   # face height relative to frame

        log(f"  face: cx={face['cx']}, cy={face['cy']}, w={face['w']}, h={face['h']}, w_ratio={w_ratio:.3f}, area={face['area']}")

        # Small face heuristic: if face is very small (< 10% of frame width),
        # it's almost certainly a PiP webcam overlay
        is_small_face = w_ratio < 0.10

        # Corner detection: face center is in outer 30% of frame on any axis
        in_corner = (face["cx"] < src_w * 0.30 or face["cx"] > src_w * 0.70) and \
                    (face["cy"] < src_h * 0.30 or face["cy"] > src_h * 0.70)

        # Side detection: face is on the left or right edge (non-overlapping with centered)
        on_side = face["cx"] < src_w * 0.25 or face["cx"] > src_w * 0.75

        # Centered: face is reasonably sized and not a tiny webcam overlay
        # Use wider range (15%-85%) since talking heads are often slightly off-center
        is_centered = src_w * 0.15 < face["cx"] < src_w * 0.85 and \
                      src_h * 0.15 < face["cy"] < src_h * 0.85 and \
                      w_ratio >= 0.08  # must be at least 8% of frame width

        if is_small_face and in_corner:
            # Small face in corner = definitely PiP webcam
            pip_detections += 2
            small_corner_count += 1
        elif is_small_face and on_side:
            # Small face on the edge = likely PiP webcam
            pip_detections += 1
        elif is_small_face:
            # Small face elsewhere = possibly PiP
            pip_detections += 1
        elif is_centered:
            full_detections += 1
        else:
            # Large face that's off-center - still a normal speaker, not PiP
            full_detections += 1

    centered_faces = [f for f in faces if src_w * 0.25 < f["cx"] < src_w * 0.75
                      and f["w"] / src_w >= 0.08]
    if len(centered_faces) >= 2:
        full_detections += 2

cap.release()

total_face_frames = sum(1 for f in sample_faces if f)
no_face_frames    = len(sample_times) - total_face_frames

# Detect group shots: if 4+ faces appear consistently, it's a group/panel shot
group_shot_frames = sum(1 for f in sample_faces if len(f) >= 4)
is_group_shot = group_shot_frames >= len(sample_times) * 0.4  # 4+ faces in 40%+ of samples

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
else:
    video_type = "podcast"

log(f"Video type: {video_type} (pip={pip_detections}, full={full_detections}, no_face={no_face_frames}, small_corner={small_corner_count}, group_frames={group_shot_frames}/{len(sample_times)})")

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
    for p in [local_video]:
        try: os.unlink(p)
        except: pass
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
            log(f"WARNING: Diarization failed ({e}) - face-only tracking")
else:
    log("No HF_TOKEN - skipping audio extraction & diarization")

def get_speaker_at(t):
    for seg in diarization_segments:
        if seg["start"] <= t <= seg["end"]:
            return seg["speaker"]
    return None

# ── IMPROVEMENT 3: Face detection loop with identity matching ─────────────────

cap = cv2.VideoCapture(proxy_video)
# Adaptive sample interval: 0.1s for short clips, 0.2s for longer ones
sample_interval = 0.2 if duration > 30 else 0.1
log(f"Face tracking interval: {sample_interval}s ({int(duration / sample_interval)} samples)")
frame_data = []
prev_faces = []
t = 0.0
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
cap.release()

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
    if not faces:
        return None
    if len(faces) == 1:
        target_cx = faces[0]["cx"]
    else:
        spk = get_speaker_at(t)
        primary_cx = None

        if spk and spk in speaker_pos:
            # Pick the face closest to this speaker's known position
            primary_cx = min(faces, key=lambda f: abs(f["cx"] - speaker_pos[spk]))["cx"]
        elif last_crop_cx is not None:
            # No speaker info - pick face closest to current tracking position
            edge_margin = crop_w
            interior = [f for f in faces if edge_margin < f["cx"] < src_w - edge_margin]
            candidates = interior if interior else faces
            primary_cx = min(candidates, key=lambda f: abs(f["cx"] - last_crop_cx))["cx"]
        else:
            edge_margin = crop_w
            interior = [f for f in faces if edge_margin < f["cx"] < src_w - edge_margin]
            candidates = interior if interior else faces
            primary_cx = max(candidates, key=lambda f: f["area"])["cx"]

        # Group framing: if other faces are close enough to fit in the crop window,
        # center the crop on the group midpoint instead of just the primary face.
        # This avoids ping-ponging when 2-3 people are having a conversation close together.
        nearby = [f for f in faces if abs(f["cx"] - primary_cx) < crop_w * 0.8]
        if len(nearby) >= 2:
            left_cx  = min(f["cx"] for f in nearby)
            right_cx = max(f["cx"] for f in nearby)
            group_span = right_cx - left_cx
            # Only group-frame if they actually fit within the crop window (with some padding)
            face_padding = max(f["w"] for f in nearby) // 2
            if group_span + face_padding * 2 <= crop_w:
                target_cx = (left_cx + right_cx) // 2
            else:
                # Group too wide - stick with primary speaker
                target_cx = primary_cx
        else:
            target_cx = primary_cx

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
        # No face detected - smoothly transition toward center crop
        # instead of blindly holding the last face position.
        # This handles B-roll, text screens, etc. much better.
        center_x = (src_w - crop_w) // 2
        # Blend toward center: 20% per step (reaches center in ~1-2s)
        predicted_x = last_x + (center_x - last_x) * 0.20
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
DEAD_ZONE = 30     # px - ignore tiny face bbox fluctuations
MOVE_ZONE = 80     # px - start slow pan for intentional movement
SNAP_ZONE = 200    # px - instant snap for speaker switch

if not raw_coords:
    log("WARNING: No raw coordinates - skipping reframe")
    with open(coords_path, "w") as f:
        json.dump({"mode": "skip"}, f)
    for p in [audio_path, local_video]:
        try: os.unlink(p)
        except: pass
    sys.exit(0)

smoothed_x    = float(raw_coords[0]["x"])
# Initialize smoothed_y from the first frame's faces
init_faces    = fd_map.get(f"{raw_coords[0]['t']:.2f}", {}).get("faces", [])
smoothed_y    = float(get_crop_y(init_faces, src_h, crop_h))
prev_had_face = raw_coords[0]["face"]
coords        = []

# Y-axis dead zones (vertical jitter is less noticeable, so tighter thresholds)
Y_DEAD_ZONE = 15    # px - ignore tiny vertical fluctuations
Y_MOVE_ZONE = 40    # px - slow vertical pan
Y_SNAP_ZONE = 120   # px - instant vertical snap (e.g. person stands up)

for rc in raw_coords:
    raw_x = float(rc["x"])
    delta = abs(raw_x - smoothed_x)

    if rc["face"] and not prev_had_face:
        # Face reappeared - snap to it
        smoothed_x = raw_x
    elif delta > SNAP_ZONE:
        # Big jump (speaker switch) - snap instantly
        smoothed_x = raw_x
    elif delta > MOVE_ZONE:
        # Intentional movement - smooth pan with moderate alpha
        ALPHA = min(0.15, 0.05 + delta / 1000.0)
        smoothed_x = ALPHA * raw_x + (1 - ALPHA) * smoothed_x
    elif delta > DEAD_ZONE:
        # Small drift - very slow correction to avoid visible wobble
        ALPHA = 0.03
        smoothed_x = ALPHA * raw_x + (1 - ALPHA) * smoothed_x
    # else: delta <= DEAD_ZONE - do nothing, hold position

    # Y-axis smoothing - same 3-tier approach to prevent vertical jitter
    frame_faces = fd_map.get(f"{rc['t']:.2f}", {}).get("faces", [])
    raw_y       = float(get_crop_y(frame_faces, src_h, crop_h))
    delta_y     = abs(raw_y - smoothed_y)

    if rc["face"] and not prev_had_face:
        smoothed_y = raw_y
    elif delta_y > Y_SNAP_ZONE:
        smoothed_y = raw_y
    elif delta_y > Y_MOVE_ZONE:
        ALPHA_Y = min(0.12, 0.04 + delta_y / 800.0)
        smoothed_y = ALPHA_Y * raw_y + (1 - ALPHA_Y) * smoothed_y
    elif delta_y > Y_DEAD_ZONE:
        ALPHA_Y = 0.025
        smoothed_y = ALPHA_Y * raw_y + (1 - ALPHA_Y) * smoothed_y
    # else: delta_y <= Y_DEAD_ZONE - hold vertical position

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
INTERP_SNAP    = 200
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
            interp_x = int(a["x"] + t_smooth * (b["x"] - a["x"]))
            interp_y = int(a["y"] + t_smooth * (b["y"] - a["y"]))
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

# Guard: if no coords were generated, skip
if not frame_coords:
    log("WARNING: No frame coordinates generated - skipping reframe")
    with open(coords_path, "w") as f:
        json.dump({"mode": "skip"}, f)
    for p in [audio_path, local_video]:
        try: os.unlink(p)
        except: pass
    sys.exit(0)

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

for path in [audio_path, local_video, proxy_video if proxy_video != local_video else None]:
    if path is None:
        continue
    try:
        os.unlink(path)
    except Exception:
        pass

log("Done.")
sys.exit(0)