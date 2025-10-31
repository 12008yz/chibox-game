module.exports = {
  apps: [
    // Основное веб-приложение
    {
      name: "chibox-main",
      script: "app.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
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
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production"
      },
      env_development: {
        NODE_ENV: "development"
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
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "256M",
      env: {
        NODE_ENV: "production"
      },
      env_development: {
        NODE_ENV: "development"
      },
      error_file: "./logs/cron-error.log",
      out_file: "./logs/cron-out.log",
      log_file: "./logs/cron.log",
      time: true,
      merge_logs: true
    },

    // Выдача ежедневных кейсов
    {
      name: "chibox-daily-cases",
      script: "./scripts/dailyCaseIssuer.js",
      instances: 1,
      autorestart: false, // Запускается только по cron
      watch: false,
      cron_restart: "0 0 * * *", // Каждый день в полночь
      env: {
        NODE_ENV: "production"
      },
      env_development: {
        NODE_ENV: "development"
      },
      error_file: "./logs/daily-cases-error.log",
      out_file: "./logs/daily-cases-out.log",
      log_file: "./logs/daily-cases.log",
      time: true,
      merge_logs: true
    },

    // Unified Withdrawal Processor (Steam Bot + PlayerOk Arbitrage)
    {
      name: "chibox-withdrawal-processor",
      script: "./scripts/withdrawal-processor.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G", // Puppeteer может использовать много памяти
      env: {
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
