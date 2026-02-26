#!/usr/bin/env python3
"""
Smart Crop Test Script
Usage: python3 test_smart_crop.py /path/to/video.mp4

Outputs: /path/to/video_vertical.mp4

Requirements:
  pip install mediapipe opencv-python pyannote.audio numpy

Environment:
  export HF_TOKEN=hf_your_token_here
  (Also accept model terms at huggingface.co/pyannote/speaker-diarization-3.1)
"""

import sys
import os
import json
import subprocess
import tempfile
import shutil
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

def log(msg):
    print(f"[SMART CROP] {msg}", flush=True)

# ── Step 1: Parse args ────────────────────────────────────────────────────────

if len(sys.argv) < 2:
    print("Usage: python3 test_smart_crop.py /path/to/video.mp4")
    sys.exit(1)

input_video = sys.argv[1]
if not os.path.exists(input_video):
    print(f"Error: file not found: {input_video}")
    sys.exit(1)

base = os.path.splitext(input_video)[0]
output_video = f"{base}_vertical.mp4"
tmp_dir = tempfile.mkdtemp(prefix="smart_crop_")
audio_path = os.path.join(tmp_dir, "audio.wav")
coords_path = os.path.join(tmp_dir, "coords.json")

log(f"Input:  {input_video}")
log(f"Output: {output_video}")
log(f"Tmp:    {tmp_dir}")

# ── Step 2: Get video dimensions ──────────────────────────────────────────────

cap = cv2.VideoCapture(input_video)
src_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
src_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
fps   = cap.get(cv2.CAP_PROP_FPS)
total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
duration = total_frames / fps
cap.release()

log(f"Video: {src_w}x{src_h} @ {fps:.1f}fps, {duration:.1f}s")

# Target crop dimensions for 9:16
crop_w = int(src_h * 9 / 16)
if crop_w > src_w:
    crop_w = src_w
crop_h = src_h

log(f"Crop window: {crop_w}x{crop_h}")

# ── Step 3: Extract audio ─────────────────────────────────────────────────────

log("Extracting audio...")
subprocess.run([
    "ffmpeg", "-y", "-i", input_video,
    "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
    audio_path
], check=True, capture_output=True)
log("Audio extracted.")

# ── Step 4: Speaker diarization ───────────────────────────────────────────────

hf_token = os.environ.get("HF_TOKEN")
diarization_segments = []

if not hf_token:
    log("WARNING: HF_TOKEN not set — skipping diarization, will track all faces")
else:
    try:
        log("Running speaker diarization (this takes ~30s)...")
        from pyannote.audio import Pipeline
        pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            token=hf_token
        )
        diarization = pipeline(audio_path)
        for turn, _, speaker in diarization.itertracks(yield_label=True):
            diarization_segments.append({
                "start": turn.start,
                "end":   turn.end,
                "speaker": speaker
            })
        log(f"Diarization done: {len(diarization_segments)} segments, "
            f"{len(set(s['speaker'] for s in diarization_segments))} speakers")
    except Exception as e:
        log(f"WARNING: Diarization failed ({e}) — falling back to face tracking only")
        diarization_segments = []

def get_speaker_at(t):
    for seg in diarization_segments:
        if seg["start"] <= t <= seg["end"]:
            return seg["speaker"]
    return None

# ── Step 5: Face detection on sampled frames ──────────────────────────────────

log("Running face detection (sampling every 0.5s)...")

MODEL_PATH = "/tmp/blaze_face_short_range.tflite"
base_options = mp_python.BaseOptions(model_asset_path=MODEL_PATH)
options = mp_vision.FaceDetectorOptions(
    base_options=base_options,
    min_detection_confidence=0.5
)
face_detector = mp_vision.FaceDetector.create_from_options(options)

cap = cv2.VideoCapture(input_video)
sample_interval = 0.5  # seconds
frame_data = []  # [{ t, faces: [{ cx, cy, x, y, w, h }] }]

t = 0.0
while t < duration:
    cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
    ret, frame = cap.read()
    if not ret:
        break

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    results = face_detector.detect(mp_image)

    faces = []
    if results.detections:
        for det in results.detections:
            bb = det.bounding_box
            x = bb.origin_x
            y = bb.origin_y
            w = bb.width
            h = bb.height
            cx = x + w // 2
            cy = y + h // 2
            faces.append({ "x": x, "y": y, "w": w, "h": h, "cx": cx, "cy": cy })

    frame_data.append({ "t": round(t, 2), "faces": faces })
    t += sample_interval

