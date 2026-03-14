// PM2 config - BASE EC2 instance
// Runs all workers at low concurrency + autoscaler
// Burst instance handles heavy clip/dubbing load
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
        CLIP_WORKER_CONCURRENCY: "1",
        DUBBING_WORKER_CONCURRENCY: "1",
        SMART_CROP_WORKER_CONCURRENCY: "1",
        PYTHON_PATH: "/home/ubuntu/smart_crop_env/bin/python3",
        MODEL_PATH: "/home/ubuntu/blaze_face_short_range.tflite",
        SMART_CROP_TMP_DIR: "/tmp",
        YOUTUBE_COOKIES_PATH: "/opt/scalereach/config/youtube_cookies.txt",
        YT_DLP_GET_POT_BGUTIL_BASE_URL: "http://localhost:4416",
        YOUTUBE_PROXY: "http://Zh2cj1I0096UEPA:R6AsyxCbiOinY95@92.113.114.83:43964",
        PATH: "/home/ubuntu/.deno/bin:/home/ubuntu/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      },
      out_file: "./logs/worker-out.log",
      error_file: "./logs/worker-error.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      max_restarts: 10,
      restart_delay: 5000,
      exp_backoff_restart_delay: 1000,
      max_memory_restart: "1536M",
      watch: false,
    },
    {
      name: "scalereach-scaler",
      script: "src/scripts/autoscaler.ts",
      interpreter: "bun",
      cwd: "/opt/scalereach",
      env: {
        NODE_ENV: "production",
        BURST_INSTANCE_ID: "i-0159e456a281a0a29",
        SCALE_UP_THRESHOLD: "3",
        SCALE_DOWN_IDLE_MS: "600000",    // 10 minutes
        SCALER_CHECK_INTERVAL_MS: "60000", // 60 seconds
        AWS_REGION: "us-east-1",
        PATH: "/home/ubuntu/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      },
      out_file: "./logs/scaler-out.log",
      error_file: "./logs/scaler-error.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      max_restarts: 50,
      restart_delay: 10000,
      watch: false,
    },
  ],
};
