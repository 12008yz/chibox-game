const db = require('../../models');
const winston = require('winston');
const { updateUserAchievementProgress } = require('../../services/achievementService');
const { addExperience } = require('../../services/xpService');

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

async function sellItem(req, res) {
  try {
    logger.info('sellItem request body:', req.body);

    const userId = req.user.id;
    const { itemId, item_id } = req.body;
    const effectiveItemId = itemId || item_id;

    if (!effectiveItemId) {
      return res.status(400).json({ message: 'itemId is required' });
    }

    const inventoryItem = await db.UserInventory.findOne({ where: { user_id: userId, item_id: effectiveItemId } });
    if (!inventoryItem) {
      return res.status(404).json({ message: 'Предмет не найден в инвентаре' });
    }

    const item = await db.Item.findByPk(effectiveItemId);
    if (!item) {
      return res.status(404).json({ message: 'Предмет не найден' });
    }

    await inventoryItem.destroy();

    const user = await db.User.findByPk(userId);
    if (user) {
      // Цена продажи = 70% от рыночной стоимости
      const itemPrice = parseFloat(item.price) || 0;
      const sellPrice = Math.round(itemPrice * 0.7);
      user.balance = (parseFloat(user.balance) || 0) + sellPrice;
      await user.save();

      // Update achievement progress for sell item
      await updateUserAchievementProgress(userId, 'sell_item', 1);

      // Добавление опыта за продажу предмета
      await addExperience(userId, 15, 'sell_item', null, 'Продажа предмета');

      logger.info(`Пользователь ${userId} продал предмет ${effectiveItemId} за ${sellPrice}₽`);

      return res.json({
        success: true,
        message: `Предмет продан за ${sellPrice}₽`,
        data: { new_balance: parseFloat(user.balance) }
      });
    }

    return res.status(500).json({ message: 'Ошибка при обновлении баланса пользователя' });
  } catch (error) {
    logger.error('Ошибка при продаже предмета:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  sellItem
};
