#!/bin/bash
# ============================================================
# EC2 First-Time Setup - ScaleReach Worker
# API runs on Render. This script sets up the worker only.
# Run once on a fresh Ubuntu EC2 instance.
# Usage: bash setup-ec2.sh
# ============================================================
set -e

APP_DIR="/opt/scalereach"
REPO_URL="https://github.com/YOUR_ORG/YOUR_REPO.git"  # <-- update this

echo "🚀 ScaleReach Worker EC2 Setup"
echo "================================"

# ── System packages ──────────────────────────────────────────
echo "📦 Updating system packages..."
sudo apt-get update -y
sudo apt-get install -y git curl ffmpeg python3 python3-pip build-essential

# ── Noto Sans fonts for non-Latin caption rendering (Hindi, Arabic, CJK, etc.) ──
echo "📦 Installing Noto Sans fonts for multilingual captions..."
sudo apt-get install -y fonts-noto-core fonts-noto-cjk fonts-noto-extra fonts-noto-color-emoji 2>/dev/null || echo "⚠️  Some Noto font packages not available, using bundled fonts in assets/fonts/"

# ── yt-dlp ───────────────────────────────────────────────────
echo "📦 Installing yt-dlp..."
sudo pip3 install -U yt-dlp

# ── Bun ──────────────────────────────────────────────────────
if ! command -v bun &>/dev/null; then
  echo "📦 Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
  echo 'export BUN_INSTALL="$HOME/.bun"' >> ~/.bashrc
  echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> ~/.bashrc
fi

# ── PM2 ──────────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  echo "📦 Installing PM2..."
  bun add -g pm2
fi

# ── Redis ────────────────────────────────────────────────────
# Only install local Redis if you're NOT using an external Redis URL (e.g. Upstash)
# Comment this block out if REDIS_URL in .env points to an external service
if ! command -v redis-server &>/dev/null; then
  echo "📦 Installing Redis..."
  sudo apt-get install -y redis-server
  sudo systemctl enable redis-server
  sudo systemctl start redis-server
  echo "✅ Redis running locally on port 6379"
fi

# ── Clone repo ───────────────────────────────────────────────
if [ ! -d "$APP_DIR" ]; then
  echo "📂 Cloning repository..."
  sudo mkdir -p "$APP_DIR"
  sudo chown "$USER:$USER" "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
else
  echo "📂 $APP_DIR already exists, skipping clone"
fi

cd "$APP_DIR"
mkdir -p logs

# ── Install dependencies ─────────────────────────────────────
echo "📦 Installing app dependencies..."
bun install --frozen-lockfile

# ── Environment file check ───────────────────────────────────
if [ ! -f "$APP_DIR/.env" ]; then
  echo ""
  echo "⚠️  No .env file found at $APP_DIR/.env"
  echo "Upload it before starting the worker:"
  echo "  scp .env ubuntu@YOUR_EC2_IP:$APP_DIR/.env"
  echo ""
  echo "Required vars for the worker:"
  echo "  DATABASE_URL, REDIS_URL, R2_*, DEEPGRAM_API_KEY,"
  echo "  ANTHROPIC_API_KEY, GROQ_API_KEY, SENTRY_DSN"
  echo ""
fi

# ── PM2 startup on reboot ────────────────────────────────────
echo "⚙️  Configuring PM2 startup..."
pm2 startup | tail -1 | sudo bash || true

# ── Start worker ─────────────────────────────────────────────
if [ -f "$APP_DIR/.env" ]; then
  echo "🚀 Starting worker..."
  pm2 start "$APP_DIR/ecosystem.config.cjs"
  pm2 save
else
  echo "⏭️  Skipping worker start - upload .env first, then run:"
  echo "  cd $APP_DIR && pm2 start ecosystem.config.cjs && pm2 save"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "GitHub Secrets to add (repo → Settings → Secrets):"
echo "  EC2_HOST        → your EC2 public IP or domain"
echo "  EC2_USER        → ubuntu"
echo "  EC2_SSH_KEY     → contents of your .pem private key"
echo "  RENDER_DEPLOY_HOOK_URL → from Render dashboard → Settings → Deploy Hook"
echo ""
echo "Useful commands:"
echo "  pm2 status          → check worker status"
echo "  pm2 logs            → tail all logs"
echo "  pm2 logs scalereach-worker --lines 100"
