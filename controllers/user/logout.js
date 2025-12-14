const { revokedTokens } = require('../../middleware/auth');
const { logger } = require('../../middleware/logger');

function logout(req, res) {
  try {
    // Получаем токен из cookie или Authorization header
    let token = null;

    if (req.cookies && req.cookies.auth_token) {
      token = req.cookies.auth_token;
    } else {
      const authHeader = req.headers['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
    }

    // Добавляем токен в black list для отзыва
    if (token) {
      revokedTokens.add(token);
      logger.info('[LOGOUT] Token added to revoked list');
    }

    // Очищаем httpOnly cookie с токеном
    res.clearCookie('auth_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      path: '/'
    });

    logger.info('[LOGOUT] User logged out successfully');
    return res.json({ success: true, message: 'Успешный выход из системы' });
  } catch (error) {
    logger.error('[LOGOUT] Error during logout:', error);
    return res.status(500).json({ message: 'Ошибка при выходе из системы' });
  }
}

module.exports = {
  logout
};
