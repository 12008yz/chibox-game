const db = require('../../models');
const winston = require('winston');
const { updateUserAchievementProgress } = require('../../services/achievementService');

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

async function withdrawItem(req, res) {
  try {
    const userId = req.user.id;
    const { itemId } = req.body;

    const inventoryItem = await db.UserInventory.findOne({ where: { userId, itemId } });
    if (!inventoryItem) {
      return res.status(404).json({ message: 'Предмет не найден в инвентаре' });
    }

    await db.Withdrawal.create({
      user_id: userId,
      itemId,
      status: 'pending',
      type: 'item'
    });

    // Update achievement progress for steam inventory withdrawal
    await updateUserAchievementProgress(userId, 'steam_inventory', 1);

    logger.info(`Пользователь ${userId} запросил вывод предмета ${itemId}`);

    return res.json({ success: true, message: 'Заявка на вывод предмета создана' });
  } catch (error) {
    logger.error('Ошибка вывода предмета:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  withdrawItem
};
