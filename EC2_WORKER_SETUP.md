# EC2 Worker Setup Guide

This documents the exact steps used to deploy the ScaleReach worker to AWS EC2.

## Architecture

```
Frontend (app.scalereach.ai)
    → API (api.scalereach.ai)
    → Redis (13.204.63.21:6379)
    → Worker (worker.scalereach.ai / EC2)  ← this guide
              ↓
        R2 / Deepgram / Anthropic / ElevenLabs
```

The API and worker communicate **only through Redis queues** — they do not call each other over HTTP.
The worker URL (`worker.scalereach.ai`) is for monitoring only, nothing in the app calls it.

The worker runs `src/worker.ts` via PM2. The API runs separately on Render.

---

## Current Instance

| Property | Value |
|----------|-------|
| Instance ID | `i-005f32f27449be306` |
| Public IP | `98.81.246.231` |
| Domain | `https://worker.scalereach.ai` |
| Region | `us-east-1` (N. Virginia) |
| AMI | Ubuntu 24.04 LTS |
| Type | `t3.micro` — upgrade to `t3.large` for real video processing load |
| Storage | 28GB |
| Key pair | `~/.ssh/scalereach-worker.pem` |
| Deploy path | `/opt/scalereach` |
| Branch | `feature/split-screen-clips` (switch to `main` when merging) |
| Bun version | `1.2.19` |
| Node version | `v22.22.0` (required for PM2) |

---

## Part 1 — Launch EC2 Instance

1. AWS Console → EC2 → Launch Instance
2. AMI: **Ubuntu 24.04 LTS**
3. Instance type: `t3.large` (2 vCPU, 8GB RAM — needed for ffmpeg/video processing)
4. Storage: **30GB+** (ffmpeg creates large temp files)
5. Key pair: Create new → download `.pem` file
6. Security group: allow SSH (port 22) from your IP only for now

After launch, save the key locally:
```bash
mv ~/Downloads/your-key.pem ~/.ssh/scalereach-worker.pem
chmod 400 ~/.ssh/scalereach-worker.pem
```

---

## Part 2 — Security Group (Open Ports)

EC2 → Security Groups → your instance's group → Inbound rules → Edit inbound rules

Add these 3 rules:

| Type  | Protocol | Port | Source    |
|-------|----------|------|-----------|
| SSH   | TCP      | 22   | Your IP   |
| HTTP  | TCP      | 80   | 0.0.0.0/0 |
| HTTPS | TCP      | 443  | 0.0.0.0/0 |

Direct link: `https://us-east-1.console.aws.amazon.com/ec2/home?region=us-east-1#SecurityGroups:`

---

## Part 3 — DNS Record

In Cloudflare for `scalereach.ai`:

| Type | Name   | Value         | Proxy        |
|------|--------|---------------|--------------|
| A    | worker | 98.81.246.231 | OFF (grey cloud — must be off for certbot) |

Wait for DNS to propagate before running certbot. Verify with:
```bash
host worker.scalereach.ai  # should return 98.81.246.231
```

---

## Part 4 — Server Setup

SSH in:
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

### Install Node.js v22 (required for PM2 startup script)
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version  # should print v22.x.x
```

### Install Bun — pin to exact same version as local
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

### Create deploy directory
```bash
sudo mkdir -p /opt/scalereach
sudo chown ubuntu:ubuntu /opt/scalereach
```

### Clone repo
```bash
git clone https://github.com/hevink/scalereach-tmkoc.git /opt/scalereach
cd /opt/scalereach
git checkout feature/split-screen-clips  # or main
```

### Upload .env (run this on your LOCAL machine, not EC2)
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
# Configure PM2 to auto-start on reboot
sudo env PATH=$PATH:/usr/bin:/home/ubuntu/.bun/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu

# Start the worker
cd /opt/scalereach
pm2 start ecosystem.config.cjs

# Save process list so it survives reboots
pm2 save
```

### Verify it's running
```bash
pm2 status
curl http://localhost:3002/health
```

