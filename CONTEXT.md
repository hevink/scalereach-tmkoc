# ScaleReach — Full Project Context

## Repos & Branches

| Repo | URL | Branch |
|------|-----|--------|
| Backend (worker + API) | https://github.com/hevink/scalereach-tmkoc | `feature/split-screen-clips` |
| Frontend | https://github.com/hevink/scalereach-f1 | `feature/split-screen-clips` |

---

## Infrastructure

| Service | URL / Details |
|---------|--------------|
| Production frontend | https://app.scalereach.ai |
| Production API (Render) | https://api.scalereach.ai |
| EC2 Worker | https://worker.scalereach.ai |
| EC2 instance type | `t3.large` (2 vCPU, 8GB RAM) |
| EC2 IP | `3.93.175.142` |
| EC2 SSH key | `~/.ssh/scalereach-worker.pem` |
| EC2 user | `ubuntu` |
| EC2 deploy path | `/opt/scalereach` |
| EC2 process manager | PM2 via `ecosystem.config.cjs` |
| EC2 PM2 app name | `scalereach-worker` |
| EC2 logs (stdout) | `/opt/scalereach/logs/worker-out.log` |
| EC2 logs (stderr) | `/opt/scalereach/logs/worker-error.log` |
| Redis | `redis://:botyoo@13.204.63.21:6379` |
| Anthropic proxy | https://ais.scalereach.ai |
| Cloudflare R2 CDN | https://cdn.scalereach.ai |

---

## Secrets & Keys

| Key | Value |
|-----|-------|
| `WORKER_SECRET` | `c786e4ff7d836c963f7d63dae018a2602cd9c9e1da06113dd4d6d415e4b956f2` |
| `ANTHROPIC_BASE_URL` | `https://ais.scalereach.ai/v1` |
| `ANTHROPIC_API_KEY` | `my-super-secret-password-123` |
| `YOUTUBE_COOKIES_PATH` | `/opt/scalereach/config/youtube_cookies.txt` (EC2) / `./config/youtube_cookies.txt` (local) |
| `YT_DLP_GET_POT_BGUTIL_BASE_URL` | `http://localhost:4416` |

---

## EC2 Worker — Key Details

- Runs via PM2: `pm2 reload ecosystem.config.cjs --update-env`
- Bun installed at `/home/ubuntu/.bun/bin/bun`
- PM2 installed via bun: use `bunx pm2 <cmd>` or full path
- bgutil POT server (YouTube bot bypass): `/home/ubuntu/bgutil-ytdlp-pot-provider/server/build/main.js`
- Deno installed at `/home/ubuntu/.deno/bin/deno`
- bgutil starts automatically on worker boot (port 4416), sets `YT_DLP_GET_POT_BGUTIL_BASE_URL`
- YouTube cookies file: `/opt/scalereach/config/youtube_cookies.txt`

### SSH commands

```bash
# SSH in
ssh -i ~/.ssh/scalereach-worker.pem ubuntu@3.93.175.142

# Restart worker
ssh -i ~/.ssh/scalereach-worker.pem ubuntu@3.93.175.142 \
  "export PATH='/home/ubuntu/.bun/bin:$PATH' && bunx pm2 restart scalereach-worker"

# View logs live
ssh -i ~/.ssh/scalereach-worker.pem ubuntu@3.93.175.142 \
  "export PATH='/home/ubuntu/.bun/bin:$PATH' && bunx pm2 logs scalereach-worker"

# Manual deploy
ssh -i ~/.ssh/scalereach-worker.pem ubuntu@3.93.175.142 "
  export PATH='/home/ubuntu/.bun/bin:$PATH'
  cd /opt/scalereach
  git fetch origin
  git reset --hard origin/feature/split-screen-clips
  bun install
  bunx pm2 reload ecosystem.config.cjs --update-env
"

# Upload YouTube cookies
scp -i ~/.ssh/scalereach-worker.pem scalereach-tmkoc/config/youtube_cookies.txt \
  ubuntu@3.93.175.142:/opt/scalereach/config/youtube_cookies.txt
```

---

## CI/CD

File: `scalereach-tmkoc/.github/workflows/ci.yml`

- Triggers on push to `main` or `feature/split-screen-clips`
- Build check: `bun build src/index.ts` + `bun build src/worker.ts`
- Deploy API: triggers Render deploy hook (main branch only)
- Deploy Worker: SSH to EC2, `git reset --hard origin/<branch>`, `bun install`, `pm2 reload`, health check with rollback
- Uses `git reset --hard origin/<branch>` (not `git pull`) to avoid detached HEAD issues

