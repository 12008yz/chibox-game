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

async function sellItem(req, res) {
  try {
    const userId = req.user.id;
    const { itemId } = req.body;

    const inventoryItem = await db.UserInventory.findOne({ where: { userId, itemId } });
    if (!inventoryItem) {
      return res.status(404).json({ message: 'Предмет не найден в инвентаре' });
    }

    const item = await db.Item.findByPk(itemId);
    if (!item) {
      return res.status(404).json({ message: 'Предмет не найден' });
    }

    await inventoryItem.destroy();

    const user = await db.User.findByPk(userId);
    if (user) {
      user.balance = (user.balance || 0) + item.sellPrice; // предполагается поле sellPrice
      await user.save();
    }

    logger.info(`Пользователь ${userId} продал предмет ${itemId} за ${item.sellPrice}`);

    return res.json({ success: true, message: `Предмет продан за ${item.sellPrice}` });
  } catch (error) {
    logger.error('Ошибка при продаже предмета:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  sellItem
};
