const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

module.exports = (req, res, next) => {
  const start = Date.now();
  // Храним оригинальный метод отправки ответа
  const { method, originalUrl, ip, headers, body } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      type: 'http_request',
      method,
      url: originalUrl,
      status: res.statusCode,
      duration_ms: duration,
      ip,
      user_agent: headers['user-agent'],
      request_body: (method === 'POST' || method === 'PUT' || method === 'PATCH') ? body : undefined
    });
  });
  next();
};