### GitHub Secrets needed
- `EC2_HOST` = `3.93.175.142`
- `EC2_USER` = `ubuntu`
- `EC2_SSH_KEY` = contents of `~/.ssh/scalereach-worker.pem`
- `RENDER_DEPLOY_HOOK_URL` = Render deploy hook URL

---

## Worker Health Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /health` | public | Basic health + worker status |
| `GET /health/live` | public | Liveness probe |
| `GET /health/ready` | public | Readiness probe |
| `GET /health/detailed` | bearer/session | Queue stats |
| `GET /health/hevin` | bearer/session | Full debug dashboard (system, redis, queues, git) |
| `GET /health/hevin/logs` | bearer/session | Live log viewer UI (SSE) |
| `GET /health/hevin/logs/stream` | bearer/session | Raw SSE log stream |
| `GET /validate-youtube?url=` | public | Validate YouTube URL via yt-dlp |
| `POST /auth/login` | — | Email-based login for dashboard |
| `POST /auth/logout` | — | Logout |

Auth: Bearer token via `Authorization: Bearer <WORKER_SECRET>` or `X-Worker-Token: <WORKER_SECRET>` or session cookie after login.

Allowed emails for dashboard login: `hevinkalathiya123@gmail.com`, `hevinatwork@gmail.com`

---

## YouTube / yt-dlp

- EC2 IP is blocked by YouTube (datacenter IP)
- Fix: cookies + bgutil POT server (generates Proof of Origin Tokens)
- Cookies expire every 2-4 weeks — must be manually refreshed
- Cookie file format: Netscape HTTP Cookie File (header: `# This is a generated file! Do not edit.`)
- Cookie file local: `scalereach-tmkoc/config/youtube_cookies.txt`
- After updating cookies locally: `scp` to EC2 + `pm2 restart`
- Long-term fix options:
  - YouTube Data API v3 key (free, 10k req/day) — code already has `getVideoInfoHttp()`, just needs `YOUTUBE_API_KEY` env var
  - Residential proxy via `YOUTUBE_PROXY` env var (already supported in `youtube.service.ts`)

### Validate YouTube (test)
```bash
curl "https://worker.scalereach.ai/validate-youtube?url=https://www.youtube.com/watch?v=vZdbbN3FCzE"
```

---

## Anthropic AI Proxy

- Proxy URL: `https://ais.scalereach.ai`
- Correct endpoint: `https://ais.scalereach.ai/v1/messages`
- API key: `my-super-secret-password-123`
- `ANTHROPIC_BASE_URL` must be set to `https://ais.scalereach.ai/v1` (NOT with trailing slash, NOT just the domain)
- Why: `@ai-sdk/anthropic` strips trailing slash then appends `/messages`, so base must include `/v1`
- Model in use: `claude-sonnet-4-5-20250929`

### Test proxy
```bash
curl -s -X POST "https://ais.scalereach.ai/v1/messages" \
  -H "Content-Type: application/json" \
  -H "x-api-key: my-super-secret-password-123" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"claude-sonnet-4-5-20250929","max_tokens":20,"messages":[{"role":"user","content":"Say hi"}]}'
```

---

## Key Source Files

### Backend (`scalereach-tmkoc/src/`)

| File | Purpose |
|------|---------|
| `worker.ts` | Main worker entry — health server, SSE log viewer, validate-youtube endpoint |
| `services/youtube.service.ts` | yt-dlp wrapper, YouTube Data API fallback, audio streaming |
| `services/ai.service.ts` | Anthropic AI wrapper via `@ai-sdk/anthropic` |
| `services/r2.service.ts` | Cloudflare R2 storage |
| `lib/pot-server.ts` | bgutil POT server lifecycle (starts on worker boot) |
| `jobs/video.worker.ts` | BullMQ video processing worker |
| `jobs/clip.worker.ts` | BullMQ clip generation worker |
| `jobs/translation.worker.ts` | BullMQ translation worker |
| `jobs/dubbing.worker.ts` | BullMQ dubbing worker |
| `jobs/social.worker.ts` | BullMQ social posting worker |
| `controllers/video.controller.ts` | Video submit, validate, status endpoints |
| `controllers/social-post.controller.ts` | Social post scheduling + edit |

