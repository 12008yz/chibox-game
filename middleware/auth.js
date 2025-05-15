const jwt = require('jsonwebtoken');

// Список отозванных токенов (RAM black list)
const revokedTokens = new Set();
// Для продакшена — использовать Redis или другую БД
// Экспортируем функцию (чтобы добавить токены извне, напр. при logout)
module.exports.revokedTokens = revokedTokens;

module.exports = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Требуется токен авторизации' });
  }
  const token = authHeader.split(' ')[1];

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
