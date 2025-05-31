const Queue = require('bull');
const puppeteer = require('puppeteer');
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
    new winston.transports.File({ filename: 'csmoney-worker.log' })
  ],
});

// Создаем очередь Bull для задач импорта CS.Money
const csmoneyQueue = new Queue('csmoney import', {
  redis: {
    port: process.env.REDIS_PORT || 6379,
    host: process.env.REDIS_HOST || '127.0.0.1',
    password: process.env.REDIS_PASSWORD || undefined,
    db: process.env.REDIS_DB || 0
  }
});

// Обработчик задач очереди
csmoneyQueue.process('import-items', 5, async (job) => {
  const { offset, limit } = job.data;
  logger.info(`Начинаем обработку задачи импорта предметов с offset=${offset}, limit=${limit}`);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Здесь должна быть логика импорта предметов с использованием page
    // Например, переход на страницу, парсинг и возврат данных

    // Пример: просто логируем и возвращаем пустой результат
    logger.info('Импорт предметов выполнен успешно (пример)');

    return { success: true, items: [] };
  } catch (error) {
    logger.error('Ошибка при импорте предметов в worker:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
      logger.info('Браузер закрыт в worker');
    }
  }
});

module.exports = {
  csmoneyQueue
};
