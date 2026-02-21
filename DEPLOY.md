# Deployment Guide

API → Render | Worker → AWS EC2

---

## Architecture

```
Frontend → Render API (src/index.ts) → Redis → EC2 Worker (src/worker.ts)
                                                      ↓
                                              R2 / Deepgram / AI APIs
```

---

## Part 1 — Redis (do this first)

Both Render and EC2 need to share the same Redis instance.

Use **Upstash** (free tier, works from anywhere):
1. Go to https://upstash.com → Create database → Select region closest to your EC2
2. Copy the `REDIS_URL` (starts with `rediss://`)
3. You'll use this in both Render env vars and EC2 `.env`

---

## Part 2 — Deploy API on Render

### Step 1 — Connect repo
1. Go to https://render.com → New → Web Service
2. Connect your GitHub repo
3. Select the `scalereach-tmkoc` directory (or root if it's the repo root)

### Step 2 — Configure service
- **Runtime**: Docker
- **Dockerfile path**: `./Dockerfile`
- **Branch**: `main`
- **Region**: Oregon (or closest to your users)
- **Plan**: Starter ($7/mo) or higher

### Step 3 — Set environment variables
Add these in Render dashboard → Environment:

```
PORT=3001
NODE_ENV=production
DATABASE_URL=<your neon/postgres url>
BETTER_AUTH_SECRET=<random 32 char string>
BETTER_AUTH_URL=https://your-render-url.onrender.com
FRONTEND_URL=https://your-frontend.com
REDIS_URL=<upstash redis url>
R2_ACCOUNT_ID=<cloudflare account id>
R2_ACCESS_KEY_ID=<r2 access key>
R2_SECRET_ACCESS_KEY=<r2 secret key>
R2_BUCKET_NAME=<bucket name>
R2_PUBLIC_URL=<r2 public url>
DEEPGRAM_API_KEY=<key>
ANTHROPIC_API_KEY=<key>
GROQ_API_KEY=<key>
RESEND_API_KEY=<key>
GOOGLE_CLIENT_ID=<key>
GOOGLE_CLIENT_SECRET=<key>
SENTRY_DSN=<dsn>
POLAR_ACCESS_TOKEN=<key>
DODO_PAYMENTS_API_KEY=<key>
```

### Step 4 — Get deploy hook URL
Render dashboard → your service → Settings → Deploy Hook → copy the URL
You'll add this as `RENDER_DEPLOY_HOOK_URL` in GitHub secrets.

### Step 5 — Deploy
Click "Deploy" — Render builds the Docker image and starts the service.
Health check runs at `/health`.

---

## Part 3 — Deploy Worker on AWS EC2

### Step 1 — Launch EC2 instance
1. AWS Console → EC2 → Launch Instance
2. **AMI**: Ubuntu 24.04 LTS
3. **Instance type**: `t3.medium` (2 vCPU, 4GB) minimum — `t3.large` recommended for video processing
4. **Storage**: 30GB+ (ffmpeg temp files can be large)
5. **Security group**: allow inbound SSH (port 22) from your IP only
6. Download the `.pem` key file

### Step 2 — SSH into the instance
```bash
chmod 400 your-key.pem
ssh -i your-key.pem ubuntu@YOUR_EC2_IP
```

### Step 3 — Upload your .env file
From your local machine (new terminal tab):
```bash
scp -i your-key.pem .env ubuntu@YOUR_EC2_IP:/tmp/.env
```

### Step 4 — Run setup script
Back in the EC2 SSH session:
```bash
# Download setup script from your repo
curl -o setup-ec2.sh https://raw.githubusercontent.com/YOUR_ORG/YOUR_REPO/main/setup-ec2.sh

# Edit REPO_URL inside the script first
nano setup-ec2.sh  # update REPO_URL at the top

# Run it
bash setup-ec2.sh
```

Or manually:
```bash
# Install dependencies
sudo apt-get update -y
sudo apt-get install -y git curl ffmpeg python3 python3-pip build-essential
sudo pip3 install -U yt-dlp

# Install Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# Install PM2
bun add -g pm2

# Install Redis (skip if using Upstash)
sudo apt-get install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server

# Clone repo
sudo mkdir -p /opt/scalereach
sudo chown ubuntu:ubuntu /opt/scalereach
git clone https://github.com/YOUR_ORG/YOUR_REPO.git /opt/scalereach

# Move .env
cp /tmp/.env /opt/scalereach/.env

# Install deps
cd /opt/scalereach
bun install --frozen-lockfile
mkdir -p logs

# Start worker
pm2 startup | tail -1 | sudo bash
pm2 start ecosystem.config.cjs
pm2 save
```

### Step 5 — Verify worker is running
```bash
pm2 status
curl http://localhost:3002/health
```

---

## Part 4 — GitHub CI/CD Setup

### Add secrets to GitHub repo
Go to: GitHub repo → Settings → Secrets and variables → Actions → New repository secret

| Secret | Value |
|--------|-------|
| `EC2_HOST` | your EC2 public IP or domain |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | full contents of your `.pem` file |
| `RENDER_DEPLOY_HOOK_URL` | from Render dashboard → Settings → Deploy Hook |

### How it works
Every push to `main`:
1. Runs type check
2. Runs build verification
3. Triggers Render deploy (API)
4. SSHes into EC2 and runs `pm2 reload` (Worker)

---

## Useful Commands

### Render
```bash
# Check logs in Render dashboard → Logs tab
# Or use Render CLI: render logs --service scalereach-api
```

### EC2 Worker
```bash
pm2 status                          # process status
pm2 logs                            # tail all logs
pm2 logs scalereach-worker          # worker logs only
pm2 restart scalereach-worker       # restart
pm2 reload ecosystem.config.cjs    # zero-downtime reload

curl http://localhost:3002/health           # basic health
curl http://localhost:3002/health/detailed  # queue stats
```

### Redis (if local)
```bash
redis-cli ping          # should return PONG
redis-cli info clients  # connected clients
```

---

## Troubleshooting

**Worker not picking up jobs**
- Check `REDIS_URL` is identical in both Render env vars and EC2 `.env`
- `pm2 logs scalereach-worker` for errors

**Render deploy failing**
- Check Dockerfile builds locally: `docker build -t test .`
- Check health endpoint: `curl https://your-app.onrender.com/health`

**EC2 worker crashes on video processing**
- Increase instance size (more RAM)
- Check disk space: `df -h` (ffmpeg needs temp space)
- Lower concurrency in `ecosystem.config.cjs`: set `VIDEO_WORKER_CONCURRENCY` to `1`
