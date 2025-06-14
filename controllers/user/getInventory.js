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
    // Показываем только предметы в статусе 'inventory' без активных заявок на вывод
    const { count, rows: items } = await db.UserInventory.findAndCountAll({
      where: {
        user_id: userId,
        status: 'inventory'
      },
      include: [
        { model: db.Item, as: 'item' },
        {
          model: db.Withdrawal,
          as: 'withdrawal',
          required: false // LEFT JOIN для проверки статуса withdrawal
        }
      ],
      limit,
      offset
    });

    // Фильтруем предметы: показываем только те, что без withdrawal или с неудачными withdrawal
    const filteredItems = items.filter(item => {
      return !item.withdrawal_id ||
             (item.withdrawal && ['failed', 'cancelled'].includes(item.withdrawal.status));
    });

    // Получаем кейсы пользователя без пагинации (можно добавить, если нужно)
    const cases = await db.Case.findAll({
      where: { user_id: userId, is_opened: false }
    });

    logger.info(`Получен инвентарь для пользователя ${userId}, страница ${page}`);
    logger.info(`Всего предметов в inventory: ${items.length}`);
    logger.info(`После фильтрации: ${filteredItems.length}`);

    // Отладочная информация о предметах с withdrawal
    items.forEach(item => {
      if (item.withdrawal_id) {
        logger.info(`Предмет ${item.item.name} имеет withdrawal_id: ${item.withdrawal_id}, статус withdrawal: ${item.withdrawal?.status || 'unknown'}`);
      }
    });

    return res.json({
      items: items, // ВРЕМЕННО: возвращаем все предметы для диагностики
      cases,
      totalItems: items.length,
      currentPage: page,
      totalPages: Math.ceil(items.length / limit)
    });
  } catch (error) {
    logger.error('Ошибка получения инвентаря:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  getInventory
};
