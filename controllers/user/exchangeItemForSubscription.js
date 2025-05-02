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

async function exchangeItemForSubscription(req, res) {
  try {
    const userId = req.user.id;
    const { itemId, tierId } = req.body;
    const rule = await db.ItemSubscriptionExchangeRule.findOne({
      where: { item_id: itemId, subscription_tier_id: parseInt(tierId) },
    });
    if (!rule) return res.status(400).json({ message: 'Нет правила обмена для этого предмета/тарифа' });
    const inventoryItem = await db.UserInventory.findOne({ where: { userId, itemId } });
    if (!inventoryItem) return res.status(404).json({ message: 'Нет такого предмета для обмена' });
    const user = await db.User.findByPk(userId);
    const now = new Date();
    if (!user.subscription_tier || !user.subscription_expiry_date || user.subscription_expiry_date <= now) {
      return res.status(400).json({ message: 'Обмен возможен только при активной подписке' });
    }
    await inventoryItem.destroy();
    if (user.subscription_tier === rule.subscription_tier_id) {
      user.subscription_expiry_date = new Date(user.subscription_expiry_date.getTime() + rule.days * 86400000);
    } else {
      user.subscription_tier = rule.subscription_tier_id;
      user.subscription_purchase_date = now;
      user.subscription_expiry_date = new Date(now.getTime() + rule.days * 86400000);
    }
    await user.save();
    await db.SubscriptionHistory.create({
      user_id: userId,
      action: 'exchange_item',
      days: rule.days,
      price: 0,
      item_id: itemId,
      method: 'item',
      date: now
    });
    logger.info(`Пользователь ${userId} обменял предмет ${itemId} на подписку tier=${rule.subscription_tier_id}`);
    return res.json({ success: true, message: `Подписка продлена на ${rule.days} дней` });
  } catch (error) {
    logger.error('Ошибка обмена предмета на подписку:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  exchangeItemForSubscription
};
