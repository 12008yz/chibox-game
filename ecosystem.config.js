module.exports = {
  apps: [
    {
      name: "chibox-main",
      script: "app.js",
      instances: "max", // Использовать все CPU
      exec_mode: "cluster",
      max_memory_restart: "512M", // Меньше памяти на инстанс
      node_args: "--max-old-space-size=512",
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 3000
      },
      env_development: {
        NODE_ENV: "development",
        PORT: 3000
      }
    },
    {
      name: "chibox-worker",
      script: "scripts/withdrawalProcessor.js",
      instances: 2, // Отдельные воркеры для очередей
      exec_mode: "fork",
      max_memory_restart: "256M",
      autorestart: true,
      watch: false,
      cron_restart: "*/10 * * * *", // restart every 10 minutes
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
