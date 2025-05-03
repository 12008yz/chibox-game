const db = require('../../models');
const winston = require('winston');
const { updateUserAchievementProgress } = require('../../services/achievementService');

const subscriptionTiers = {
  1: { days: 30, max_daily_cases: 3, bonus_percentage: 3.0, name: 'Статус', price: 1210 },
  2: { days: 30, max_daily_cases: 5, bonus_percentage: 5.0, name: 'Статус+', price: 2890 },
  3: { days: 30, max_daily_cases: 10, bonus_percentage: 10.0, name: 'Статус++', price: 6819 }
};

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

async function exchangeItemForSubscription(req, res) {
  try {
    const userId = req.user.id;
    const { itemId, tierId } = req.body;

    console.log('exchangeItemForSubscription called with:', { userId, itemId, tierId });

    if (!itemId) {
      return res.status(400).json({ message: 'itemId не указан' });
    }
    if (!tierId) {
      return res.status(400).json({ message: 'tierId не указан' });
    }

    // Получаем предмет из инвентаря пользователя
    const inventoryItem = await db.UserInventory.findOne({
      where: { user_id: userId, item_id: itemId, status: 'inventory' },
      include: [{ model: db.Item, as: 'item' }]
    });
    console.log('inventoryItem found:', inventoryItem);
    if (!inventoryItem) return res.status(404).json({ message: 'Нет такого предмета для обмена' });

    // Получаем пользователя
    const user = await db.User.findByPk(userId);
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });

    // Проверяем активность подписки
    const now = new Date();
    if (!user.subscription_tier || !user.subscription_expiry_date || user.subscription_expiry_date <= now) {
      return res.status(400).json({ message: 'Обмен возможен только при активной подписке' });
    }

    // Получаем цену подписки для выбранного уровня из subscriptionTiers
    const tier = subscriptionTiers[tierId];
    if (!tier) return res.status(400).json({ message: 'Неверный уровень подписки' });

    const itemPrice = parseFloat(inventoryItem.item.price);
    const subscriptionPrice = tier.price;

    if (itemPrice <= 0) return res.status(400).json({ message: 'Цена предмета должна быть больше нуля' });
    if (subscriptionPrice <= 0) return res.status(400).json({ message: 'Цена подписки должна быть больше нуля' });

    // Рассчитываем время продления в днях пропорционально цене предмета и цене подписки
    const daysToAdd = (itemPrice / subscriptionPrice) * tier.days;

    // Продлеваем подписку пользователя
    if (user.subscription_tier === tierId) {
      user.subscription_expiry_date = new Date(user.subscription_expiry_date.getTime() + daysToAdd * 86400000);
    } else {
      user.subscription_tier = tierId;
      user.subscription_purchase_date = now;
      user.subscription_expiry_date = new Date(now.getTime() + daysToAdd * 86400000);
    }

    // Удаляем предмет из инвентаря
    await inventoryItem.destroy();

    await user.save();

    // Update achievement progress for exchange item
    await updateUserAchievementProgress(userId, 'exchange_item', 1);

    // Создаем запись в истории подписок
    await db.SubscriptionHistory.create({
      user_id: userId,
      action: 'exchange_item',
      days: Math.floor(daysToAdd),
      price: 0,
      item_id: itemId,
      method: 'item',
      date: now
    });

    logger.info(`Пользователь ${userId} обменял предмет ${itemId} на подписку tier=${tierId} на ${daysToAdd.toFixed(2)} дней`);

    return res.json({ success: true, message: `Подписка продлена на ${daysToAdd.toFixed(2)} дней` });
  } catch (error) {
    logger.error('Ошибка обмена предмета на подписку:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  exchangeItemForSubscription
};
