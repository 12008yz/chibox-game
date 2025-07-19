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

  // Логирование для Steam маршрутов
  if (req.path.includes('steam') || req.path.includes('link-steam')) {
    console.log('Auth middleware для Steam маршрута:', {
      path: req.path,
      hasAuthHeader: !!authHeader,
      hasQueryToken: !!req.query.token,
      hasToken: !!token
    });
  }

  if (!token) {
    console.log('Токен не найден для маршрута:', req.path);
    return res.status(401).json({ message: 'Требуется токен авторизации' });
  }

  if (revokedTokens.has(token)) {
    return res.status(401).json({ message: 'Токен отозван (revoked)' });
  }

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    req.user = user;

    if (req.path.includes('steam') || req.path.includes('link-steam')) {
      console.log('Пользователь аутентифицирован для Steam:', {
        userId: user.id,
        username: user.username,
        authProvider: user.auth_provider
      });
    }

    next();
  } catch (err) {
    console.log('Ошибка валидации токена для маршрута:', req.path, err.message);
    return res.status(401).json({ message: 'Невалидный или просроченный токен' });
  }
};

// Экспортируем middleware как функцию по умолчанию и revokedTokens как свойство
module.exports = authMiddleware;
module.exports.revokedTokens = revokedTokens;
