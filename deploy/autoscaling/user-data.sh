#!/bin/bash
# EC2 User Data — bootstraps a new worker instance from the ASG.
# This runs as root on first boot of each new instance.
# Assumes base AMI already has: bun, ffmpeg, yt-dlp, git, python3, pm2 installed.
# See deploy/autoscaling/README.md for how to bake the base AMI.

set -e
exec > /var/log/scalereach-init.log 2>&1

echo "[INIT] Starting ScaleReach worker bootstrap at $(date)"

# ── Config (injected via ASG launch template user-data or SSM) ────────────────
DEPLOY_PATH="/opt/scalereach"
REPO_URL="https://github.com/hevink/scalereach-tmkoc"
BRANCH="feature/split-screen-clips"
APP_USER="ubuntu"

# ── Pull latest code ──────────────────────────────────────────────────────────
if [ -d "$DEPLOY_PATH/.git" ]; then
  echo "[INIT] Updating existing repo..."
  cd "$DEPLOY_PATH"
  git fetch origin
  git reset --hard "origin/$BRANCH"
else
  echo "[INIT] Cloning repo..."
  git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$DEPLOY_PATH"
fi

cd "$DEPLOY_PATH"

# ── Install dependencies ──────────────────────────────────────────────────────
echo "[INIT] Installing dependencies..."
sudo -u "$APP_USER" /home/ubuntu/.bun/bin/bun install --frozen-lockfile

# ── Pull .env from SSM Parameter Store ───────────────────────────────────────
# Requires IAM role with ssm:GetParameter permission
echo "[INIT] Fetching env vars from SSM..."
aws ssm get-parameter \
  --name "/scalereach/worker/env" \
  --with-decryption \
  --query "Parameter.Value" \
  --output text \
  --region "${AWS_REGION:-us-east-1}" > "$DEPLOY_PATH/.env.production"

# ── Pull YouTube cookies from SSM ─────────────────────────────────────────────
mkdir -p "$DEPLOY_PATH/config"
aws ssm get-parameter \
  --name "/scalereach/youtube-cookies" \
  --with-decryption \
  --query "Parameter.Value" \
  --output text \
  --region "${AWS_REGION:-us-east-1}" > "$DEPLOY_PATH/config/youtube_cookies.txt"

echo "[INIT] Env and cookies fetched."

# ── Create log directory ──────────────────────────────────────────────────────
mkdir -p "$DEPLOY_PATH/logs"
chown -R "$APP_USER:$APP_USER" "$DEPLOY_PATH"

# ── Start worker via PM2 ──────────────────────────────────────────────────────
echo "[INIT] Starting worker via PM2..."
sudo -u "$APP_USER" bash -c "
  export PATH='/home/ubuntu/.bun/bin:/home/ubuntu/.deno/bin:/usr/local/bin:$PATH'
  cd $DEPLOY_PATH
  bunx pm2 start ecosystem.config.cjs --env production
  bunx pm2 save
"

# ── Wait for health check ─────────────────────────────────────────────────────
echo "[INIT] Waiting for worker health..."
for i in $(seq 1 30); do
  STATUS=$(curl -sf http://localhost:3002/health/ready 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null || echo "")
  if [ "$STATUS" = "ready" ]; then
    echo "[INIT] Worker is healthy after ${i}s"
    break
  fi
  sleep 2
done

echo "[INIT] Bootstrap complete at $(date)"
