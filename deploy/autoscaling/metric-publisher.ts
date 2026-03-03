/**
 * Lambda function — publishes BullMQ queue depth to CloudWatch every 60s.
 * Deploy as a scheduled Lambda (EventBridge rule: rate(1 minute)).
 *
 * Required env vars (set in Lambda config):
 *   REDIS_HOST     — Redis host (e.g. 13.204.63.21)
 *   REDIS_PORT     — Redis port (default 6379)
 *   REDIS_PASSWORD — Redis password
 *   AWS_REGION     — AWS region (injected automatically by Lambda)
 */

import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import Redis from "ioredis";

const NAMESPACE = "ScaleReach/Worker";

const QUEUES = [
  "video-processing",
  "clip-generation",
  "translation",
  "dubbing",
  "social-posting",
  "smart-crop",
];

export const handler = async () => {
  const redis = new Redis({
    host: process.env.REDIS_HOST!,
    port: parseInt(process.env.REDIS_PORT || "6379"),
    password: process.env.REDIS_PASSWORD,
    tls: process.env.REDIS_TLS === "true" ? {} : undefined,
    connectTimeout: 5000,
    lazyConnect: true,
  });

  const cw = new CloudWatchClient({ region: process.env.AWS_REGION || "us-east-1" });

  try {
    await redis.connect();

    // For each queue, sum waiting + active jobs = total pending work
    const metrics: { name: string; value: number }[] = [];

    for (const queue of QUEUES) {
      const waitKey = `bull:${queue}:wait`;
      const activeKey = `bull:${queue}:active`;
      const delayedKey = `bull:${queue}:delayed`;

      const [waiting, active, delayed] = await Promise.all([
        redis.llen(waitKey),
        redis.llen(activeKey),
        redis.zcard(delayedKey),
      ]);

      const pending = waiting + active + delayed;
      metrics.push({ name: queue, value: pending });
      console.log(`[METRIC] ${queue}: waiting=${waiting} active=${active} delayed=${delayed} total=${pending}`);
    }

    // Total pending across all queues — this is the primary scaling metric
    const totalPending = metrics.reduce((sum, m) => sum + m.value, 0);
    metrics.push({ name: "TotalPending", value: totalPending });

    // Publish all metrics in one batch (max 20 per call)
    await cw.send(new PutMetricDataCommand({
      Namespace: NAMESPACE,
      MetricData: metrics.map((m) => ({
        MetricName: m.name === "TotalPending" ? "TotalPendingJobs" : `QueueDepth_${m.name.replace(/-/g, "_")}`,
        Value: m.value,
        Unit: "Count",
        Dimensions: [
          { Name: "Environment", Value: process.env.ENVIRONMENT || "production" },
        ],
      })),
    }));

    console.log(`[METRIC] Published ${metrics.length} metrics. TotalPending=${totalPending}`);
    return { statusCode: 200, totalPending };
  } finally {
    await redis.quit().catch(() => {});
  }
};
