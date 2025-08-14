const Queue = require('bull');
const winston = require('winston');

// Настройка логгера
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/queue.log' })
  ],
});

// Конфигурация Redis для очередей
const redisConfig = {
  redis: {
    port: process.env.REDIS_PORT || 6379,
    host: process.env.REDIS_HOST || '127.0.0.1',
    password: process.env.REDIS_PASSWORD || undefined,
    db: process.env.REDIS_DB || 0,
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    enableReadyCheck: false,
    lazyConnect: true,
    // Исправляем проблемы с timeout
    connectTimeout: 60000,
    commandTimeout: 5000,
    // Добавляем настройки для брокера сообщений
    maxmemoryPolicy: 'allkeys-lru'
  },
  // Настройки для Bull
  settings: {
    stalledInterval: 30 * 1000, // 30 секунд
    maxStalledCount: 1,
    retryProcessDelay: 5 * 1000 // 5 секунд
  }
};

// Создание очередей для разных типов задач с правильными настройками
const queues = {
  // Обработка платежей
  payments: new Queue('payment processing', redisConfig),

  // Обновление достижений и XP
  achievements: new Queue('achievement updates', redisConfig),

  // Обработка уведомлений
  notifications: new Queue('notifications', redisConfig),

  // Генерация отчетов и статистики
  reports: new Queue('report generation', redisConfig),

  // CS.Money операции (уже существует)
  csmoney: new Queue('csmoney import', redisConfig),

  // Email отправка
  emails: new Queue('email sending', redisConfig),

  // Обработка выводов Steam предметов
  withdrawals: new Queue('item withdrawals', redisConfig),

  // Обновление пользовательской статистики
  userStats: new Queue('user statistics', redisConfig)
};

// Настраиваем опции для всех очередей
Object.values(queues).forEach(queue => {
  // Настройки по умолчанию для всех задач
  queue.defaultJobOptions = {
    removeOnComplete: 10,
    removeOnFail: 20,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  };
});

// Настройка обработчиков событий для мониторинга
Object.keys(queues).forEach(queueName => {
  const queue = queues[queueName];

  queue.on('completed', (job, result) => {
    logger.info(`Job completed in queue ${queueName}:`, {
      jobId: job.id,
      type: job.name,
      duration: Date.now() - job.timestamp,
      result: typeof result === 'string' ? result : 'completed'
    });
  });

  queue.on('failed', (job, err) => {
    logger.error(`Job failed in queue ${queueName}:`, {
      jobId: job.id,
      type: job.name,
      error: err.message,
      stack: err.stack
    });
  });

  queue.on('stalled', (job) => {
    logger.warn(`Job stalled in queue ${queueName}:`, {
      jobId: job.id,
      type: job.name
    });
  });
});

// Функции для добавления задач в очереди
const addJob = {
  // Обработка платежа
  async processPayment(paymentData, options = {}) {
    return await queues.payments.add('process-payment', paymentData, {
      attempts: 3,
      backoff: 'exponential',
      delay: 0,
      ...options
    });
  },

  // Обновление достижений
  async updateAchievements(userId, achievementData, options = {}) {
    return await queues.achievements.add('update-achievements', {
      userId,
      ...achievementData
    }, {
      attempts: 2,
      backoff: 'fixed',
      delay: 1000,
      ...options
    });
  },

  // Отправка уведомления
  async sendNotification(notificationData, options = {}) {
    return await queues.notifications.add('send-notification', notificationData, {
      attempts: 5,
      backoff: 'exponential',
      delay: 0,
      ...options
    });
  },

  // Генерация отчета
  async generateReport(reportType, parameters, options = {}) {
    return await queues.reports.add('generate-report', {
      type: reportType,
      parameters
    }, {
      attempts: 1,
      delay: 0,
      ...options
    });
  },

  // Отправка email
  async sendEmail(emailData, options = {}) {
    return await queues.emails.add('send-email', emailData, {
      attempts: 3,
      backoff: 'exponential',
      delay: 0,
      ...options
    });
  },

  // Обработка вывода предмета
  async processWithdrawal(withdrawalData, options = {}) {
    return await queues.withdrawals.add('process-withdrawal', withdrawalData, {
      attempts: 3,
      backoff: 'exponential',
      delay: 1000,
      removeOnComplete: 10,
      removeOnFail: 20,
      ...options
    });
  },

  // Обновление статистики пользователя
  async updateUserStats(userId, statsData, options = {}) {
    return await queues.userStats.add('update-user-stats', {
      userId,
      ...statsData
    }, {
      attempts: 2,
      backoff: 'fixed',
      delay: 2000,
      ...options
    });
  },

  // CS.Money импорт (существующий)
  async importCSMoneyItems(offset, limit, options = {}) {
    return await queues.csmoney.add('import-items', { offset, limit }, {
      attempts: 3,
      backoff: 'exponential',
      delay: 1000,
      ...options
    });
  }
};

// Функция для получения статистики очередей
async function getQueueStats() {
  const stats = {};

  for (const [name, queue] of Object.entries(queues)) {
    try {
      const waiting = await queue.getWaiting();
      const active = await queue.getActive();
      const completed = await queue.getCompleted();
      const failed = await queue.getFailed();

      stats[name] = {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length
      };
    } catch (error) {
      stats[name] = {
        error: error.message
      };
    }
  }

  return stats;
}

// Функция для очистки завершенных задач
async function cleanQueues(maxAge = 24 * 60 * 60 * 1000) { // 24 часа по умолчанию
  for (const [name, queue] of Object.entries(queues)) {
    try {
      // Очищаем только валидные типы задач
      const cleanedCompleted = await queue.clean(maxAge, 'completed', 100);
      const cleanedFailed = await queue.clean(maxAge, 'failed', 100);

      if (cleanedCompleted > 0 || cleanedFailed > 0) {
        logger.info(`Cleaned queue ${name}: ${cleanedCompleted} completed, ${cleanedFailed} failed jobs`);
      }
    } catch (error) {
      logger.error(`Error cleaning queue ${name}:`, error);
    }
  }
}

// Функция для обработки зависших задач
async function cleanStalledJobs() {
  for (const [name, queue] of Object.entries(queues)) {
    try {
      // Получаем зависшие задачи и перезапускаем их
      const stalledJobs = await queue.getJobs(['stalled'], 0, 100);

      if (stalledJobs.length > 0) {
        logger.warn(`Found ${stalledJobs.length} stalled jobs in queue ${name}`);

        for (const job of stalledJobs) {
          try {
            // Пытаемся перезапустить зависшую задачу
            await job.retry();
            logger.info(`Retried stalled job ${job.id} in queue ${name}`);
          } catch (retryError) {
            logger.error(`Failed to retry job ${job.id}:`, retryError);
            // Если не можем перезапустить, помечаем как failed
            await job.moveToFailed({ message: 'Job was stalled and retry failed' });
          }
        }
      }
    } catch (error) {
      logger.error(`Error handling stalled jobs in queue ${name}:`, error);
    }
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Gracefully shutting down queues...');

  const closePromises = Object.values(queues).map(queue => queue.close());
  await Promise.all(closePromises);

  logger.info('All queues closed');
  process.exit(0);
});

module.exports = {
  queues,
  addJob,
  getQueueStats,
  cleanQueues,
  cleanStalledJobs,
  logger
};
