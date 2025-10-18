const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
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

async function updateProfile(req, res) {
  try {
    const userId = req.user.id;
    const { username, password, steam_trade_url } = req.body;

    // Валидация типов для защиты от Type Confusion
    if (username !== undefined && typeof username !== 'string') {
      return res.status(400).json({ message: 'Username должен быть строкой' });
    }

    if (password !== undefined && typeof password !== 'string') {
      return res.status(400).json({ message: 'Пароль должен быть строкой' });
    }

    if (steam_trade_url !== undefined && typeof steam_trade_url !== 'string') {
      return res.status(400).json({ message: 'Steam trade URL должен быть строкой' });
    }

    // Дополнительная валидация длины
    if (username && username.length > 50) {
      return res.status(400).json({ message: 'Username слишком длинный' });
    }

    if (password && password.length > 128) {
      return res.status(400).json({ message: 'Пароль слишком длинный' });
    }

    if (steam_trade_url && steam_trade_url.length > 500) {
      return res.status(400).json({ message: 'Steam trade URL слишком длинный' });
    }

    const user = await db.User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    if (username && username.trim() !== user.username) {
      const trimmedUsername = username.trim();
      const usernameExists = await db.User.findOne({
        where: { username: trimmedUsername, id: { [db.Sequelize.Op.ne]: userId } }
      });
      if (usernameExists) {
        return res.status(409).json({ message: 'Такой username уже занят' });
      }
      user.username = trimmedUsername;
    }

    if (password) {
      // Проверяем, что password это строка (уже проверили выше, но для уверенности)
      if (typeof password !== 'string' || password.length < 8
          || !/[A-Z]/.test(password)
          || !/[a-z]/.test(password)
          || !/[0-9]/.test(password)
          || !/[^A-Za-z0-9]/.test(password)
      ) {
        return res.status(400).json({ message: 'Пароль должен быть не менее 8 символов и содержать строчные, заглавные буквы, цифру и спецсимвол.' });
      }
      user.password = await argon2.hash(password);
    }

    if (steam_trade_url) {
      const trimmedUrl = steam_trade_url.trim();
      // Дополнительная валидация URL
      if (trimmedUrl && !trimmedUrl.includes('steamcommunity.com')) {
        return res.status(400).json({ message: 'Неверный формат Steam trade URL' });
      }
      user.steam_trade_url = trimmedUrl;
    }

    await user.save();

    // Создание уведомления при изменении данных профиля
    await db.Notification.create({
      user_id: userId,
      title: 'Обновление профиля',
      message: 'Ваши данные профиля были изменены.',
      type: 'success',
      category: 'general',
      importance: 5
    });

    logger.info(`Профиль пользователя обновлен: ${user.email}`);

    // Перезагружаем пользователя с актуальными данными
    const updatedUser = await db.User.findByPk(userId, {
      attributes: { exclude: ['password'] }
    });

    // Генерируем новый JWT токен с обновленными данными
    const newToken = jwt.sign(
      {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        auth_provider: updatedUser.auth_provider,
        role: updatedUser.role,
        steam_id: updatedUser.steam_id
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    return res.json({
      message: 'Профиль успешно обновлен',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        username: updatedUser.username,
        steam_trade_url: updatedUser.steam_trade_url,
        steam_id: updatedUser.steam_id,
        steam_avatar: updatedUser.steam_avatar_url,
        steam_profile: updatedUser.steam_profile,
        steam_profile_url: updatedUser.steam_profile_url
      },
      token: newToken // Возвращаем новый токен
    });
  } catch (error) {
    logger.error('Ошибка обновления профиля:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  updateProfile
};
