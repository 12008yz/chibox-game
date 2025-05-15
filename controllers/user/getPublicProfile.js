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
    const user = await db.User.findByPk(id, {
      attributes: ['id', 'username', 'createdAt', 'level', 'subscription_tier', 'total_cases_opened'],
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
              attributes: ['id', 'name', 'rarity', 'price', 'weapon_type', 'skin_name']
            }
          ]
        }
      ]
    });

    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    // Определяем лучшее выбитое оружие (например, по максимальной цене)
    let bestWeapon = null;
    if (user.inventory && user.inventory.length > 0) {
      bestWeapon = user.inventory.reduce((prev, current) => {
        return (prev.item.price > current.item.price) ? prev : current;
      }).item;
    }

    return res.json({
      user: {
        id: user.id,
        username: user.username,
        createdAt: user.createdAt,
        level: user.level,
        subscriptionTier: user.subscription_tier,
        totalCasesOpened: user.total_cases_opened,
        inventory: user.inventory,
        bestWeapon: bestWeapon
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