cap.release()
face_detector.close()

detected = sum(1 for f in frame_data if f["faces"])
log(f"Face detection done: {detected}/{len(frame_data)} frames have faces")

# ── Step 6: Map speaker → face position ──────────────────────────────────────

# Build speaker → side mapping from first frame with 2 faces
speaker_side = {}  # "SPEAKER_00" → "left" | "right"
for fd in frame_data:
    if len(fd["faces"]) >= 2:
        sorted_faces = sorted(fd["faces"], key=lambda f: f["cx"])
        spk = get_speaker_at(fd["t"])
        if spk and not speaker_side:
            # Assign: left face = first speaker seen, right = second
            speaker_side[spk] = "left"
            log(f"Speaker mapping: {spk} → left side")
        break

# ── Step 7: Generate raw crop x positions ────────────────────────────────────

def get_crop_x(faces, t):
    """Pick the face to track and return crop_x centered on it."""
    if not faces:
        return None

    if len(faces) == 1:
        target_cx = faces[0]["cx"]
    else:
        # Multiple faces: pick based on who's speaking
        spk = get_speaker_at(t)
        if spk and spk in speaker_side:
            side = speaker_side[spk]
            sorted_faces = sorted(faces, key=lambda f: f["cx"])
            target_face = sorted_faces[0] if side == "left" else sorted_faces[-1]
            target_cx = target_face["cx"]
        else:
            # No diarization info — pick face closest to center
            target_cx = min(faces, key=lambda f: abs(f["cx"] - src_w // 2))["cx"]

    # Center crop window on target face
    crop_x = target_cx - crop_w // 2
    # Clamp to valid range
    crop_x = max(0, min(crop_x, src_w - crop_w))
    return crop_x

raw_coords = []
last_x = (src_w - crop_w) // 2  # default: center

for fd in frame_data:
    x = get_crop_x(fd["faces"], fd["t"])
    if x is None:
        x = last_x  # hold last position
    raw_coords.append({ "t": fd["t"], "x": x })
    last_x = x

# ── Step 8: Smooth with EMA + dead zone ──────────────────────────────────────

ALPHA = 0.3       # smoothing factor (lower = smoother but slower)
DEAD_ZONE = 50    # pixels — don't move if drift < this

smoothed_coords = []
smoothed_x = float(raw_coords[0]["x"])

for rc in raw_coords:
    raw_x = float(rc["x"])
    if abs(raw_x - smoothed_x) > DEAD_ZONE:
        smoothed_x = ALPHA * raw_x + (1 - ALPHA) * smoothed_x
    smoothed_coords.append({
        "t": rc["t"],
        "x": int(smoothed_x),
        "y": 0,
        "w": crop_w,
        "h": crop_h
    })

log(f"Crop coordinates generated: {len(smoothed_coords)} keyframes")

# Save coords for inspection
with open(coords_path, "w") as f:
    json.dump(smoothed_coords, f, indent=2)
log(f"Coords saved to: {coords_path}")

# ── Step 9: Build FFmpeg sendcmd file ─────────────────────────────────────────

cmd_file = os.path.join(tmp_dir, "crop_cmds.txt")
lines = []
for c in smoothed_coords:
    lines.append(f"{c['t']} crop x {c['x']};")
    lines.append(f"{c['t']} crop y {c['y']};")
    lines.append(f"{c['t']} crop w {c['w']};")
    lines.append(f"{c['t']} crop h {c['h']};")

with open(cmd_file, "w") as f:
    f.write("\n".join(lines))

# ── Step 10: Apply FFmpeg crop ────────────────────────────────────────────────

log("Applying smart crop with FFmpeg...")
first = smoothed_coords[0]
ffmpeg_cmd = [
    "ffmpeg", "-y",
    "-i", input_video,
    "-vf", f"sendcmd=f={cmd_file},crop={first['w']}:{first['h']}",
    "-c:v", "libx264", "-preset", "fast", "-crf", "23",
    "-c:a", "aac", "-b:a", "128k",
    output_video
]

result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
if result.returncode != 0:
    log(f"FFmpeg failed:\n{result.stderr[-1000:]}")
    sys.exit(1)

# ── Step 11: Cleanup ──────────────────────────────────────────────────────────

shutil.rmtree(tmp_dir)
log(f"Done! Output: {output_video}")
