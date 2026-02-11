#!/bin/bash
# Deploy/update worker on DigitalOcean droplet
# Run this from the droplet after pulling latest code

set -e

echo "=== Deploying ScaleReach Worker ==="

WORKER_DIR="/opt/scalereach-worker/scalereach-tmkoc"

# Pull latest code
cd /opt/scalereach-worker
git pull origin main

# Install dependencies
cd "$WORKER_DIR"
bun install

# Update yt-dlp to latest
yt-dlp -U 2>/dev/null || curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp

# Copy systemd service if updated
cp deploy/scalereach-worker.service /etc/systemd/system/scalereach-worker.service
systemctl daemon-reload

# Restart worker
systemctl restart scalereach-worker

echo "✅ Worker deployed and restarted"
echo ""
systemctl status scalereach-worker --no-pager
