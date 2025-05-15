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

async function adminUpdateUser(req, res) {
  try {
    const adminUser = req.user;
    // Проверка прав администратора — только admin или superadmin имеют доступ
    if (!adminUser || (adminUser.role !== 'admin' && adminUser.role !== 'superadmin')) {
      return res.status(403).json({ message: 'Доступ запрещён' });
    }

    const userId = req.params.id;
    const updateData = req.body;

    if (updateData.password) {
      delete updateData.password;
    }

    const [updatedRowsCount, [updatedUser]] = await db.User.update(updateData, {
      where: { id: userId },
      returning: true,
      individualHooks: true
    });

    if (updatedRowsCount === 0) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    return res.json({ message: 'Пользователь успешно обновлён', user: updatedUser });
  } catch (error) {
    logger.error('Ошибка обновления пользователя админом:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  adminUpdateUser
};
