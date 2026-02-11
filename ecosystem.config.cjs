module.exports = {
  apps: [
    {
      name: "scalereach-worker",
      script: "src/worker.ts",
      interpreter: "bun",
      cwd: "/opt/scalereach-worker",
      env: {
        NODE_ENV: "production",
      },
      // Logging
      out_file: "./logs/worker-out.log",
      error_file: "./logs/worker-error.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      // Restart policy
      max_restarts: 10,
      restart_delay: 5000,
      exp_backoff_restart_delay: 1000,
      // Memory limit (restart if exceeded)
      max_memory_restart: "2G",
      // Watch (disabled in prod, enable for dev)
      watch: false,
    },
  ],
};
