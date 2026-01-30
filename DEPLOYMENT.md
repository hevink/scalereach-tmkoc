# ScaleReach Deployment Guide

Complete guide for deploying ScaleReach to production environments.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Architecture Overview](#architecture-overview)
3. [Environment Variables Setup](#environment-variables-setup)
4. [Database Setup (Neon PostgreSQL)](#database-setup-neon-postgresql)
5. [Redis Setup](#redis-setup)
6. [AWS EC2 Deployment](#aws-ec2-deployment)
7. [Docker Commands Reference](#docker-commands-reference)
8. [CI/CD Pipeline](#cicd-pipeline)
9. [Monitoring and Health Checks](#monitoring-and-health-checks)
10. [SSL/HTTPS Setup](#sslhttps-setup)
11. [Scaling](#scaling)
12. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

| Tool | Version | Purpose |
|------|---------|---------|
| Docker | 20.10+ | Container runtime |
| Docker Compose | 2.0+ | Multi-container orchestration |
| AWS CLI | 2.x | AWS resource management |
| Git | 2.x | Version control |

### Required Accounts and Services

- **Neon** - PostgreSQL database (https://neon.tech)
- **Cloudflare R2** - Object storage for videos/clips
- **Deepgram** - Speech-to-text transcription
- **Azure OpenAI / Groq** - LLM for viral clip detection
- **Dodo Payments** (optional) - Payment processing

### Hardware Requirements

| Environment | Instance Type | vCPU | RAM | Storage |
|-------------|---------------|------|-----|---------|
| Development | t3.small | 2 | 2 GB | 20 GB |
| Production (minimum) | t3.medium | 2 | 4 GB | 30 GB |
| Production (recommended) | t3.large | 2 | 8 GB | 50 GB |

---

## Architecture Overview

```
                                    +------------------+
                                    |   Load Balancer  |
                                    |   (Nginx/ALB)    |
                                    +--------+---------+
                                             |
                    +------------------------+------------------------+
                    |                                                 |
           +--------v---------+                              +--------v---------+
           |    API Server    |                              |    API Server    |
           |   (Port 3001)    |                              |   (Port 3001)    |
           +--------+---------+                              +--------+---------+
                    |                                                 |
                    +------------------------+------------------------+
                                             |
                    +------------------------+------------------------+
                    |                        |                        |
           +--------v---------+     +--------v---------+     +--------v---------+
           |      Redis       |     |     Worker       |     |  Neon PostgreSQL |
           |   (Job Queue)    |<--->|  (Background)    |     |    (Database)    |
           +------------------+     +--------+---------+     +------------------+
                                             |
                                    +--------v---------+
                                    |  Cloudflare R2   |
                                    |    (Storage)     |
                                    +------------------+
```

### Services

| Service | Description | Port |
|---------|-------------|------|
| API | Hono REST API server | 3001 |
| Worker | BullMQ background job processor | 3002 (health) |
| Redis | Job queue and caching | 6379 |

---

## Environment Variables Setup

### 1. Create Environment File

```bash
cp env.example .env
```

### 2. Configure All Variables

```bash
# Server Configuration
PORT=3001
NODE_ENV=production
FRONTEND_URL=https://your-frontend-domain.com

# Database (Neon PostgreSQL)
# Get this from Neon dashboard -> Connection Details
DATABASE_URL=postgresql://username:password@ep-xxx.region.aws.neon.tech/dbname?sslmode=require

# Authentication (Better Auth)
# Generate a secure random string: openssl rand -base64 32
BETTER_AUTH_SECRET=your-secure-random-secret-key
BETTER_AUTH_URL=https://api.your-domain.com

# Redis Configuration
REDIS_HOST=localhost          # Use 'redis' for Docker Compose
REDIS_PORT=6379
REDIS_PASSWORD=               # Optional, set if using authenticated Redis

# Worker Concurrency (adjust based on server resources)
VIDEO_WORKER_CONCURRENCY=2    # Number of concurrent video processing jobs
CLIP_WORKER_CONCURRENCY=4     # Number of concurrent clip generation jobs

# Cloudflare R2 Storage
# Get from Cloudflare Dashboard -> R2 -> Manage R2 API Tokens
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
R2_BUCKET_NAME=scalereach-videos
R2_PUBLIC_URL=https://pub-xxx.r2.dev

# Deepgram Speech-to-Text
# Get from https://console.deepgram.com
DEEPGRAM_API_KEY=your-deepgram-api-key

# LLM Configuration (choose one)
# Option 1: Azure OpenAI (recommended for production)
AZURE_OPENAI_API_KEY=your-azure-openai-api-key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_DEPLOYMENT=gpt-4o

# Option 2: Groq (faster, good for development)
GROQ_API_KEY=your-groq-api-key

# Option 3: OpenAI
# OPENAI_API_KEY=your-openai-api-key

# SMTP Configuration (for email notifications)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password
SMTP_FROM_EMAIL=noreply@your-domain.com
SMTP_FROM_NAME=ScaleReach

# Dodo Payments (optional)
DODO_PAYMENTS_API_KEY=your-dodo-api-key
DODO_WEBHOOK_SECRET=your-dodo-webhook-secret
DODO_ENVIRONMENT=live_mode    # or 'test_mode'

# OAuth Providers (optional)
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
# GITHUB_CLIENT_ID=
# GITHUB_CLIENT_SECRET=

# Error Tracking (optional)
# SENTRY_DSN=https://xxx@sentry.io/xxx
```

### 3. Validate Environment

```bash
# Check all required variables are set
cat .env | grep -v "^#" | grep -v "^$" | wc -l
```

---

## Database Setup (Neon PostgreSQL)

### 1. Create Neon Project

1. Go to https://neon.tech and sign up/login
2. Click "New Project"
3. Select region closest to your server (e.g., `us-east-1`)
4. Copy the connection string

### 2. Configure Connection String

```bash
# Format
DATABASE_URL=postgresql://[user]:[password]@[host]/[database]?sslmode=require

# Example
DATABASE_URL=postgresql://scalereach_owner:abc123@ep-cool-darkness-123456.us-east-1.aws.neon.tech/scalereach?sslmode=require
```

### 3. Run Database Migrations

```bash
# Generate migrations from schema
bun run db:generate

# Apply migrations to database
bun run db:migrate

# (Optional) Open Drizzle Studio to view data
bun run db:studio
```

### 4. Verify Connection

```bash
# Test database connection
curl http://localhost:3001/health/detailed | jq '.checks.database'
```

### Neon Best Practices

- **Connection Pooling**: Neon handles this automatically
- **Branching**: Use Neon branches for staging/testing
- **Autoscaling**: Enable compute autoscaling for production
- **Backups**: Neon provides automatic point-in-time recovery

---

## Redis Setup

### Option 1: Docker Compose (Recommended for EC2)

Redis is included in `docker-compose.yml`:

```yaml
redis:
  image: redis:7-alpine
  ports:
    - "6379:6379"
  volumes:
    - redis_data:/data
  restart: unless-stopped
```

### Option 2: AWS ElastiCache

```bash
# Create Redis cluster
aws elasticache create-cache-cluster \
  --cache-cluster-id scalereach-redis \
  --engine redis \
  --cache-node-type cache.t3.micro \
  --num-cache-nodes 1 \
  --region us-east-1

# Get endpoint
aws elasticache describe-cache-clusters \
  --cache-cluster-id scalereach-redis \
  --show-cache-node-info \
  --query 'CacheClusters[0].CacheNodes[0].Endpoint.Address' \
  --output text
```

### Option 3: Upstash Redis (Serverless)

1. Go to https://upstash.com
2. Create a new Redis database
3. Copy the connection details

```bash
REDIS_HOST=xxx.upstash.io
REDIS_PORT=6379
REDIS_PASSWORD=your-upstash-password
```

---

## AWS EC2 Deployment

### Step 1: Launch EC2 Instance

**Via AWS Console:**

1. Go to EC2 Dashboard -> Launch Instance
2. Configure:
   - **Name**: `scalereach-production`
   - **AMI**: Amazon Linux 2023 or Ubuntu 22.04 LTS
   - **Instance Type**: t3.medium (minimum)
   - **Key Pair**: Create or select existing
   - **Storage**: 30 GB gp3
   - **Security Group**: Create with rules below

**Security Group Rules:**

| Type | Port | Source | Description |
|------|------|--------|-------------|
| SSH | 22 | Your IP | SSH access |
| HTTP | 80 | 0.0.0.0/0 | Web traffic |
| HTTPS | 443 | 0.0.0.0/0 | Secure web traffic |
| Custom TCP | 3001 | 0.0.0.0/0 | API (direct access) |

### Step 2: Connect to Instance

```bash
# Set permissions on key file
chmod 400 your-key.pem

# Connect via SSH
ssh -i your-key.pem ec2-user@your-ec2-public-ip

# For Ubuntu AMI, use:
ssh -i your-key.pem ubuntu@your-ec2-public-ip
```

### Step 3: Initial Server Setup

```bash
# Update system packages
sudo yum update -y          # Amazon Linux
# sudo apt update && sudo apt upgrade -y  # Ubuntu

# Install Git
sudo yum install git -y     # Amazon Linux
# sudo apt install git -y   # Ubuntu
```

### Step 4: Clone Repository

```bash
# Create app directory
sudo mkdir -p /app
sudo chown $USER:$USER /app
cd /app

# Clone repository
git clone https://github.com/your-org/scalereach.git
cd scalereach/scalereach-tmkoc
```

### Step 5: Configure Environment

```bash
# Copy example environment file
cp env.example .env

# Edit with your credentials
nano .env
```

### Step 6: Run Deployment Script

```bash
# Make script executable
chmod +x deploy-ec2.sh

# Run deployment
./deploy-ec2.sh
```

The script will:
1. Install Docker if not present
2. Install Docker Compose if not present
3. Validate `.env` file exists
4. Build and start all containers

### Step 7: Verify Deployment

```bash
# Check container status
docker compose ps

# Expected output:
# NAME                    STATUS
# scalereach-tmkoc-api-1     Up (healthy)
# scalereach-tmkoc-worker-1  Up
# scalereach-tmkoc-redis-1   Up

# Test API health
curl http://localhost:3001/health

# View logs
docker compose logs -f
```

### Step 8: Setup Domain with Nginx (Optional)

```bash
# Run nginx setup script
chmod +x setup-nginx.sh
./setup-nginx.sh your-domain.com
```

---

## Docker Commands Reference

### Basic Operations

```bash
# Start all services
docker compose up -d

# Stop all services
docker compose down

# Restart all services
docker compose restart

# Restart specific service
docker compose restart api
docker compose restart worker

# View running containers
docker compose ps
```

### Logs

```bash
# View all logs
docker compose logs

# Follow logs in real-time
docker compose logs -f

# View specific service logs
docker compose logs -f api
docker compose logs -f worker
docker compose logs -f redis

# View last 100 lines
docker compose logs --tail=100 api
```

### Building and Updating

```bash
# Rebuild containers (after code changes)
docker compose build

# Rebuild without cache
docker compose build --no-cache

# Pull latest code and rebuild
git pull origin main
docker compose down
docker compose build --no-cache
docker compose up -d

# Clean up unused images
docker system prune -f
```

### Debugging

```bash
# Execute command in running container
docker compose exec api sh
docker compose exec worker sh

# Check container resource usage
docker stats

# Inspect container
docker compose logs api 2>&1 | tail -50
```

---

## CI/CD Pipeline

### GitHub Actions Workflow

The project uses GitHub Actions for automated deployment. The workflow is defined in `.github/workflows/ci.yml`.

### Pipeline Stages

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│  Type Check │────>│ Build Verification │────>│   Deploy    │
│             │     │                 │     │   (main)    │
└─────────────┘     └─────────────────┘     └─────────────┘
```

1. **Type Check**: Runs `bun run build` (TypeScript compilation check)
2. **Build Verification**: Verifies both entry points compile
3. **Deploy**: SSH to EC2 and deploy (only on `main` branch)

### Required GitHub Secrets

Configure these in your repository settings (Settings -> Secrets -> Actions):

| Secret | Description |
|--------|-------------|
| `EC2_HOST` | EC2 public IP or domain |
| `EC2_SSH_KEY` | Private SSH key (contents of .pem file) |

### Setting Up Secrets

```bash
# Get your EC2 public IP
aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=scalereach-production" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text

# Copy SSH key contents
cat your-key.pem
```

### Manual Deployment

If CI/CD fails, deploy manually:

```bash
# SSH to server
ssh -i your-key.pem ec2-user@your-ec2-ip

# Navigate to app
cd /app/scalereach/scalereach-tmkoc

# Pull and deploy
git pull origin main
docker compose down
docker compose build --no-cache
docker compose up -d
docker system prune -f
```

---

## Monitoring and Health Checks

### Health Check Endpoints

| Endpoint | Purpose | Response |
|----------|---------|----------|
| `GET /health` | Basic health (load balancers) | `{"status": "healthy"}` |
| `GET /health/detailed` | Full system status | Includes DB, Redis, queues |
| `GET /health/live` | Kubernetes liveness probe | `{"status": "ok"}` |
| `GET /health/ready` | Kubernetes readiness probe | Checks DB and Redis |

### Basic Health Check

```bash
curl http://localhost:3001/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-30T12:00:00.000Z",
  "checks": {
    "database": { "status": "healthy", "latency": 15 },
    "redis": { "status": "healthy", "latency": 2 }
  }
}
```

### Detailed Health Check

```bash
curl http://localhost:3001/health/detailed
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-30T12:00:00.000Z",
  "uptime": 86400,
  "checks": {
    "database": { "status": "healthy", "latency": 15 },
    "redis": { "status": "healthy", "latency": 2 },
    "queues": {
      "status": "healthy",
      "video-processing": { "waiting": 0, "active": 1, "completed": 150, "failed": 0 },
      "clip-generation": { "waiting": 5, "active": 2, "completed": 500, "failed": 2 }
    }
  }
}
```

### Docker Health Check

The Dockerfile includes a built-in health check:

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1
```

### Monitoring with CloudWatch (AWS)

```bash
# View API logs
aws logs tail /ecs/scalereach-api --follow

# View worker logs
aws logs tail /ecs/scalereach-worker --follow

# Create CloudWatch alarm for unhealthy status
aws cloudwatch put-metric-alarm \
  --alarm-name scalereach-health \
  --metric-name HealthCheckStatus \
  --namespace AWS/EC2 \
  --statistic Average \
  --period 60 \
  --threshold 1 \
  --comparison-operator LessThanThreshold \
  --evaluation-periods 2
```

### External Monitoring Services

Recommended services for production:

- **UptimeRobot** (free) - Basic uptime monitoring
- **Better Uptime** - Incident management
- **Datadog** - Full observability
- **Sentry** - Error tracking (configure `SENTRY_DSN`)

---

## SSL/HTTPS Setup

### Using Let's Encrypt with Certbot

```bash
# Install Certbot (Amazon Linux)
sudo yum install certbot python3-certbot-nginx -y

# Install Certbot (Ubuntu)
# sudo apt install certbot python3-certbot-nginx -y

# Obtain certificate
sudo certbot --nginx -d your-domain.com

# Test auto-renewal
sudo certbot renew --dry-run
```

### Manual Nginx SSL Configuration

Edit `/etc/nginx/conf.d/scalereach.conf`:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    client_max_body_size 500M;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts for long video processing
        proxy_connect_timeout 600;
        proxy_send_timeout 600;
        proxy_read_timeout 600;
        send_timeout 600;
    }
}
```

```bash
# Test and reload nginx
sudo nginx -t
sudo systemctl reload nginx
```

---

## Scaling

### Horizontal Scaling (Multiple Instances)

#### Scale Workers

Workers can be scaled independently based on queue depth:

```bash
# Scale to 3 worker instances
docker compose up -d --scale worker=3
```

#### Scale API (with Load Balancer)

For multiple API instances, use AWS ALB or nginx upstream:

```nginx
upstream scalereach_api {
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
    server 127.0.0.1:3003;
}

server {
    location / {
        proxy_pass http://scalereach_api;
    }
}
```

### Vertical Scaling (Worker Concurrency)

Adjust in `.env`:

```bash
# Increase for more powerful servers
VIDEO_WORKER_CONCURRENCY=4    # Default: 2
CLIP_WORKER_CONCURRENCY=8     # Default: 4
```

### Auto-Scaling with AWS ECS

```bash
# Configure auto-scaling for workers
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/scalereach/scalereach-worker \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 1 \
  --max-capacity 10

# Scale based on queue depth
aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --resource-id service/scalereach/scalereach-worker \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name queue-depth-scaling \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration file://scaling-policy.json
```

---

## Troubleshooting

### Common Issues and Solutions

#### 1. Containers Not Starting

```bash
# Check logs for errors
docker compose logs

# Common causes:
# - Missing .env file
# - Invalid environment variables
# - Port already in use
```

**Solution:**
```bash
# Verify .env exists
ls -la .env

# Check for port conflicts
sudo lsof -i :3001
sudo lsof -i :6379

# Kill conflicting process
sudo kill -9 <PID>
```

#### 2. Database Connection Failed

```bash
# Error: "Connection refused" or "timeout"
```

**Solution:**
```bash
# Verify DATABASE_URL format
echo $DATABASE_URL

# Test connection manually
psql "$DATABASE_URL" -c "SELECT 1"

# Check Neon dashboard for:
# - Compute endpoint is active
# - IP allowlist (if enabled)
# - Connection limit not exceeded
```

#### 3. Redis Connection Failed

```bash
# Error: "ECONNREFUSED" or "Redis connection error"
```

**Solution:**
```bash
# Check Redis is running
docker compose ps redis

# Test Redis connection
docker compose exec redis redis-cli ping
# Should return: PONG

# For external Redis, verify:
# - REDIS_HOST is correct
# - Security group allows port 6379
# - REDIS_PASSWORD is set (if required)
```

#### 4. Worker Jobs Failing

```bash
# Check worker logs
docker compose logs -f worker

# Common causes:
# - yt-dlp outdated
# - ffmpeg missing
# - Insufficient disk space
```

**Solution:**
```bash
# Update yt-dlp in container
docker compose exec worker pip3 install -U yt-dlp

# Check disk space
df -h

# Clear temp files
docker compose exec worker rm -rf /app/temp/*

# Rebuild container with latest dependencies
docker compose build --no-cache worker
docker compose up -d worker
```

#### 5. Out of Memory

```bash
# Error: "JavaScript heap out of memory" or container killed
```

**Solution:**
```bash
# Check memory usage
docker stats

# Reduce worker concurrency in .env
VIDEO_WORKER_CONCURRENCY=1
CLIP_WORKER_CONCURRENCY=2

# Restart with new settings
docker compose down
docker compose up -d

# Or upgrade instance type
# t3.medium -> t3.large (8 GB RAM)
```

#### 6. API Timeout on Large Videos

```bash
# Error: 504 Gateway Timeout
```

**Solution:**
```bash
# Increase nginx timeouts
sudo nano /etc/nginx/conf.d/scalereach.conf

# Set higher values:
proxy_connect_timeout 1200;
proxy_send_timeout 1200;
proxy_read_timeout 1200;
send_timeout 1200;

# Reload nginx
sudo nginx -t && sudo systemctl reload nginx
```

#### 7. Permission Denied Errors

```bash
# Error: "EACCES: permission denied"
```

**Solution:**
```bash
# Fix ownership
sudo chown -R $USER:$USER /app

# Fix Docker socket permissions
sudo chmod 666 /var/run/docker.sock

# Add user to docker group
sudo usermod -aG docker $USER
# Log out and back in
```

#### 8. SSL Certificate Issues

```bash
# Error: "certificate has expired" or "unable to verify"
```

**Solution:**
```bash
# Renew certificate
sudo certbot renew

# Force renewal
sudo certbot renew --force-renewal

# Check certificate expiry
sudo certbot certificates
```

### Debug Commands

```bash
# Full system diagnostics
docker compose ps
docker compose logs --tail=50
curl -s http://localhost:3001/health/detailed | jq
df -h
free -m
docker stats --no-stream

# Network diagnostics
curl -v http://localhost:3001/health
netstat -tlnp | grep -E '3001|6379'

# Container shell access
docker compose exec api sh
docker compose exec worker sh
```

### Getting Help

1. Check logs: `docker compose logs -f`
2. Review health endpoint: `curl localhost:3001/health/detailed`
3. Check GitHub Issues for known problems
4. Contact support with:
   - Error messages
   - Health check output
   - Docker logs (last 100 lines)

---

## Quick Reference

### Essential Commands

```bash
# Deploy
./deploy-ec2.sh

# Start
docker compose up -d

# Stop
docker compose down

# Logs
docker compose logs -f

# Restart
docker compose restart

# Update
git pull && docker compose build --no-cache && docker compose up -d

# Health
curl localhost:3001/health
```

### Important Files

| File | Purpose |
|------|---------|
| `.env` | Environment configuration |
| `docker-compose.yml` | Container orchestration |
| `Dockerfile` | Container build instructions |
| `nginx.conf` | Reverse proxy configuration |
| `drizzle.config.ts` | Database configuration |

### Ports

| Service | Port |
|---------|------|
| API | 3001 |
| Worker Health | 3002 |
| Redis | 6379 |
| Nginx HTTP | 80 |
| Nginx HTTPS | 443 |
