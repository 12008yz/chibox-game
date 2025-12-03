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
  const transaction = await db.sequelize.transaction();

  try {
    logger.info('sellItem request body:', req.body);

    const userId = req.user.id;
    const { itemId, item_id } = req.body;
    const effectiveItemId = itemId || item_id;

    if (!effectiveItemId) {
      await transaction.rollback();
      return res.status(400).json({ message: 'itemId is required' });
    }

    // Ищем конкретный экземпляр предмета с блокировкой для предотвращения race conditions
    const inventoryItem = await db.UserInventory.findOne({
      where: {
        user_id: userId,
        id: effectiveItemId,
        status: 'inventory' // Проверяем, что предмет действительно в инвентаре
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!inventoryItem) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Предмет не найден в инвентаре или уже продан' });
    }

    const item = await db.Item.findByPk(inventoryItem.item_id, { transaction });
    if (!item) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Предмет не найден' });
    }

    // Обновляем статус только этого конкретного экземпляра
    inventoryItem.status = 'sold';
    inventoryItem.transaction_date = new Date();
    await inventoryItem.save({ transaction });

    const user = await db.User.findByPk(userId, { transaction });
    if (user) {
      // Цена продажи = 85% от рыночной стоимости (оптимизация для рентабельности)
      const itemPrice = parseFloat(item.price) || 0;
      const sellPrice = Math.round(itemPrice * 0.85);
      user.balance = (parseFloat(user.balance) || 0) + sellPrice;
      await user.save({ transaction });

      // Коммитим транзакцию
      await transaction.commit();

      // Update achievement progress for sell item (после коммита)
      await updateUserAchievementProgress(userId, 'sell_item', 1);

      // Обновляем достижение для общей суммы продаж
      await updateUserAchievementProgress(userId, 'total_sold_value', sellPrice);
      logger.info(`Обновлено достижение total_sold_value для пользователя ${userId}: ${sellPrice}`);

      // Добавление опыта за продажу предмета (после коммита)
      await addExperience(userId, 15, 'sell_item', null, 'Продажа предмета');

      logger.info(`Пользователь ${userId} продал 1 экземпляр предмета ${item.name} (inventory ID: ${effectiveItemId}, item ID: ${inventoryItem.item_id}) за ${sellPrice}₽`);

      return res.json({
        success: true,
        message: `Предмет продан за ${sellPrice}₽`,
        data: { new_balance: parseFloat(user.balance) }
      });
    }

    await transaction.rollback();
    return res.status(500).json({ message: 'Ошибка при обновлении баланса пользователя' });
  } catch (error) {
    await transaction.rollback();
    logger.error('Ошибка при продаже предмета:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  sellItem
};
