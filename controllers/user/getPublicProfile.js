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

    // Получаем пользователя с инвентарем
    const user = await db.User.findByPk(id, {
      attributes: [
        'id', 'username', 'createdAt', 'level', 'subscription_tier',
        'total_cases_opened', 'steam_avatar', 'steam_profile',
        'achievements_bonus_percentage', 'subscription_bonus_percentage',
        'level_bonus_percentage', 'total_drop_bonus_percentage',
        'best_item_value', 'total_items_value', 'daily_streak', 'max_daily_streak'
      ],
      include: [
        {
          model: db.UserInventory,
          as: 'inventory',
          where: { status: 'inventory' },
          required: false,
          include: [
            {
              model: db.Item,
              as: 'item',
              attributes: ['id', 'name', 'rarity', 'price', 'weapon_type', 'skin_name', 'image_url']
            }
          ]
        }
      ]
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

    // Подсчитываем общее количество открытых кейсов в реальном времени
    const totalCasesOpened = await db.Case.count({
      where: {
        user_id: id,
        is_opened: true
      }
    });

    // Фильтруем инвентарь, удаляя записи с отсутствующими предметами и определяем лучшее оружие
    let bestWeapon = null;
    let filteredInventory = [];

    if (user.inventory && user.inventory.length > 0) {
      // Фильтруем только предметы, которые действительно существуют
      filteredInventory = user.inventory.filter(inventoryItem => inventoryItem.item !== null);

      if (filteredInventory.length > 0) {
        bestWeapon = filteredInventory.reduce((prev, current) => {
          const prevPrice = parseFloat(prev.item.price) || 0;
          const currentPrice = parseFloat(current.item.price) || 0;
          return (prevPrice > currentPrice) ? prev : current;
        }).item;
      }
    }

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
        bestWeapon: bestWeapon,
        bestItemValue: user.best_item_value,
        totalItemsValue: user.total_items_value,
        dailyStreak: user.daily_streak,
        maxDailyStreak: user.max_daily_streak,
        steam_avatar: user.steam_avatar,
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
