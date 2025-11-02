const winston = require('winston');
const path = require('path');

// Создаем директорию для логов если её нет
const fs = require('fs');
const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'chibox-game' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5242880,
      maxFiles: 5
    })
  ],
});

// Функция для условного логирования только важных событий
const shouldLog = (req) => {
  return req.path.includes('/payment') ||
         req.path.includes('/login') ||
         req.path.includes('/admin') ||
         req.method !== 'GET';
};

// Middleware для логирования запросов
const requestLogger = (req, res, next) => {
  if (shouldLog(req)) {
    logger.info(`${req.method} ${req.path}`, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id
    });
  }
  next();
};

// Пустые middleware для обратной совместимости
// Логирование теперь происходит напрямую в контроллерах
const logLoginAttempt = (req, res, next) => {
  next();
};

const logPayment = (req, res, next) => {
  next();
};

module.exports = {
  logger,
  requestLogger,
  logLoginAttempt,
  logPayment,
  shouldLog
};
