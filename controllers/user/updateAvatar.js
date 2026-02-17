const db = require('../../models');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

async function updateAvatar(req, res) {
  try {
    const userId = req.user.id;
    const { avatar_url } = req.body;

    const user = await db.User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }

    // Сброс аватара: пустая строка или null — использовать аватар из Steam
    if (avatar_url === null || avatar_url === '' || (typeof avatar_url === 'string' && avatar_url.trim() === '')) {
      await user.update({ avatar_url: null });
      logger.info(`Пользователь ${userId} сбросил аватар на Steam`);
      return res.status(200).json({
        success: true,
        message: 'Аватар сброшен, используется аватар из Steam',
        data: { avatar_url: null, fullUrl: null }
      });
    }

    if (typeof avatar_url !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'avatar_url должен быть строкой'
      });
    }

    if (!avatar_url.startsWith('/public/avatars/')) {
      return res.status(400).json({
        success: false,
        message: 'Некорректный путь к аватару. Должен начинаться с /public/avatars/'
      });
    }

    if (avatar_url.length > 500) {
      return res.status(400).json({
        success: false,
        message: 'URL аватара слишком длинный'
      });
    }

    await user.update({ avatar_url });
    logger.info(`Пользователь ${userId} обновил аватар на ${avatar_url}`);

    return res.status(200).json({
      success: true,
      message: 'Аватар успешно обновлен',
      data: {
        avatar_url,
        fullUrl: `${process.env.BASE_URL || 'https://chibox-game.ru'}${avatar_url}`
      }
    });
  } catch (error) {
    logger.error('❌ Ошибка при обновлении аватара:', error);
    return res.status(500).json({
      success: false,
      message: 'Не удалось обновить аватар',
      error: error.message
    });
  }
}

module.exports = updateAvatar;
