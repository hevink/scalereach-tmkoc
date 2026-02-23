// PM2 config — EC2 worker only
// API runs on Render, worker runs here
module.exports = {
  apps: [
    {
      name: "scalereach-worker",
      script: "src/worker.ts",
      interpreter: "bun",
      cwd: "/opt/scalereach",
      env: {
        NODE_ENV: "production",
        WORKER_HEALTH_PORT: "3002",
        VIDEO_WORKER_CONCURRENCY: "2",
        CLIP_WORKER_CONCURRENCY: "2",
        DUBBING_WORKER_CONCURRENCY: "1",
        PATH: "/home/ubuntu/.deno/bin:/home/ubuntu/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      },
      out_file: "./logs/worker-out.log",
      error_file: "./logs/worker-error.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      max_restarts: 10,
      restart_delay: 5000,
      exp_backoff_restart_delay: 1000,
      max_memory_restart: "2G",
      watch: false,
    },
  ],
};
