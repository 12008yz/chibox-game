const jwt = require('jsonwebtoken');
const db = require('../../models');
const { logger } = require('../../middleware/logger');
const { revokedTokens } = require('../../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters long');
}
if (!JWT_REFRESH_SECRET || JWT_REFRESH_SECRET.length < 32) {
  throw new Error('JWT_REFRESH_SECRET must be at least 32 characters long');
}

function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

async function refreshToken(req, res) {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      logger.warn('[REFRESH] No refresh token provided');
      return res.status(401).json({
        success: false,
        message: 'Refresh token отсутствует'
      });
    }

    // Проверяем, не отозван ли токен
    if (revokedTokens.has(refreshToken)) {
      logger.warn('[REFRESH] Revoked refresh token used');
      return res.status(401).json({
        success: false,
        message: 'Refresh token отозван'
      });
    }

    // Верифицируем refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    } catch (error) {
      logger.warn('[REFRESH] Invalid refresh token:', error.message);
      return res.status(401).json({
        success: false,
        message: 'Недействительный refresh token'
      });
    }

    // Проверяем тип токена
    if (decoded.type !== 'refresh') {
      logger.warn('[REFRESH] Wrong token type');
      return res.status(401).json({
        success: false,
        message: 'Неверный тип токена'
      });
    }

    // Получаем пользователя
    const user = await db.User.findByPk(decoded.id);
    if (!user) {
      logger.warn('[REFRESH] User not found:', decoded.id);
      return res.status(401).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }

    // Генерируем новый access token
    const newAccessToken = generateToken(user);

    logger.info('[REFRESH] New access token generated for user:', user.id);

    return res.json({
      success: true,
      token: newAccessToken,
      message: 'Токен успешно обновлен'
    });

  } catch (error) {
    logger.error('[REFRESH] Error during token refresh:', error);
    return res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
}

module.exports = {
  refreshToken
};
