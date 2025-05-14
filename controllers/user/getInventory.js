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

async function getInventory(req, res) {
  try {
    const userId = req.user.id;

    // Получаем предметы из UserInventory
    const items = await db.UserInventory.findAll({
      where: { user_id: userId },
      include: [{ model: db.Item, as: 'item' }]
    });

    // Получаем кейсы пользователя
    const cases = await db.Case.findAll({
      where: { user_id: userId, is_opened: false }
    });

    logger.info(`Получен инвентарь для пользователя ${userId}`);

    return res.json({ items, cases });
  } catch (error) {
    logger.error('Ошибка получения инвентаря:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  getInventory
};
