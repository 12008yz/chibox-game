const { User } = require('../../models');
const { logger } = require('../../utils/logger');

/**
 * Получить статус игры Safe Cracker
 */
const getSafeCrackerStatus = async (req, res) => {
  try {
    const userId = req.user.id;

    // Получаем информацию о пользователе
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }

    const response = {
      success: true,
      remaining_attempts: user.game_attempts || 0,
      subscription_days: user.subscription_days_left || 0
    };

    res.json(response);

  } catch (error) {
    logger.error('Ошибка при получении статуса Safe Cracker:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
};

module.exports = getSafeCrackerStatus;
