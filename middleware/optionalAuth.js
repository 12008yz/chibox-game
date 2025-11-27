const jwt = require('jsonwebtoken');

/**
 * Middleware для опциональной аутентификации
 * Если токен предоставлен и валиден, добавляет пользователя к req.user
 * Если есть сессия с пользователем, также добавляет к req.user
 * Если ничего нет, продолжает без ошибки
 */
const optionalAuthMiddleware = (req, res, next) => {
  let token = null;

  // ПРИОРИТЕТ 1: Проверяем httpOnly cookie (безопасный метод)
  if (req.cookies && req.cookies.auth_token) {
    token = req.cookies.auth_token;
  }

  // ПРИОРИТЕТ 2: Проверяем Authorization header (обратная совместимость)
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  // Сначала проверяем JWT токен
  if (token) {
    try {
      if (!process.env.JWT_SECRET) {
        console.log('JWT_SECRET не настроен');
        // Продолжаем к проверке сессии
      } else {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Добавляем информацию о пользователе
        return next();
      }
    } catch (error) {
      // Невалидный токен - продолжаем к проверке сессии
      console.log('Невалидный токен в опциональной аутентификации:', error.message);
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
