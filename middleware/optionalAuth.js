const jwt = require('jsonwebtoken');
const authModule = require('./auth');
const revokedTokens = authModule.revokedTokens;

/**
 * Middleware для опциональной аутентификации
 * Если токен предоставлен и валиден, добавляет пользователя к req.user
 * Если есть сессия с пользователем, также добавляет к req.user
 * Если ничего нет, продолжает без ошибки
 */
const optionalAuthMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // Сначала проверяем JWT токен
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);

    try {
      if (!process.env.JWT_SECRET) {
        console.log('JWT_SECRET не настроен');
        // Продолжаем к проверке сессии
      } else if (!revokedTokens.has(token)) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Добавляем информацию о пользователе
        return next();
      }
    } catch (error) {
      // Невалидный токен - продолжаем к проверке сессии
      console.log('Невалидный токен в опциональной аутентификации:', error.message);
    }
  }

  // Cookie accessToken (как в authMiddleware), без 401 при отсутствии
  if (!req.user && req.cookies && req.cookies.accessToken && process.env.JWT_SECRET) {
    const token = req.cookies.accessToken;
    try {
      if (!revokedTokens.has(token)) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        return next();
      }
    } catch (error) {
      // невалидный cookie — гость
    }
  }

  // Если нет валидного JWT токена, проверяем сессию
  if (req.session && req.session.userId) {
    req.user = {
      id: req.session.userId,
      // Добавляем другие поля из сессии, если они есть
      ...req.session.user
    };
    console.log('Пользователь аутентифицирован через сессию:', req.user.id);
  }

  next();
};

module.exports = optionalAuthMiddleware;
