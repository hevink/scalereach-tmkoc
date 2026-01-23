# ScaleReach AWS Deployment Guide

## Architecture

- **API Server**: ECS Fargate service (public-facing, behind ALB)
- **Worker**: ECS Fargate service (background processing)
- **Redis**: ElastiCache Redis cluster
- **Database**: RDS PostgreSQL or external (Neon)
- **Storage**: Cloudflare R2 (already configured)

## Prerequisites

1. AWS CLI configured with credentials
2. Docker installed
3. AWS account with permissions for ECS, ECR, RDS, ElastiCache

## Deployment Steps

### 1. Build and Push Docker Image

```bash
cd scalereach-tmkoc
export AWS_REGION=us-east-1
./deploy-ecr.sh
```

### 2. Create AWS Resources

#### Create ElastiCache Redis Cluster

```bash
aws elasticache create-cache-cluster \
  --cache-cluster-id scalereach-redis \
  --engine redis \
  --cache-node-type cache.t3.micro \
  --num-cache-nodes 1 \
  --region us-east-1
```

Get Redis endpoint:
```bash
aws elasticache describe-cache-clusters \
  --cache-cluster-id scalereach-redis \
  --show-cache-node-info \
  --query 'CacheClusters[0].CacheNodes[0].Endpoint.Address' \
  --output text
```

#### Store Secrets in AWS Secrets Manager

```bash
aws secretsmanager create-secret \
  --name scalereach/database-url \
  --secret-string "postgresql://..." \
  --region us-east-1

aws secretsmanager create-secret \
  --name scalereach/redis-host \
  --secret-string "your-redis-endpoint.cache.amazonaws.com" \
  --region us-east-1

aws secretsmanager create-secret \
  --name scalereach/deepgram-key \
  --secret-string "your-deepgram-key" \
  --region us-east-1

aws secretsmanager create-secret \
  --name scalereach/groq-key \
  --secret-string "your-groq-key" \
  --region us-east-1

# Add R2 credentials similarly
```

#### Create ECS Cluster

```bash
aws ecs create-cluster \
  --cluster-name scalereach \
  --region us-east-1
```

#### Create CloudWatch Log Groups

```bash
aws logs create-log-group \
  --log-group-name /ecs/scalereach-api \
  --region us-east-1

aws logs create-log-group \
  --log-group-name /ecs/scalereach-worker \
  --region us-east-1
```

### 3. Update Task Definitions

Edit `ecs-task-api.json` and `ecs-task-worker.json`:
- Replace `YOUR_ACCOUNT_ID` with your AWS account ID
- Replace `YOUR_REGION` with your region (e.g., us-east-1)
- Update secret ARNs with actual values

### 4. Register Task Definitions

```bash
aws ecs register-task-definition \
  --cli-input-json file://ecs-task-api.json \
  --region us-east-1

aws ecs register-task-definition \
  --cli-input-json file://ecs-task-worker.json \
  --region us-east-1
```

### 5. Create ECS Services

#### API Service (with Load Balancer)

First, create an Application Load Balancer and target group, then:

```bash
aws ecs create-service \
  --cluster scalereach \
  --service-name scalereach-api \
  --task-definition scalereach-api \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=arn:aws:elasticloadbalancing:...,containerName=api,containerPort=3001" \
  --region us-east-1
```

#### Worker Service

```bash
aws ecs create-service \
  --cluster scalereach \
  --service-name scalereach-worker \
  --task-definition scalereach-worker \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=ENABLED}" \
  --region us-east-1
```

## Local Testing with Docker Compose

```bash
# Test locally with Redis
docker-compose up

# Test with external services (AWS)
docker-compose -f docker-compose.aws.yml up
```

## Scaling

Scale API:
```bash
aws ecs update-service \
  --cluster scalereach \
  --service scalereach-api \
  --desired-count 2
```

Scale Worker:
```bash
aws ecs update-service \
  --cluster scalereach \
  --service scalereach-worker \
  --desired-count 3
```

## Monitoring

View logs:
```bash
aws logs tail /ecs/scalereach-api --follow
aws logs tail /ecs/scalereach-worker --follow
```

## Cost Optimization

- Use Fargate Spot for workers (70% cheaper)
- Use t3.micro for Redis (dev) or t3.small (prod)
- Consider EC2 launch type for sustained workloads
- Use Auto Scaling based on queue depth

## Environment Variables

Update in task definitions or use AWS Systems Manager Parameter Store for non-sensitive configs.
