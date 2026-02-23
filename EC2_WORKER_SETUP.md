# EC2 Worker Setup Guide

This documents the exact steps used to deploy the ScaleReach worker to AWS EC2.

## Architecture

```
Frontend (Vercel/app.scalereach.ai)
    → API (Render/scalereach-api.onrender.com)
    → Redis (13.204.63.21)
    → Worker (EC2/worker.scalereach.ai)  ← this guide
              ↓
        R2 / Deepgram / Anthropic / ElevenLabs
```

The worker runs `src/worker.ts` via PM2. The API runs separately on Render.

---

## Current Instance

| Property | Value |
|----------|-------|
| Instance ID | `i-005f32f27449be306` |
| Public IP | `98.81.246.231` |
| Domain | `https://worker.scalereach.ai` |
| Region | `us-east-1` |
| AMI | Ubuntu 24.04 LTS |
| Type | `t3.micro` (upgrade to `t3.large` for production load) |
| Key pair | `~/.ssh/scalereach-worker.pem` |
| Deploy path | `/opt/scalereach` |
| Branch | `feature/split-screen-clips` (switch to `main` for production) |

---

## Part 1 — Launch EC2 Instance

1. AWS Console → EC2 → Launch Instance
2. AMI: **Ubuntu 24.04 LTS**
3. Instance type: `t3.large` (2 vCPU, 8GB RAM — needed for ffmpeg/video processing)
4. Storage: **30GB+** (ffmpeg creates large temp files)
5. Key pair: Create new → download `.pem` file
6. Security group: allow SSH (port 22) from your IP

After launch, save the key:
```bash
mv ~/Downloads/your-key.pem ~/.ssh/scalereach-worker.pem
chmod 400 ~/.ssh/scalereach-worker.pem
```

---

## Part 2 — Security Group (Ports)

Go to: EC2 → Security Groups → your instance's group → Inbound rules → Edit inbound rules

Add these rules:

| Type  | Protocol | Port | Source    |
|-------|----------|------|-----------|
| SSH   | TCP      | 22   | Your IP   |
| HTTP  | TCP      | 80   | 0.0.0.0/0 |
| HTTPS | TCP      | 443  | 0.0.0.0/0 |

---

## Part 3 — DNS Record

In your DNS provider (Cloudflare) for `scalereach.ai`:

| Type | Name   | Value          | Proxy |
|------|--------|----------------|-------|
| A    | worker | 98.81.246.231  | OFF (grey cloud) |

Wait for DNS to propagate before running certbot.

---

## Part 4 — Server Setup

SSH into the instance:
```bash
ssh -i ~/.ssh/scalereach-worker.pem ubuntu@98.81.246.231
```

### Install system dependencies
```bash
sudo apt-get update -y
sudo apt-get install -y git curl ffmpeg python3 python3-pip build-essential unzip
```

### Install yt-dlp
```bash
sudo pip3 install -U yt-dlp --break-system-packages
```

### Install Node.js (required for PM2)
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Install Bun (match version exactly — check local with `bun --version`)
```bash
curl -fsSL https://bun.sh/install | bash -s "bun-v1.2.19"
source ~/.bashrc
bun --version  # should print 1.2.19
```

### Install PM2
```bash
bun add -g pm2
```

---

## Part 5 — Deploy Code

### Clone repo
```bash
sudo mkdir -p /opt/scalereach
sudo chown ubuntu:ubuntu /opt/scalereach
git clone https://github.com/hevink/scalereach-tmkoc.git /opt/scalereach
cd /opt/scalereach
git checkout feature/split-screen-clips  # or main
```

### Upload .env from local machine (run this locally, not on EC2)
```bash
scp -i ~/.ssh/scalereach-worker.pem scalereach-tmkoc/.env.production ubuntu@98.81.246.231:/opt/scalereach/.env
```

### Install dependencies
```bash
cd /opt/scalereach
bun install
mkdir -p logs
```

---

## Part 6 — Start Worker with PM2

```bash
# Set up PM2 to auto-start on reboot
sudo env PATH=$PATH:/usr/bin:/home/ubuntu/.bun/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu

# Start the worker
cd /opt/scalereach
pm2 start ecosystem.config.cjs

# Save process list
pm2 save
```

