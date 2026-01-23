# EC2 Deployment - Quick Start

## Steps to Deploy

### 1. Launch EC2 Instance

- **AMI**: Amazon Linux 2023 or Ubuntu 22.04
- **Instance Type**: t3.medium (2 vCPU, 4 GB RAM)
- **Storage**: 30 GB
- **Security Group**: 
  - Port 22 (SSH)
  - Port 3001 (API)
  - Port 80/443 (if using nginx)

### 2. Connect to EC2

```bash
ssh -i your-key.pem ec2-user@your-ec2-ip
```

### 3. Clone Repository

```bash
git clone https://github.com/your-repo/scalereach.git
cd scalereach/scalereach-tmkoc
```

### 4. Create .env File

```bash
cp env.example .env
nano .env
```

Add your credentials:
```env
DATABASE_URL=postgresql://...
DEEPGRAM_API_KEY=...
GROQ_API_KEY=...
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=...
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=http://your-ec2-ip:3001
```

### 5. Run Deployment Script

```bash
chmod +x deploy-ec2.sh
./deploy-ec2.sh
```

That's it! Your server is running.

## Verify Deployment

```bash
# Check containers
docker-compose ps

# View logs
docker-compose logs -f

# Test API
curl http://localhost:3001/health
```

## Access from Outside

Your API will be available at: `http://your-ec2-ip:3001`

Update frontend `.env.local`:
```env
NEXT_PUBLIC_API_URL=http://your-ec2-ip:3001
```

## Useful Commands

```bash
# Restart services
docker-compose restart

# Stop services
docker-compose down

# Update code and restart
git pull
docker-compose up -d --build

# View specific logs
docker-compose logs -f api
docker-compose logs -f worker
```

## Setup Domain with Nginx

After deploying, setup nginx:

```bash
./setup-nginx.sh your-domain.com
```

This will:
- Install nginx
- Configure reverse proxy to port 3001
- Start nginx service

### Setup SSL (HTTPS)

```bash
# Install certbot
sudo yum install certbot python3-certbot-nginx -y

# Get SSL certificate (automatic nginx config)
sudo certbot --nginx -d your-domain.com

# Test auto-renewal
sudo certbot renew --dry-run
```

Your API will be available at: `https://your-domain.com`

## Troubleshooting

**Containers not starting:**
```bash
docker-compose logs
```

**Out of memory:**
- Upgrade to t3.large (8 GB RAM)
- Or reduce worker concurrency

**Port 3001 not accessible:**
- Check EC2 security group allows port 3001
- Check if API is running: `docker-compose ps`
