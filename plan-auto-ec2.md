# Auto EC2 Spot Scaling Plan

## Goal
Automatically spin up cheap EC2 spot instances when the BullMQ queue is under heavy load,
and terminate them when idle. Primary EC2 (`t3.large`) always runs. Spot instances are overflow only.

---

## Architecture

```
Redis Queue (BullMQ)
       ↓
  Scaler Job (runs every 60s on primary EC2)
       ↓
  Queue depth check
       ↓
  AWS EC2 API → Launch / Terminate spot instances
       ↓
  Spot instance boots → pulls .env → runs worker → connects to same Redis
```

---

## Thresholds

| Queue waiting jobs | Action |
|---|---|
| < 5 | Do nothing |
| ≥ 5 for 5+ min | Launch 1 spot (`c6i.xlarge`) |
| ≥ 15 for 5+ min | Launch 2 spots (`c6i.xlarge`) |
| 0 for 10+ min | Terminate all spots |

---

## AWS One-Time Setup (Manual — do this first)

### 1. Create an AMI from current EC2
- Go to EC2 Console → Instances → select `scalereach-worker` → Actions → Image → Create Image
- Name it `scalereach-worker-ami`
- This snapshot has bun, ffmpeg, yt-dlp, deno, and the app code pre-installed
- Spot instances will boot from this — takes ~60s instead of 5+ min

### 2. Create a Launch Template
- EC2 Console → Launch Templates → Create
- AMI: `scalereach-worker-ami` (from step 1)
- Instance type: `c6i.xlarge`
- Key pair: `scalereach-worker` (same as primary)
- Security group: same as primary EC2
- Purchasing option: Spot
- User data script (runs on boot):
```bash
#!/bin/bash
cd /opt/scalereach
git pull origin main
cp /opt/scalereach/.env /opt/scalereach/.env  # already baked into AMI
/home/ubuntu/.bun/bin/bun install --frozen-lockfile
npx pm2 start ecosystem.config.js
npx pm2 save
```
- Save as `scalereach-worker-spot-template`

### 3. Create IAM Policy for EC2 self-management
Attach to the IAM role used by your primary EC2 (or Render):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:RunInstances",
        "ec2:TerminateInstances",
        "ec2:DescribeInstances",
        "ec2:DescribeSpotInstanceRequests",
        "ec2:CreateTags"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::YOUR_ACCOUNT_ID:role/scalereach-worker-role"
    }
  ]
}
```

### 4. Attach Elastic IP to primary EC2
- EC2 Console → Elastic IPs → Allocate → Associate with `scalereach-worker`
- This keeps the IP stable across stop/start cycles
- Current IP `3.93.175.142` will change without this

---

## Code to Build

### New files
- `src/jobs/auto-scaler.job.ts` — core scaler logic
  - Reads queue depth from BullMQ (`videoProcessingQueue.getWaitingCount()`)
  - Tracks how long queue has been above/below threshold (in-memory or Redis key)
  - Calls AWS SDK to launch/terminate spots
  - Tags spot instances with `{ Name: "scalereach-spot-worker", ManagedBy: "auto-scaler" }`

### Modified files
- `src/worker.ts` — wire in scaler as a cron every 60s
- `package.json` — add `@aws-sdk/client-ec2` dependency

### New env vars needed (add to `.env` on EC2)
```
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
EC2_LAUNCH_TEMPLATE_ID=lt-xxxxxxxxxxxxxxxxx   # from step 2
EC2_SPOT_MAX_COUNT=2                           # max spots to run at once
QUEUE_SCALE_UP_THRESHOLD=5                     # jobs waiting to trigger scale-up
QUEUE_SCALE_DOWN_IDLE_MINUTES=10               # idle minutes before scale-down
```

---

## Scaler Logic (pseudocode)

```
every 60 seconds:
  waitingJobs = videoProcessingQueue.getWaitingCount()
  activeSpots = AWS.describeInstances({ tag: "scalereach-spot-worker", state: "running" })

  if waitingJobs >= 15 and activeSpots.count < 2:
    launch spot instance (up to max 2)
    tag it as scalereach-spot-worker

  else if waitingJobs >= 5 and activeSpots.count < 1:
    launch 1 spot instance

  else if waitingJobs == 0 and idleFor >= 10 min:
    terminate all spot instances
```

---

## Cost Estimate

| Scenario | Cost |
|---|---|
| Idle (no spots) | $0 extra |
| 1 spot `c6i.xlarge` running 1hr | ~$0.05 |
| 2 spots running 4hrs/day | ~$0.40/day → ~$12/month max |
| Primary `t3.large` always on | ~$60/month |

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Spot instance gets interrupted by AWS | BullMQ retries failed jobs automatically (already configured) |
| Spot boots but can't connect to Redis | Health check — scaler verifies instance is processing before counting it |
| Scale-up loop (keeps launching) | Hard cap: `EC2_SPOT_MAX_COUNT=2` |
| AMI is stale (old code) | Rebuild AMI on each deploy via CI step |

---

## Implementation Order

1. Do AWS console setup (AMI + launch template + IAM policy + Elastic IP)
2. Add env vars to EC2 `.env`
3. Build `auto-scaler.job.ts`
4. Wire into `worker.ts`
5. Test with a manual queue flood
6. Monitor for 1 week, tune thresholds