### Verify it's running
```bash
pm2 status
curl http://localhost:3002/health
```

Expected health response:
```json
{
  "status": "healthy",
  "workers": {
    "videoWorker": { "running": true },
    "clipWorker": { "running": true },
    "translationWorker": { "running": true },
    "dubbingWorker": { "running": true },
    "socialWorker": { "running": true }
  },
  "redis": { "status": "healthy" }
}
```

---

## Part 7 — Nginx + SSL

### Install nginx and certbot
```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

### Create nginx config
```bash
printf '%s\n' \
  'server {' \
  '    listen 80;' \
  '    server_name worker.scalereach.ai;' \
  '' \
  '    location / {' \
  '        proxy_pass http://localhost:3002;' \
  '        proxy_http_version 1.1;' \
  '        proxy_set_header Host $host;' \
  '        proxy_set_header X-Real-IP $remote_addr;' \
  '        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;' \
  '        proxy_set_header X-Forwarded-Proto $scheme;' \
  '        proxy_read_timeout 300s;' \
  '        proxy_connect_timeout 75s;' \
  '    }' \
  '}' \
  | sudo tee /etc/nginx/sites-available/worker.scalereach.ai > /dev/null
```

### Enable and start nginx
```bash
sudo ln -sf /etc/nginx/sites-available/worker.scalereach.ai /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx
```

### Get SSL certificate (DNS must be pointing first)
```bash
sudo certbot --nginx -d worker.scalereach.ai --non-interactive --agree-tos -m hevin@scalereach.ai
```

### Verify HTTPS works
```bash
curl https://worker.scalereach.ai/health
```

SSL cert auto-renews every 90 days via certbot's systemd timer.

---

## Part 8 — GitHub CI/CD Secrets

Go to: `https://github.com/hevink/scalereach-tmkoc/settings/secrets/actions`

Add these secrets:

| Secret | Value |
|--------|-------|
| `EC2_HOST` | `98.81.246.231` |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | full contents of `~/.ssh/scalereach-worker.pem` |
| `RENDER_DEPLOY_HOOK_URL` | from Render dashboard → Settings → Deploy Hook |

To get the key: `cat ~/.ssh/scalereach-worker.pem`

After this, every push to `main` will automatically:
1. Deploy API to Render
2. SSH into EC2 and run `pm2 reload`

---

## Useful Commands

```bash
# SSH in
ssh -i ~/.ssh/scalereach-worker.pem ubuntu@98.81.246.231

# Worker status
pm2 status
pm2 logs scalereach-worker --lines 50

# Restart / reload
pm2 restart scalereach-worker
pm2 reload ecosystem.config.cjs

# Health check
curl https://worker.scalereach.ai/health
curl https://worker.scalereach.ai/health/detailed

# Update .env on EC2
scp -i ~/.ssh/scalereach-worker.pem scalereach-tmkoc/.env.production ubuntu@98.81.246.231:/opt/scalereach/.env
ssh -i ~/.ssh/scalereach-worker.pem ubuntu@98.81.246.231 "pm2 restart scalereach-worker"

# Manual deploy (pull latest + reload)
ssh -i ~/.ssh/scalereach-worker.pem ubuntu@98.81.246.231 "cd /opt/scalereach && git pull && bun install && pm2 reload ecosystem.config.cjs"
```

---

## Troubleshooting

**Worker keeps restarting**
```bash
pm2 logs scalereach-worker --lines 100
```
Usually a bad env var or Redis connection issue.

**Redis not connecting**
- Check `REDIS_URL` in `/opt/scalereach/.env`
- Test: `redis-cli -u redis://:botyoo@13.204.63.21:6379 ping`

**Out of disk space (ffmpeg temp files)**
```bash
df -h
du -sh /tmp/*
sudo rm -rf /tmp/scalereach-* 2>/dev/null
```

**Upgrade instance type** (when you need more power)
- Stop instance in AWS Console
- Actions → Instance Settings → Change Instance Type → `t3.large` or `t3.xlarge`
- Start instance (IP stays the same if using Elastic IP)