Expected:
```json
{
  "status": "healthy",
  "workers": {
    "videoWorker": { "running": true, "concurrency": 2 },
    "clipWorker": { "running": true, "concurrency": 2 },
    "translationWorker": { "running": true, "concurrency": 1 },
    "dubbingWorker": { "running": true, "concurrency": 1 },
    "socialWorker": { "running": true, "concurrency": 2 }
  },
  "redis": { "status": "healthy", "latency": 184 }
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

### Enable site and start nginx
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

### Verify HTTPS
```bash
curl https://worker.scalereach.ai/health
```

SSL cert auto-renews every 90 days via certbot's systemd timer — no manual action needed.

---

## Part 8 — GitHub CI/CD

Every push to `feature/split-screen-clips` or `main` automatically:
1. Builds `src/index.ts` and `src/worker.ts`
2. SSHes into EC2 and runs `pm2 reload`
3. Runs a health check to confirm the worker is up

### Add GitHub secrets

Go to: `https://github.com/hevink/scalereach-tmkoc/settings/secrets/actions`

| Secret | Value |
|--------|-------|
| `EC2_HOST` | `98.81.246.231` |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | full contents of `~/.ssh/scalereach-worker.pem` |
| `RENDER_DEPLOY_HOOK_URL` | Render dashboard → your service → Settings → Deploy Hook |

To get the SSH key: `cat ~/.ssh/scalereach-worker.pem`

---

## Health Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Basic status — all workers + Redis |
| `GET /health/detailed` | Adds queue stats (waiting/active/completed/failed per queue) |
| `GET /health/live` | Liveness probe — just returns `alive` |
| `GET /health/ready` | Readiness probe — checks all workers + Redis |
| `GET /health/hevin` | Full debug dashboard — Redis INFO, all BullMQ keys, system CPU/RAM/load, env vars |

---

## Useful Commands

```bash
# SSH in
ssh -i ~/.ssh/scalereach-worker.pem ubuntu@98.81.246.231

# Worker status
pm2 status
pm2 logs scalereach-worker --lines 50

# Restart / zero-downtime reload
pm2 restart scalereach-worker
pm2 reload ecosystem.config.cjs

# Health checks
curl https://worker.scalereach.ai/health
curl https://worker.scalereach.ai/health/detailed
curl https://worker.scalereach.ai/health/hevin

# Update .env on EC2 (run locally)
scp -i ~/.ssh/scalereach-worker.pem scalereach-tmkoc/.env.production ubuntu@98.81.246.231:/opt/scalereach/.env
ssh -i ~/.ssh/scalereach-worker.pem ubuntu@98.81.246.231 "export PATH=/home/ubuntu/.bun/bin:\$PATH && pm2 restart scalereach-worker"

# Manual deploy (pull latest + reload)
ssh -i ~/.ssh/scalereach-worker.pem ubuntu@98.81.246.231 \
  "export PATH=/home/ubuntu/.bun/bin:\$PATH && cd /opt/scalereach && git pull && bun install && pm2 reload ecosystem.config.cjs"
```

---

## Troubleshooting

**Worker keeps restarting**
```bash
pm2 logs scalereach-worker --lines 100
```
Usually a bad env var or Redis connection issue.

**Redis not connecting**
```bash
# Check the URL in .env
grep REDIS_URL /opt/scalereach/.env

# Test connection directly
redis-cli -u redis://:botyoo@13.204.63.21:6379 ping
```

**Out of disk space (ffmpeg temp files)**
```bash
df -h
sudo rm -rf /tmp/scalereach-* 2>/dev/null
```

**bun/pm2 not found after SSH**
```bash
export PATH="/home/ubuntu/.bun/bin:$PATH"
```

**Upgrade instance type** (when you need more CPU/RAM for video processing)
- Stop instance in AWS Console
- Actions → Instance Settings → Change Instance Type → `t3.large` or `t3.xlarge`
- Start instance — public IP stays the same if you have an Elastic IP, otherwise update DNS
