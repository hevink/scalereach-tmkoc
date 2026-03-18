// PM2 config - BURST EC2 instance only
// Runs clip + dubbing workers at high concurrency
// Auto-starts on boot via systemd
module.exports = {
  apps: [
    {
      name: "scalereach-burst-pot",
      script: "/home/ubuntu/bgutil-ytdlp-pot-provider/server/build/main.js",
      interpreter: "node",
      args: "--port 4416",
      env: {
        NODE_ENV: "production",
      },
      out_file: "./logs/burst-pot-out.log",
      error_file: "./logs/burst-pot-error.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      max_restarts: 10,
      restart_delay: 3000,
      watch: false,
    },
    {
      name: "scalereach-burst-worker",
      script: "src/worker-burst.ts",
      interpreter: "bun",
      cwd: "/opt/scalereach",
      env: {
        NODE_ENV: "production",
        BURST_HEALTH_PORT: "3003",
        CLIP_WORKER_CONCURRENCY: "4",
        DUBBING_WORKER_CONCURRENCY: "2",
        PYTHON_PATH: "/home/ubuntu/smart_crop_env/bin/python3",
        MODEL_PATH: "/home/ubuntu/blaze_face_short_range.tflite",
        SMART_CROP_TMP_DIR: "/tmp",
        YOUTUBE_COOKIES_PATH: "/opt/scalereach/config/youtube_cookies.txt",
        YT_DLP_GET_POT_BGUTIL_BASE_URL: "http://localhost:4416",
        PATH: "/home/ubuntu/.deno/bin:/home/ubuntu/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      },
      out_file: "./logs/burst-out.log",
      error_file: "./logs/burst-error.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      max_restarts: 10,
      restart_delay: 5000,
      exp_backoff_restart_delay: 1000,
      max_memory_restart: "24G",
      watch: false,
    },
  ],
};
