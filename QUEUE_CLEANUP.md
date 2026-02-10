# BullMQ Queue Cleanup & TTL Management

## Overview

BullMQ jobs don't have automatic TTL like regular Redis keys. This document explains how job cleanup works and how to manage stuck jobs.

## Automatic Cleanup Configuration

### Current Settings

Both `videoProcessingQueue` and `clipGenerationQueue` have automatic cleanup configured:

```typescript
{
  removeOnComplete: {
    count: 100,        // Keep last 100 completed jobs
    age: 24 * 60 * 60  // Remove completed jobs after 24 hours
  },
  removeOnFail: {
    count: 50,         // Keep last 50 failed jobs
    age: 7 * 24 * 60 * 60  // Remove failed jobs after 7 days
  }
}
```

### Periodic Cleanup (New)

Added automatic cleanup that runs every hour:

- **Completed jobs**: Removed after 24 hours
- **Failed jobs**: Removed after 7 days
- **Waiting jobs**: Removed after 1 hour (stuck in queue)
- **Active jobs**: Removed after 30 minutes (likely stuck processing)
- **Delayed jobs**: Removed after 1 hour

## Manual Cleanup Scripts

### 1. Inspect a Job

Check the status and details of a specific job:

```bash
# Inspect a specific job
bun run inspect:job clip-3nUMA0OtQJIgChK_JtyqV

# Or with full path
bun run src/scripts/inspect-job.ts clip-3nUMA0OtQJIgChK_JtyqV
```

**Output includes**:
- Queue name
- Job state (completed, failed, waiting, active, delayed)
- Timestamps (created, processed, finished)
- Job age
- Attempt count
- Error messages (if failed)
- Job data

### 2. Clean Stuck Jobs

Remove stale or stuck jobs:

```bash
# Clean all stale jobs from all queues
bun run clean:jobs

# Clean a specific job
bun run clean:jobs clip-3nUMA0OtQJIgChK_JtyqV

# Or with full path
bun run src/scripts/clean-stuck-jobs.ts clip-3nUMA0OtQJIgChK_JtyqV
```

## Job States

BullMQ jobs can be in these states:

1. **waiting** - Job is in queue, waiting to be processed
2. **active** - Job is currently being processed
3. **completed** - Job finished successfully
4. **failed** - Job failed after all retry attempts
5. **delayed** - Job is scheduled for future processing
6. **paused** - Queue is paused

## Common Issues

### Stuck Jobs

**Symptoms**:
- Jobs remain in "active" state for too long
- Jobs stuck in "waiting" state
- Redis keys like `bull:clip-generation:clip-*` don't expire

**Causes**:
- Worker crashed while processing
- Network timeout
- Unhandled exception in worker
- Redis connection lost

**Solutions**:

1. **Inspect the job first**:
   ```bash
   bun run inspect:job <jobId>
   ```

2. **Clean the specific job**:
   ```bash
   bun run clean:jobs <jobId>
   ```

3. **Clean all stale jobs**:
   ```bash
   bun run clean:jobs
   ```

4. **Restart workers**:
   ```bash
   # Stop workers
   pkill -f "bun run src/worker.ts"
   
   # Start workers
   bun run worker
   ```

### Memory Issues

If Redis is filling up with job data:

1. **Check job counts**:
   ```bash
   redis-cli
   > KEYS bull:*
   > DBSIZE
   ```

2. **Reduce retention**:
   - Lower `removeOnComplete.age` to 12 hours
   - Lower `removeOnFail.age` to 3 days
   - Reduce `count` values

3. **Run manual cleanup**:
   ```bash
   bun run clean:jobs
   ```

## Redis Key Patterns

BullMQ creates these Redis keys:

```
bull:clip-generation:id                    # Job ID counter
bull:clip-generation:clip-<id>             # Individual job data
bull:clip-generation:wait                  # Waiting jobs list
bull:clip-generation:active                # Active jobs list
bull:clip-generation:completed             # Completed jobs set
bull:clip-generation:failed                # Failed jobs set
bull:clip-generation:delayed               # Delayed jobs sorted set
bull:clip-generation:events                # Job events stream
bull:clip-generation:meta                  # Queue metadata
```

## Monitoring

### Check Queue Status

```typescript
import { clipGenerationQueue } from './jobs/queue';

// Get job counts
const counts = await clipGenerationQueue.getJobCounts();
console.log(counts);
// { waiting: 5, active: 2, completed: 100, failed: 10, delayed: 0 }

// Get waiting jobs
const waiting = await clipGenerationQueue.getWaiting();

// Get active jobs
const active = await clipGenerationQueue.getActive();

// Get failed jobs
const failed = await clipGenerationQueue.getFailed();
```

### Dashboard

Consider using BullMQ Board for visual monitoring:

```bash
npm install @bull-board/api @bull-board/hono
```

## Best Practices

1. **Set appropriate TTLs**:
   - Completed jobs: 24 hours (current)
   - Failed jobs: 7 days (current)
   - Active jobs: 30 minutes max

2. **Monitor queue health**:
   - Check for stuck jobs daily
   - Monitor Redis memory usage
   - Track job failure rates

3. **Handle failures gracefully**:
   - Log errors properly
   - Update job status in database
   - Notify users of failures

4. **Clean up regularly**:
   - Automatic cleanup runs hourly
   - Manual cleanup weekly
   - Monitor Redis key count

5. **Use job IDs wisely**:
   - Use meaningful IDs: `clip-${clipId}`, `video-${videoId}`
   - Makes debugging easier
   - Prevents duplicate jobs

## Troubleshooting

### Job Not Found

```bash
# Check if job exists in Redis
redis-cli
> EXISTS bull:clip-generation:clip-3nUMA0OtQJIgChK_JtyqV
```

If it returns `1`, the key exists but might not be a valid job. Clean it manually:

```bash
redis-cli
> DEL bull:clip-generation:clip-3nUMA0OtQJIgChK_JtyqV
```

### Worker Not Processing Jobs

1. Check if worker is running:
   ```bash
   ps aux | grep worker
   ```

2. Check worker logs:
   ```bash
   tail -f logs/worker.log
   ```

3. Restart worker:
   ```bash
   bun run worker
   ```

### Redis Connection Issues

1. Check Redis connection:
   ```bash
   redis-cli PING
   ```

2. Check Redis memory:
   ```bash
   redis-cli INFO memory
   ```

3. Check Redis config:
   ```bash
   redis-cli CONFIG GET maxmemory
   ```

## Configuration Reference

### Queue Options

```typescript
{
  connection: redisConfig,
  defaultJobOptions: {
    attempts: 1,              // Number of retry attempts
    backoff: {
      type: 'exponential',    // Backoff strategy
      delay: 5000             // Initial delay (ms)
    },
    removeOnComplete: {
      count: 100,             // Keep last N completed jobs
      age: 24 * 60 * 60       // Remove after N seconds
    },
    removeOnFail: {
      count: 50,              // Keep last N failed jobs
      age: 7 * 24 * 60 * 60   // Remove after N seconds
    }
  }
}
```

### Cleanup Intervals

```typescript
// Current: Every 1 hour
setInterval(async () => {
  await queue.clean(age, limit, status);
}, 60 * 60 * 1000);
```

Adjust based on your needs:
- High volume: Every 30 minutes
- Low volume: Every 2-4 hours
- Production: Every 1 hour (current)

## Support

For issues or questions:
- Check BullMQ docs: https://docs.bullmq.io/
- Review queue logs
- Use inspection scripts
- Contact DevOps team
