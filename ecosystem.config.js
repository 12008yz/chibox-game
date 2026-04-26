module.exports = {
  apps: [
    // Основное веб-приложение. Для 500+ пользователей: задайте REDIS_URL (сессии + Socket.IO + rate-limit).
    // Масштабирование: несколько инстансов за nginx (разные порты) или увеличение ресурсов одного инстанса.
    {
      name: "chibox-main",
      script: "bin/www",
      // Один процесс с Socket.IO; cluster mode в PM2 даёт воркерам конфликт bind на PORT → EADDRINUSE и лавину рестартов
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3000
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3000
      },
      env_development: {
        NODE_ENV: "development",
        PORT: 3000
      },
      error_file: "./logs/main-error.log",
      out_file: "./logs/main-out.log",
      log_file: "./logs/main.log",
      time: true,
      merge_logs: true
    },

    // Фоновые воркеры (очереди)
    {
      name: "chibox-workers",
      script: "./scripts/start-workers.js",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        ENABLE_STEAM_WITHDRAWALS_WORKER: "false"
      },
      env_production: {
        NODE_ENV: "production",
        ENABLE_STEAM_WITHDRAWALS_WORKER: "false"
      },
      env_development: {
        NODE_ENV: "development",
        ENABLE_STEAM_WITHDRAWALS_WORKER: "false"
      },
      error_file: "./logs/workers-error.log",
      out_file: "./logs/workers-out.log",
      log_file: "./logs/workers.log",
      time: true,
      merge_logs: true
    },

    // ✅ ИСПРАВЛЕНО: Cron задачи (включая обработку withdrawal)
    {
      name: "chibox-cron",
      script: "./scripts/setup-cron-improved.js",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "256M",
      env: {
        NODE_ENV: "production",
        ENABLE_STEAM_WITHDRAWAL_CRON: "false"
      },
      env_production: {
        NODE_ENV: "production",
        ENABLE_STEAM_WITHDRAWAL_CRON: "false"
      },
      env_development: {
        NODE_ENV: "development",
        ENABLE_STEAM_WITHDRAWAL_CRON: "false"
      },
      error_file: "./logs/cron-error.log",
      out_file: "./logs/cron-out.log",
      log_file: "./logs/cron.log",
      time: true,
      merge_logs: true
    },

    // Unified Withdrawal Processor (Steam Bot + PlayerOk Arbitrage)
    {
      name: "chibox-withdrawal-processor",
      script: "./scripts/withdrawal-processor.js",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G", // Puppeteer может использовать много памяти
      restart_delay: 60000, // 1 мин задержка перед рестартом (защита от Steam AccountLoginDeniedThrottle)
      env: {
        NODE_ENV: "production"
      },
      env_production: {
        NODE_ENV: "production"
      },
      env_development: {
        NODE_ENV: "development"
      },
      error_file: "./logs/withdrawal-processor-error.log",
      out_file: "./logs/withdrawal-processor-out.log",
      log_file: "./logs/withdrawal-processor.log",
      time: true,
      merge_logs: true
    }
  ],

  // Дополнительные настройки для развертывания
  deploy: {
    production: {
      user: "node",
      host: "your-server.com",
      ref: "origin/main",
      repo: "git@github.com:your-username/chibox-game.git",
      path: "/var/www/chibox-game",
      "pre-deploy-local": "",
      "post-deploy": "npm install && pm2 reload ecosystem.config.js --env production",
      "pre-setup": ""
    }
  }
};
