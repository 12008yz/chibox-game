const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/secrets');

/**
 * Middleware для опциональной аутентификации
 * Если токен предоставлен и валиден, добавляет пользователя к req.user
 * Если токена нет или он невалиден, продолжает без ошибки
 */
const optionalAuthMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Нет токена - продолжаем без аутентификации
    return next();
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // Добавляем информацию о пользователе
  } catch (error) {
    // Невалидный токен - продолжаем без аутентификации (без ошибки)
    console.log('Невалидный токен в опциональной аутентификации:', error.message);
  }

  next();
};

module.exports = optionalAuthMiddleware;
