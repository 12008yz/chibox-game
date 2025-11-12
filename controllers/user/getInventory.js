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
    const status = req.query.status;

    logger.info('🔍 [GET INVENTORY] Начало получения инвентаря:', {
      userId,
      page,
      limit,
      offset,
      status: status || 'all'
    });

    // Формируем условие поиска
    const whereCondition = {
      user_id: userId
    };

    // Добавляем фильтр по статусу, если он указан
    if (status) {
      whereCondition.status = status;
    }

    // Получаем предметы и кейсы из UserInventory с пагинацией
    const { count, rows: inventoryItems } = await db.UserInventory.findAndCountAll({
      where: whereCondition,
      include: [
        {
          model: db.Item,
          as: 'item',
          required: false, // Для кейсов item может быть null
          attributes: [
            'id', 'name', 'description', 'image_url', 'price', 'rarity',
            'weapon_type', 'skin_name', 'steam_market_hash_name', 'steam_market_url',
            'is_available', 'float_value', 'exterior', 'quality', 'stickers',
            'origin', 'in_stock', 'is_tradable', 'created_at', 'updated_at'
          ]
        },
        {
          model: db.CaseTemplate,
          as: 'case_template',
          required: false // Для обычных предметов case_template будет null
        },
        {
          model: db.Case,
          as: 'case',
          required: false, // LEFT JOIN для получения template_id из кейса
          attributes: ['id', 'template_id']
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

    logger.info(`Получен инвентарь для пользователя ${userId}, страница ${page}, статус: ${status || 'все'}`);
    logger.info(`Всего предметов: ${items.length}`);
    logger.info(`Всего кейсов: ${cases.length}`);

    // Отладочная информация о предметах с withdrawal
    items.forEach(item => {
      if (item.withdrawal_id) {
        logger.info(`Предмет ${item.item?.name || 'N/A'} имеет withdrawal_id: ${item.withdrawal_id}, статус withdrawal: ${item.withdrawal?.status || 'unknown'}`);
      }
    });

    // Формируем ответ для ВСЕХ предметов (без фильтрации)
    const formattedItems = items.map(item => {
      logger.info(`🔍 [GET INVENTORY] Форматирование предмета:`, {
        item_id: item.id,
        item_name: item.item?.name,
        status: item.status,
        withdrawal_id: item.withdrawal_id,
        has_withdrawal_object: !!item.withdrawal,
        withdrawal_status: item.withdrawal?.status
      });

      return {
        id: item.id,
        item_type: item.item_type,
        item: item.item,
        acquisition_date: item.acquisition_date,
        source: item.source,
        status: item.status,
        case_id: item.case_id,
        withdrawal_id: item.withdrawal_id, // ВАЖНО: добавляем withdrawal_id
        withdrawal: item.withdrawal,
        // Для предметов из кейсов получаем case_template_id через связь case.template_id
        case_template_id: item.case_template_id || (item.case ? item.case.template_id : null),
        item_id: item.item_id,
        transaction_date: item.transaction_date,
        expires_at: item.expires_at
      };
    });

    // Формируем ответ для ВСЕХ кейсов (без фильтрации по expiry)
    const formattedCases = cases.map(caseItem => ({
      id: caseItem.id,
      item_type: caseItem.item_type,
      case_template: caseItem.case_template,
      acquisition_date: caseItem.acquisition_date,
      expires_at: caseItem.expires_at,
      source: caseItem.source,
      status: caseItem.status,
      case_template_id: caseItem.case_template_id,
      item_id: caseItem.item_id,
      transaction_date: caseItem.transaction_date
    }));

    // Подсчитываем только активные предметы для совместимости
    const activeItems = items.filter(item =>
      item.status === 'inventory' && (
        !item.withdrawal_id ||
        (item.withdrawal && ['failed', 'cancelled'].includes(item.withdrawal.status))
      )
    );
    const activeCases = cases.filter(caseItem =>
      caseItem.status === 'inventory' && (
        !caseItem.expires_at || caseItem.expires_at > new Date()
      )
    );

    return res.json({
      success: true,
      data: {
        items: formattedItems,
        cases: formattedCases,
        totalItems: activeItems.length, // Активные предметы для совместимости
        totalCases: activeCases.length, // Активные кейсы для совместимости
        allItems: formattedItems.length, // Общее количество всех предметов
        allCases: formattedCases.length, // Общее количество всех кейсов
        pagination: {
          page: page,
          limit: limit,
          total: count,
          totalPages: Math.ceil(count / limit),
          hasMore: page < Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Ошибка получения инвентаря:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  getInventory
};
