const { revokedTokens } = require('../../middleware/auth');
const { logger } = require('../../middleware/logger');

function logout(req, res) {
  try {
    // Получаем токены из разных источников
    const authHeader = req.headers['authorization'];
    const accessTokenFromCookie = req.cookies.accessToken;
    const refreshTokenFromCookie = req.cookies.refreshToken;

    // Добавляем access token в black list
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      revokedTokens.add(token);
      logger.info('[LOGOUT] Access token from header revoked');
    }

    // Добавляем access token из cookie в black list
    if (accessTokenFromCookie) {
      revokedTokens.add(accessTokenFromCookie);
      logger.info('[LOGOUT] Access token from cookie revoked');
    }

    // Добавляем refresh token в black list
    if (refreshTokenFromCookie) {
      revokedTokens.add(refreshTokenFromCookie);
      logger.info('[LOGOUT] Refresh token revoked');
    }

    // Очищаем cookies
    res.clearCookie('accessToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    });

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    });

    logger.info('[LOGOUT] User logged out successfully');
    return res.json({ success: true, message: 'Успешный выход, токены отозваны и cookies очищены' });
  } catch (error) {
    logger.error('[LOGOUT] Error during logout:', error);
    return res.status(500).json({ success: false, message: 'Ошибка при выходе' });
  }
}

module.exports = {
  logout
};
