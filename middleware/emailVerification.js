const db = require('../models');

/**
 * Middleware для проверки подтверждения email
 * Требует, чтобы пользователь подтвердил свой email перед доступом к защищенным эндпоинтам
 */
const requireEmailVerification = async (req, res, next) => {
  try {
    // Получаем пользователя из базы данных
    const user = await db.User.findByPk(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: 'Пользователь не найден'
      });
    }

    // Проверяем, подтвержден ли email
    if (!user.email_verified) {
      return res.status(403).json({
        message: 'Требуется подтверждение email. Проверьте почту и перейдите по ссылке подтверждения.',
        code: 'EMAIL_NOT_VERIFIED'
      });
    }

    // Email подтвержден, продолжаем
    next();
  } catch (error) {
    console.error('Ошибка в middleware email verification:', error);
    return res.status(500).json({
      message: 'Внутренняя ошибка сервера'
    });
  }
};

module.exports = {
  requireEmailVerification
};
