const jwt = require('jsonwebtoken');

// Список отозванных токенов (RAM black list)
const revokedTokens = new Set();
// Для продакшена — использовать Redis или другую БД

// TODO: Implement rate limiting middleware for critical endpoints like login, register, payment webhook, etc.

const authMiddleware = (req, res, next) => {
  let token = null;

  // Получаем токен из заголовка Authorization
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  // Если токен не найден в заголовке, проверяем query параметры (для Steam ссылок)
  if (!token && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ message: 'Требуется токен авторизации' });
  }

  if (revokedTokens.has(token)) {
    return res.status(401).json({ message: 'Токен отозван (revoked)' });
  }

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Невалидный или просроченный токен' });
  }
};

// Экспортируем middleware как функцию по умолчанию и revokedTokens как свойство
module.exports = authMiddleware;
module.exports.revokedTokens = revokedTokens;
