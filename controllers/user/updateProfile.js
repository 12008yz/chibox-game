const argon2 = require('argon2');
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

    const user = await db.User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    if (username && username.trim() !== user.username) {
      const usernameExists = await db.User.findOne({
        where: { username: username.trim(), id: { [db.Sequelize.Op.ne]: userId } }
      });
      if (usernameExists) {
        return res.status(409).json({ message: 'Такой username уже занят' });
      }
      user.username = username.trim();
    }

    if (password) {
      if (password.length < 8
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
      user.steam_trade_url = steam_trade_url.trim();
    }

    await user.save();

    logger.info(`Профиль пользователя обновлен: ${user.email}`);

    return res.json({
      message: 'Профиль успешно обновлен',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        steam_trade_url: user.steam_trade_url
      }
    });
  } catch (error) {
    logger.error('Ошибка обновления профиля:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  updateProfile
};