### Frontend (`scalereach-f1/src/`)

| File | Purpose |
|------|---------|
| `components/social/calendar/edit-post-modal.tsx` | Edit scheduled post modal |
| `components/social/SchedulePostModal.tsx` | Schedule post modal |

### Config files

| File | Purpose |
|------|---------|
| `scalereach-tmkoc/ecosystem.config.cjs` | PM2 config — log paths, env, app name |
| `scalereach-tmkoc/.github/workflows/ci.yml` | CI/CD pipeline |
| `scalereach-tmkoc/config/youtube_cookies.txt` | YouTube auth cookies (refresh every 2-4 weeks) |
| `scalereach-tmkoc/.env.production` | Production env vars (gitignored) |
| `scalereach-tmkoc/.env.local` | Local dev env vars |

---

## Completed Tasks

### TASK 1 — Split Screen Random Background Video Fallback
- `scalereach-tmkoc/src/models/background-video.model.ts`
- `scalereach-tmkoc/src/jobs/video.worker.ts`

### TASK 2 — Edit Scheduled Post Feature
- `scalereach-tmkoc/src/models/scheduled-post.model.ts`
- `scalereach-tmkoc/src/controllers/social-post.controller.ts`
- `scalereach-f1/src/components/social/calendar/edit-post-modal.tsx`

### TASK 3 — AWS EC2 Worker Deployment + CI/CD
- EC2 instance `i-005f32f27449be306`, IP `3.93.175.142`
- Domain `https://worker.scalereach.ai`
- PM2 with `ecosystem.config.cjs`
- CI deploys on push with health check + rollback

### TASK 4 — Anthropic baseURL Fix
- Was hardcoding `baseURL: "http://localhost:8000/v1"` and fake key
- Fixed to read from env: `ANTHROPIC_BASE_URL` and `ANTHROPIC_API_KEY`
- Must be `https://ais.scalereach.ai/v1` (SDK appends `/messages`)

### TASK 5 — YouTube yt-dlp (EC2 IP blocked)
- Cookies + bgutil POT server is current working solution
- Cookies must be refreshed every 2-4 weeks
- Long-term: YouTube Data API v3 or residential proxy

### TASK 6 — Live Log Viewer
- `https://worker.scalereach.ai/health/hevin/logs`
- SSE stream at `/health/hevin/logs/stream?type=out|err|both&lines=100`
- Protected by same email allowlist auth as `/health/hevin`

---

### TASK 7 — Smart AI Reframing (Face Detection + Smart Crop)
- Python sidecar: `scalereach-tmkoc/src/scripts/smart_crop.py`
- Auto-detects video type: podcast (face tracking), screen+PiP (split screen), no face (center crop)
- Face tracking: MediaPipe blaze_face_short_range, EMA smoothing, per-frame interpolation, snap zone
- Split screen: screen content top 50%, face cam bottom 50%, non-overlapping crop
- Multi-face: largest face wins (biggest area = closest to camera)
- BullMQ worker: `src/jobs/smart-crop.worker.ts` (standalone) + inline in `src/jobs/clip.worker.ts`
- FFmpeg service: `applySmartCrop()` (sendcmd filter) + `applySplitScreen()` (vstack filter)
- Configure page toggle: "Smart AI Reframing" → `video_config.enable_smart_crop`
- Flow: raw clip → Python sidecar → FFmpeg crop → `smartCropStorageKey/Url` in DB
- EC2 setup: venv at `/home/ubuntu/smart_crop_env`, model at `/home/ubuntu/blaze_face_short_range.tflite`
- PM2 env vars: `PYTHON_PATH`, `MODEL_PATH`, `SMART_CROP_TMP_DIR`, `SMART_CROP_WORKER_CONCURRENCY`
- DB migrations: `drizzle/0025_smart_crop.sql` (viral_clip columns), `drizzle/0026_smart_crop_config.sql` (video_config column)
- pyannote diarization: optional, requires HF_TOKEN + model terms accepted at huggingface.co/pyannote/speaker-diarization-3.1

- YouTube cookies expire every 2-4 weeks — need YouTube Data API v3 key or residential proxy for permanent fix
- `YOUTUBE_API_KEY` not set — if added to Render env vars, validation bypasses yt-dlp entirely on the API server
- `YOUTUBE_PROXY` env var supported in `youtube.service.ts` but not configured
