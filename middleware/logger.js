// Импортируем централизованный логгер
const { logger, requestLogger, logLoginAttempt, logPayment } = require('../utils/logger');

module.exports = {
  logger,
  requestLogger,
  logLoginAttempt,
  logPayment,
};
