const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'security.log' }),
  ],
});

// Middleware для логирования успешных и неуспешных попыток входа
function logLoginAttempt(req, res, next) {
  const originalSend = res.send;
  res.send = function (body) {
    if (req.path === '/api/v1/login') {
      if (res.statusCode === 200) {
        logger.info(`Успешный вход пользователя: ${req.body.email}`, { ip: req.ip });
      } else {
        logger.warn(`Неудачная попытка входа: ${req.body.email}`, { ip: req.ip, status: res.statusCode });
      }
    }
    originalSend.apply(res, arguments);
  };
  next();
}

// Middleware для логирования платежей
function logPayment(req, res, next) {
  const originalSend = res.send;
  res.send = function (body) {
    if (req.path.startsWith('/api/payment')) {
      logger.info(`Обработка платежа: ${req.method} ${req.originalUrl}`, { ip: req.ip, body: req.body });
    }
    originalSend.apply(res, arguments);
  };
  next();
}

module.exports = {
  logger,
  logLoginAttempt,
  logPayment,
};
