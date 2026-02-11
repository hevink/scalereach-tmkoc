#!/bin/bash
# DigitalOcean Droplet Setup Script for ScaleReach Worker
# Run as root on a fresh Ubuntu 22.04+ droplet

set -e

echo "=== ScaleReach Worker - Droplet Setup ==="

# Update system
apt update && apt upgrade -y

# Install essential packages
apt install -y curl unzip git build-essential

# Install FFmpeg (with all codecs needed for video processing)
apt install -y ffmpeg

# Verify FFmpeg
ffmpeg -version
echo "✅ FFmpeg installed"

# Install yt-dlp
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
chmod a+rx /usr/local/bin/yt-dlp
echo "✅ yt-dlp installed"

# Install Bun
curl -fsSL https://bun.sh/install | bash
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
echo 'export BUN_INSTALL="$HOME/.bun"' >> ~/.bashrc
echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> ~/.bashrc
echo "✅ Bun installed"

# Create app directory
mkdir -p /opt/scalereach-worker
echo "✅ App directory created at /opt/scalereach-worker"

# Create swap file (important for FFmpeg memory spikes)
if [ ! -f /swapfile ]; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "✅ 4GB swap file created"
fi

# Create tmp directory for FFmpeg processing
mkdir -p /tmp/scalereach-processing
chmod 777 /tmp/scalereach-processing

echo ""
echo "=== Setup Complete ==="
echo "Next steps:"
echo "1. Clone your repo to /opt/scalereach-worker"
echo "2. Copy .env file with your environment variables"
echo "3. Run: cd /opt/scalereach-worker/scalereach-tmkoc && bun install"
echo "4. Install the systemd service: cp deploy/scalereach-worker.service /etc/systemd/system/"
echo "5. Start the worker: systemctl enable --now scalereach-worker"
