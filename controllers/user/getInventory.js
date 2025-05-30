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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    // Получаем предметы из UserInventory с пагинацией
    const { count, rows: items } = await db.UserInventory.findAndCountAll({
      where: { user_id: userId },
      include: [{ model: db.Item, as: 'item' }],
      limit,
      offset
    });

    // Получаем кейсы пользователя без пагинации (можно добавить, если нужно)
    const cases = await db.Case.findAll({
      where: { user_id: userId, is_opened: false }
    });

    logger.info(`Получен инвентарь для пользователя ${userId}, страница ${page}`);

    return res.json({
      items,
      cases,
      totalItems: count,
      currentPage: page,
      totalPages: Math.ceil(count / limit)
    });
  } catch (error) {
    logger.error('Ошибка получения инвентаря:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  getInventory
};
