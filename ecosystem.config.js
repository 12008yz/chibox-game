module.exports = {
  apps: [
    {
      name: "main-app",
      script: "app.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "withdrawal-processor",
      script: "scripts/withdrawalProcessor.js",
      instances: 1,
      autorestart: true,
      watch: false,
      cron_restart: "*/10 * * * *", // restart every 10 minutes
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};