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

    // Получаем все предметы и кейсы из UserInventory с пагинацией
    const { count, rows: inventoryItems } = await db.UserInventory.findAndCountAll({
      where: {
        user_id: userId,
        status: 'inventory'
      },
      include: [
        {
          model: db.Item,
          as: 'item',
          required: false // Для кейсов item может быть null
        },
        {
          model: db.CaseTemplate,
          as: 'case_template',
          required: false // Для обычных предметов case_template будет null
        },
        {
          model: db.Withdrawal,
          as: 'withdrawal',
          required: false // LEFT JOIN для проверки статуса withdrawal
        }
      ],
      order: [['acquisition_date', 'DESC']],
      limit,
      offset
    });

    // Разделяем предметы и кейсы
    const items = inventoryItems.filter(item => item.item_type === 'item');
    const cases = inventoryItems.filter(item => item.item_type === 'case');

    // Фильтруем предметы: показываем только те, что без withdrawal или с неудачными withdrawal
    const filteredItems = items.filter(item => {
      return !item.withdrawal_id ||
             (item.withdrawal && ['failed', 'cancelled'].includes(item.withdrawal.status));
    });

    // Фильтруем просроченные кейсы
    const validCases = cases.filter(caseItem => {
      return !caseItem.expires_at || caseItem.expires_at > new Date();
    });

    logger.info(`Получен инвентарь для пользователя ${userId}, страница ${page}`);
    logger.info(`Всего предметов в inventory: ${items.length}`);
    logger.info(`После фильтрации: ${filteredItems.length}`);
    logger.info(`Кейсов в инвентаре: ${validCases.length}`);

    // Отладочная информация о предметах с withdrawal
    items.forEach(item => {
      if (item.withdrawal_id) {
        logger.info(`Предмет ${item.item?.name || 'N/A'} имеет withdrawal_id: ${item.withdrawal_id}, статус withdrawal: ${item.withdrawal?.status || 'unknown'}`);
      }
    });

    // Формируем ответ для предметов
    const formattedItems = filteredItems.map(item => ({
      id: item.id,
      item_type: item.item_type,
      item: item.item,
      acquisition_date: item.acquisition_date,
      source: item.source,
      status: item.status,
      case_id: item.case_id,
      withdrawal: item.withdrawal
    }));

    // Формируем ответ для кейсов
    const formattedCases = validCases.map(caseItem => ({
      id: caseItem.id,
      item_type: caseItem.item_type,
      case_template: caseItem.case_template,
      acquisition_date: caseItem.acquisition_date,
      expires_at: caseItem.expires_at,
      source: caseItem.source,
      status: caseItem.status
    }));

    return res.json({
      items: formattedItems,
      cases: formattedCases,
      totalItems: filteredItems.length,
      totalCases: validCases.length,
      currentPage: page,
      totalPages: Math.ceil(inventoryItems.length / limit)
    });
  } catch (error) {
    logger.error('Ошибка получения инвентаря:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  getInventory
};
