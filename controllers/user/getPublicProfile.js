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

async function getPublicProfile(req, res) {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 24;
    const offset = (page - 1) * limit;

    // Получаем пользователя
    const user = await db.User.findByPk(id, {
      attributes: [
        'id', 'username', 'createdAt', 'level', 'subscription_tier',
        'total_cases_opened', 'steam_avatar_url', 'steam_profile',
        'achievements_bonus_percentage', 'subscription_bonus_percentage',
        'level_bonus_percentage', 'total_drop_bonus_percentage',
        'best_item_value', 'total_items_value', 'daily_streak', 'max_daily_streak'
      ]
    });

    // Получаем инвентарь с пагинацией
    const { count: inventoryCount, rows: inventory } = await db.UserInventory.findAndCountAll({
      where: {
        user_id: id,
        status: 'inventory'
      },
      attributes: [
        'id', 'item_type', 'item_id', 'acquisition_date', 'source',
        'status', 'case_id', 'case_template_id', 'transaction_date', 'expires_at'
      ],
      include: [
        {
          model: db.Item,
          as: 'item',
          attributes: ['id', 'name', 'rarity', 'price', 'weapon_type', 'skin_name', 'image_url']
        },
        {
          model: db.Case,
          as: 'case',
          required: false, // LEFT JOIN для получения template_id из кейса
          attributes: ['id', 'template_id']
        }
      ],
      order: [['acquisition_date', 'DESC']],
      limit,
      offset
    });

    // Получаем ВСЕ предметы пользователя только для вычисления лучшего оружия и общей стоимости
    const allUserItems = await db.UserInventory.findAll({
      where: { user_id: id },
      include: [
        {
          model: db.Item,
          as: 'item',
          attributes: ['id', 'name', 'rarity', 'price', 'weapon_type', 'skin_name', 'image_url']
        }
      ]
    });

    // Получаем предметы из кейсов с пагинацией
    const { count: caseItemsCount, rows: allCaseItems } = await db.UserInventory.findAndCountAll({
      where: {
        user_id: id,
        source: 'case'
      },
      attributes: [
        'id', 'item_type', 'item_id', 'acquisition_date', 'source',
        'status', 'case_id', 'case_template_id', 'transaction_date', 'expires_at'
      ],
      include: [
        {
          model: db.Item,
          as: 'item',
          attributes: ['id', 'name', 'rarity', 'price', 'weapon_type', 'skin_name', 'image_url']
        },
        {
          model: db.Case,
          as: 'case',
          required: false, // LEFT JOIN для получения template_id из кейса
          attributes: ['id', 'template_id']
        }
      ],
      order: [['acquisition_date', 'DESC']],
      limit,
      offset
    });

    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    // Получаем достижения пользователя
    const userAchievements = await db.UserAchievement.findAll({
      where: {
        user_id: id,
        is_completed: true
      },
      include: [
        {
          model: db.Achievement,
          as: 'achievement',
          attributes: ['id', 'name', 'description', 'icon_url', 'bonus_percentage', 'category']
        }
      ],
      order: [['completion_date', 'DESC']]
    });

    // Используем поле total_cases_opened из таблицы Users (как в личном профиле)
    // Это значение обновляется при каждом открытии кейса и является источником истины
    const totalCasesOpened = user.total_cases_opened || 0;

    // Фильтруем инвентарь, удаляя записи с отсутствующими предметами
    const filteredInventory = inventory
      .filter(inventoryItem => inventoryItem.item !== null)
      .map(item => ({
        id: item.id,
        item_type: item.item_type,
        item: item.item,
        acquisition_date: item.acquisition_date,
        source: item.source,
        status: item.status,
        case_id: item.case_id,
        // Для предметов из кейсов получаем case_template_id через связь case.template_id
        case_template_id: item.case_template_id || (item.case ? item.case.template_id : null),
        item_id: item.item_id,
        transaction_date: item.transaction_date,
        expires_at: item.expires_at
      }));

    // Фильтруем предметы из кейсов, удаляя записи с отсутствующими предметами
    const filteredCaseItems = allCaseItems
      .filter(inventoryItem => inventoryItem.item !== null)
      .map(item => ({
        id: item.id,
        item_type: item.item_type,
        item: item.item,
        acquisition_date: item.acquisition_date,
        source: item.source,
        status: item.status,
        case_id: item.case_id,
        // Для предметов из кейсов получаем case_template_id через связь case.template_id
        case_template_id: item.case_template_id || (item.case ? item.case.template_id : null),
        item_id: item.item_id,
        transaction_date: item.transaction_date,
        expires_at: item.expires_at
      }));

    // Определяем лучшее оружие за ВСЁ ВРЕМЯ на основе сохраненного значения best_item_value
    let bestWeapon = null;
    if (user.best_item_value && allUserItems && allUserItems.length > 0) {
      // Ищем предмет с ценой равной или максимально близкой к best_item_value
      const validItems = allUserItems.filter(inventoryItem => inventoryItem.item !== null);

      if (validItems.length > 0) {
        const bestItemValue = parseFloat(user.best_item_value);

        // Ищем предмет с точной ценой
        let foundItem = validItems.find(inventoryItem => {
          const itemPrice = parseFloat(inventoryItem.item.price);
          return Math.abs(itemPrice - bestItemValue) < 0.01; // Допускаем погрешность в 0.01
        });

        if (foundItem) {
          // Если найден предмет с точной ценой, используем его
          bestWeapon = foundItem.item.toJSON();
        } else {
          // Если предмет с рекордной ценой не найден (продан/обменен),
          // создаем "виртуальный" предмет для отображения рекорда
          const mostExpensive = validItems.reduce((prev, current) => {
            const prevPrice = parseFloat(prev.item.price) || 0;
            const currentPrice = parseFloat(current.item.price) || 0;
            return (prevPrice > currentPrice) ? prev : current;
          });

          // Создаем виртуальный предмет с рекордной ценой
          bestWeapon = {
            ...mostExpensive.item.toJSON(),
            price: bestItemValue.toString(), // ВАЖНО: Показываем рекордную цену!
            isRecord: true // Флаг для фронтенда
          };
        }
      }
    } else if (user.best_item_value && (!allUserItems || allUserItems.length === 0)) {
      // Если есть рекорд, но нет предметов в базе, создаем виртуальный предмет
      bestWeapon = {
        id: 'virtual',
        name: 'Рекордный предмет',
        rarity: 'covert',
        price: user.best_item_value.toString(),
        weapon_type: 'Неизвестно',
        skin_name: '',
        image_url: 'https://community.fastly.steamstatic.com/economy/image/6TMcQ7eX6E0EZl2byXi7vaVtMyCbg7JT9Nj26yLB0uiTHKECVqCQJYPQOiKc1A9hdeGdqRmPbEbD8Q_VfQ/256fx256f',
        isRecord: true
      };
    } else if (allUserItems && allUserItems.length > 0) {
      // Если best_item_value не установлено, находим самый дорогой предмет
      const validItems = allUserItems.filter(inventoryItem => inventoryItem.item !== null);

      if (validItems.length > 0) {
        const foundItem = validItems.reduce((prev, current) => {
          const prevPrice = parseFloat(prev.item.price) || 0;
          const currentPrice = parseFloat(current.item.price) || 0;
          return (prevPrice > currentPrice) ? prev : current;
        });
        bestWeapon = foundItem.item.toJSON();
      }
    }

    // Вычисляем общую стоимость всех когда-либо полученных предметов
    let totalItemsValue = 0;
    if (allUserItems && allUserItems.length > 0) {
      totalItemsValue = allUserItems.reduce((total, inventoryItem) => {
        if (inventoryItem.item) {
          return total + (parseFloat(inventoryItem.item.price) || 0);
        }
        return total;
      }, 0);
    }

    // Получаем актуальные значения ежедневной серии
    // Если значения в базе null или 0, используем значения по умолчанию
    const dailyStreak = user.daily_streak || 0;
    const maxDailyStreak = user.max_daily_streak || 0;

    // Формируем статус подписки
    const getSubscriptionStatus = (tier) => {
      switch (tier) {
        case 1: return 'Статус';
        case 2: return 'Статус+';
        case 3: return 'Статус++';
        default: return 'Без статуса';
      }
    };

    // Формируем данные о бонусах к дропу
    const dropBonuses = {
      achievements: user.achievements_bonus_percentage || 0,
      subscription: user.subscription_bonus_percentage || 0,
      level: user.level_bonus_percentage || 0,
      total: user.total_drop_bonus_percentage || 0
    };

    return res.json({
      user: {
        id: user.id,
        username: user.username,
        createdAt: user.createdAt,
        level: user.level,
        subscriptionTier: user.subscription_tier,
        subscriptionStatus: getSubscriptionStatus(user.subscription_tier),
        totalCasesOpened: totalCasesOpened,
        inventory: filteredInventory,
        inventoryPagination: {
          total: inventoryCount,
          page: page,
          limit: limit,
          totalPages: Math.ceil(inventoryCount / limit),
          hasMore: page < Math.ceil(inventoryCount / limit)
        },
        caseItems: filteredCaseItems, // Предметы из кейсов с пагинацией
        caseItemsPagination: {
          total: caseItemsCount,
          page: page,
          limit: limit,
          totalPages: Math.ceil(caseItemsCount / limit),
          hasMore: page < Math.ceil(caseItemsCount / limit)
        },
        bestWeapon: bestWeapon,
        bestItemValue: user.best_item_value || 0, // Всегда используем сохранённое значение из базы
        totalItemsValue: totalItemsValue, // Используем вычисленное значение
        dailyStreak: dailyStreak, // Используем актуальное значение
        maxDailyStreak: maxDailyStreak, // Используем актуальное значение
        steam_avatar: user.steam_avatar_url,
        steam_profile: user.steam_profile,
        achievements: userAchievements.map(ua => ({
          id: ua.achievement.id,
          name: ua.achievement.name,
          description: ua.achievement.description,
          icon_url: ua.achievement.icon_url,
          bonus_percentage: ua.achievement.bonus_percentage,
          category: ua.achievement.category,
          completion_date: ua.completion_date
        })),
        dropBonuses: dropBonuses
      }
    });
  } catch (error) {
    logger.error('Ошибка получения публичного профиля:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  getPublicProfile
};
