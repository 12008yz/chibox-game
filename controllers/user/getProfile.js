const db = require('../../models');
const { logger } = require('../../middleware/logger');
const cache = require('../../middleware/cache');

async function getProfile(req, res) {
  // Защита от IDOR: только если указан конкретный ID в параметрах
  const targetUserId = req.query.id || req.params.id;
  if (targetUserId && (!req.user || String(req.user.id) !== String(targetUserId))) {
    return res.status(403).json({ message: 'Доступ к чужому профилю запрещён' });
  }

  // Если ID не указан, возвращаем профиль текущего пользователя
  if (!req.user) {
    return res.status(401).json({ message: 'Пользователь не авторизован' });
  }

  try {
    const userId = req.user.id;

    // Получаем ВСЕ предметы пользователя (включая проданные, обмененные и т.д.) для вычисления общей стоимости
    const allUserItems = await db.UserInventory.findAll({
      where: { user_id: userId },
      include: [
        {
          model: db.Item,
          as: 'item',
          attributes: ['id', 'name', 'rarity', 'price', 'weapon_type', 'skin_name', 'image_url']
        }
      ]
    });

    const user = await db.User.findByPk(userId, {
      attributes: [
        'id', 'email', 'username', 'createdAt', 'updatedAt', 'role', 'is_email_verified',
        'level', 'xp', 'xp_to_next_level', 'level_bonus_percentage', 'total_xp_earned',
        'subscription_tier', 'subscription_purchase_date', 'subscription_expiry_date', 'subscription_days_left',
        'cases_available', 'cases_opened_today', 'total_cases_opened', 'next_case_available_time', 'max_daily_cases',
        'next_bonus_available_time', 'last_bonus_date', 'lifetime_bonuses_claimed', 'successful_bonus_claims',
        'drop_rate_modifier', 'achievements_bonus_percentage', 'subscription_bonus_percentage', 'total_drop_bonus_percentage',
        'balance',
        'steam_id', 'steam_profile', 'steam_avatar', 'steam_profile_url', 'steam_trade_url', 'auth_provider',
        'best_item_value' // Добавляем поле лучшего предмета
      ],
      include: [
        {
          model: db.UserAchievement,
          as: 'achievements',
          include: [{
            model: db.Achievement,
            as: 'achievement',
            attributes: ['id', 'name', 'description']
          }],
          limit: 20
        },
        {
          model: db.UserInventory,
          as: 'inventory',
          include: [{
            model: db.Item,
            as: 'item',
            attributes: ['id', 'name', 'rarity', 'price', 'image_url']
          }],
          limit: 200, // Увеличиваем лимит для отображения большего количества предметов
          order: [['created_at', 'DESC']]
        }
      ]
    });

    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }


    const validItems = allUserItems.filter(inventoryItem => inventoryItem.item !== null);

    if (validItems.length > 0) {
      const topItems = validItems
        .sort((a, b) => parseFloat(b.item.price) - parseFloat(a.item.price))
        .slice(0, 5);
      topItems.forEach((item, index) => {
        console.log(`${index + 1}. ${item.item.name} - ${item.item.price} КР (${item.item.rarity})`);
      });
    }

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

    // Добавляем вычисленные поля к объекту пользователя
    const userWithTotalValue = {
      ...user.toJSON(),
      total_items_value: totalItemsValue,
      bestWeapon: bestWeapon,
      bestItemValue: user.best_item_value || 0
    };

    return res.json({
      success: true,
      user: userWithTotalValue
    });

  } catch (error) {
    logger.error('Ошибка получения профиля:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}
// // Оборачиваем getProfile в middleware кэширования
// const cachedGetProfile = [cache(300), getProfile];

// module.exports = {
//   getProfile: cachedGetProfile
// };
// Убираем кэширование для getProfile, чтобы Steam данные обновлялись сразу
module.exports = {
  getProfile: getProfile
};
