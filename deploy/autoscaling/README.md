# ScaleReach Worker — Horizontal Autoscaling

## How it works

```
BullMQ queues (Redis 13.204.63.21)
        ↓  (every 60s)
Lambda metric-publisher → CloudWatch namespace "ScaleReach/Worker"
        ↓
CloudWatch Alarm: TotalPendingJobs >= 5 for 2 min → scale OUT
CloudWatch Alarm: TotalPendingJobs < 2 for 5 min  → scale IN
        ↓
Auto Scaling Group (min=1, max=10, t3.large)
        ↓
New instance boots from baked AMI
User-data: pulls .env from SSM → git pull → pm2 start
```

**Scale-out steps** (queue depth → instances added):
- 5–25 pending jobs → +1 instance
- 25–55 pending jobs → +2 instances
- 55+ pending jobs → +3 instances

**Scale-in:** 1 instance removed when queue stays below 2 jobs for 5 minutes.

**Cooldowns:** 2 min after scale-out, 5 min after scale-in (prevents thrashing).

---

## Setup (one-time)

### Step 1 — Bake the base AMI

Your existing EC2 (`i-005f32f27449be306`) already has everything installed. Snapshot it:

```bash
cd scalereach-tmkoc
export AWS_REGION=us-east-1
export SOURCE_INSTANCE_ID=i-005f32f27449be306
chmod +x deploy/autoscaling/bake-ami.sh
./deploy/autoscaling/bake-ami.sh
# → outputs: AMI ID: ami-xxxxxxxxxxxxxxxxx
```

### Step 2 — Store secrets in SSM

New instances pull their config from SSM on boot (no secrets in AMI or git):

```bash
# Full .env.production
aws ssm put-parameter \
  --name "/scalereach/worker/env" \
  --type SecureString \
  --value "$(cat scalereach-tmkoc/.env.production)" \
  --region us-east-1

# YouTube cookies
aws ssm put-parameter \
  --name "/scalereach/youtube-cookies" \
  --type SecureString \
  --value "$(cat scalereach-tmkoc/config/youtube_cookies.txt)" \
  --region us-east-1

# Redis password (used by Lambda metric publisher)
aws ssm put-parameter \
  --name "/scalereach/redis-password" \
  --type SecureString \
  --value "botyoo" \
  --region us-east-1
```

### Step 3 — Run the setup script

```bash
export AWS_REGION=us-east-1
export BASE_AMI_ID=ami-xxxxxxxxxxxxxxxxx   # from step 1
export SUBNET_IDS="subnet-aaa,subnet-bbb"  # your VPC subnets
export SECURITY_GROUP_ID=sg-xxxxxxxxxxxxxxxxx
export KEY_NAME=scalereach-worker

chmod +x deploy/autoscaling/asg-setup.sh
./deploy/autoscaling/asg-setup.sh
```

This creates:
- IAM role + instance profile (SSM + CloudWatch access)
- EC2 Launch Template
- Auto Scaling Group (`scalereach-workers`, min=1, max=10)
- Step scaling policies (scale-out + scale-in)
- CloudWatch alarms
- Lambda metric publisher (runs every 60s)
- EventBridge rule to trigger Lambda

---

## Updating the AMI (after code changes)

When you deploy new code, re-bake the AMI so new instances get the latest version:

```bash
./deploy/autoscaling/bake-ami.sh
# Then update the launch template with the new AMI ID (script prints the command)
```

Alternatively, the `user-data.sh` always does `git reset --hard origin/<branch>` on boot, so new instances always pull the latest code even from an older AMI. The AMI just needs the runtime deps (bun, ffmpeg, etc.).

---

## Monitoring

```bash
# Current queue depth metric
aws cloudwatch get-metric-statistics \
  --namespace "ScaleReach/Worker" \
  --metric-name TotalPendingJobs \
  --dimensions Name=Environment,Value=production \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 --statistics Average \
  --region us-east-1

# Current ASG state
aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names scalereach-workers \
  --region us-east-1 \
  --query "AutoScalingGroups[0].{Desired:DesiredCapacity,Min:MinSize,Max:MaxSize,Instances:Instances[*].{Id:InstanceId,State:LifecycleState,Health:HealthStatus}}"

# Scaling activity history
aws autoscaling describe-scaling-activities \
  --auto-scaling-group-name scalereach-workers \
  --region us-east-1 \
  --max-items 10

# Lambda metric publisher logs
aws logs tail /aws/lambda/scalereach-queue-metric-publisher --follow --region us-east-1
```

---

## Tuning thresholds

Edit the alarms in `asg-setup.sh` or directly in CloudWatch console:

| Metric | Scale OUT threshold | Scale IN threshold |
|--------|--------------------|--------------------|
| `TotalPendingJobs` | >= 5 (2 min) | < 2 (5 min) |

If you find instances spinning up too aggressively, raise the scale-out threshold to 10.
If jobs are queuing too long, lower it to 3.

---

## Cost

- `t3.2xlarge` = ~$0.333/hr on-demand, ~$0.10/hr Spot (70% cheaper)
- To use Spot instances, change `InstanceType` in the launch template to a mixed instances policy
- At max 10 instances: ~$3.33/hr on-demand, ~$1.00/hr Spot
- Lambda metric publisher: ~$0 (1M free invocations/month, this uses ~44k/month)

---

## Important notes

- **Redis is self-hosted** at `13.204.63.21` — make sure the ASG security group allows outbound to port 6379
- **YouTube cookies** are shared across all instances (pulled from SSM) — all instances use the same cookies file
- **BullMQ** handles job deduplication — multiple workers processing the same queue is safe, each job is claimed by one worker
- The **existing EC2** (`i-005f32f27449be306`) can stay running as the baseline `min=1` instance — it doesn't need to be replaced
