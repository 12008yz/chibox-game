const db = require('../../models');
const winston = require('winston');
const { giveDailyCaseToUser } = require('../../services/caseService');
const { createPayment } = require('../../services/paymentService');

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

async function buySubscription(req, res) {
  try {
    const userId = req.user.id;
    const { tierId, method, itemId, promoCode } = req.body;
    const user = await db.User.findByPk(userId);
    const tier = subscriptionTiers[tierId];
    if (!tier) return res.status(404).json({ message: 'Тариф не найден' });

    let price = tier.price || 0;
    let action = 'purchase';
    let exchangeItemId = null;

    if (method === 'balance') {
      logger.info(`Баланс пользователя до покупки: ${user.balance}`);
      if ((user.balance || 0) < price) return res.status(400).json({ message: 'Недостаточно средств' });
      user.balance -= price;
      logger.info(`Баланс пользователя после покупки: ${user.balance}`);
    } else if (method === 'item') {
      const rule = await db.ItemSubscriptionExchangeRule.findOne({
        where: { item_id: itemId, subscription_tier_id: parseInt(tierId) },
      });
      if (!rule) return res.status(400).json({ message: 'Нельзя обменять данный предмет' });
      const inventoryItem = await db.UserInventory.findOne({ where: { userId, itemId } });
      if (!inventoryItem) return res.status(404).json({ message: 'У пользователя нет предмета' });
      exchangeItemId = itemId;
      price = 0;
      action = 'exchange_item';
      await inventoryItem.destroy();
    } else if (method === 'promo') {
      action = 'promo';
    } else if (method === 'card') {
      // Создаем платеж через YooMoney и возвращаем ссылку на оплату
      try {
        const paymentUrl = await createPayment(price, userId, tierId);
        return res.json({ paymentUrl, message: 'Перенаправьте пользователя для оплаты' });
      } catch (error) {
        logger.error('Ошибка создания платежа через YooMoney:', error);
        return res.status(500).json({ message: 'Ошибка при создании платежа' });
      }
    }

    const now = new Date();
    if (user.subscription_tier && user.subscription_expiry_date && user.subscription_expiry_date > now && user.subscription_tier === parseInt(tierId)) {
      user.subscription_expiry_date = new Date(Math.max(now, user.subscription_expiry_date));
      user.subscription_expiry_date.setDate(user.subscription_expiry_date.getDate() + tier.days);
    } else {
      user.subscription_tier = parseInt(tierId);
      user.subscription_purchase_date = now;
      user.subscription_expiry_date = new Date(now.getTime() + tier.days * 86400000);
    }

    user.max_daily_cases = 1; // Устанавливаем 1 кейс в день по подписке
    user.subscription_bonus_percentage = tier.bonus_percentage;
    user.cases_available = Math.max(user.cases_available || 0, 1); // 1 кейс в день по подписке
    await user.save();

    // Выдаём ежедневный кейс пользователю через сервис
    await giveDailyCaseToUser(userId, parseInt(tierId));

    await db.SubscriptionHistory.create({
      user_id: userId,
      action,
      days: tier.days,
      price,
      item_id: exchangeItemId,
      method: method,
      date: now
    });
    logger.info(`Пользователь ${userId} приобрёл подписку tier=${tierId}`);
    return res.json({
      success: true,
      tier: {
        id: parseInt(tierId),
        name: tier.name,
        expiry_date: user.subscription_expiry_date,
        bonus: tier.bonus_percentage,
        max_daily_cases: tier.max_daily_cases
      },
      balance: user.balance,
      message: 'Подписка успешно активирована'
    });
  } catch (error) {
    logger.error('Ошибка покупки подписки:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  buySubscription
};
