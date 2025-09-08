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

// Получить предметы доступные для апгрейда
async function getUpgradeableItems(req, res) {
  try {
    const userId = req.user.id;

    // Получаем все предметы пользователя в инвентаре
    const inventoryItems = await db.UserInventory.findAll({
      where: {
        user_id: userId,
        status: 'inventory'
      },
      include: [{
        model: db.Item,
        as: 'item',
        attributes: ['id', 'name', 'image_url', 'price', 'rarity', 'weapon_type'],
        required: true // Это заставляет использовать INNER JOIN
      }],
      order: [['item', 'price', 'DESC']]
    });

    // Группируем предметы по типу
    const groupedItems = inventoryItems.reduce((acc, invItem) => {
      const item = invItem.item;
      const key = item.id;

      if (!acc[key]) {
        acc[key] = {
          item: item,
          instances: [],
          count: 0
        };
      }

      acc[key].instances.push(invItem);
      acc[key].count++;
      return acc;
    }, {});

    const groupedArray = Object.values(groupedItems);

    return res.json({
      success: true,
      data: {
        items: groupedArray
      }
    });
  } catch (error) {
    logger.error('Ошибка при получении предметов для апгрейда:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

// Получить возможные варианты апгрейда для предмета
async function getUpgradeOptions(req, res) {
  try {
    const { itemId } = req.params;

    // Получаем исходный предмет
    const sourceItem = await db.Item.findByPk(itemId);
    if (!sourceItem) {
      return res.status(404).json({ message: 'Предмет не найден' });
    }

    const sourcePrice = parseFloat(sourceItem.price);

    // Ищем предметы для апгрейда (на 20-500% дороже исходного)
    const minPrice = sourcePrice * 1.2; // Минимум на 20% дороже
    const maxPrice = sourcePrice * 5; // Максимум в 5 раз дороже

    const upgradeOptions = await db.Item.findAll({
      where: {
        price: {
          [db.Sequelize.Op.between]: [minPrice, maxPrice]
        },
        is_available: true,
        id: {
          [db.Sequelize.Op.ne]: itemId // Исключаем исходный предмет
        }
      },
      attributes: ['id', 'name', 'image_url', 'price', 'rarity', 'weapon_type'],
      order: [['price', 'ASC']],
      limit: 20
    });

    // Вычисляем шансы для каждого варианта
    const optionsWithChances = upgradeOptions.map(item => {
      const targetPrice = parseFloat(item.price);
      const priceRatio = targetPrice / sourcePrice;

      // Формула шанса: базовый шанс 50% для предметов на 20% дороже,
      // уменьшается экспоненциально с ростом цены
      let chance = Math.max(5, Math.min(50, 50 / Math.pow(priceRatio - 1, 0.8)));
      chance = Math.round(chance * 10) / 10; // Округляем до 1 знака после запятой

      return {
        ...item.toJSON(),
        upgrade_chance: chance,
        price_ratio: Math.round(priceRatio * 100) / 100
      };
    });

    return res.json({
      success: true,
      data: {
        source_item: sourceItem,
        upgrade_options: optionsWithChances
      }
    });
  } catch (error) {
    logger.error('Ошибка при получении вариантов апгрейда:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

// Выполнить апгрейд предмета
async function performUpgrade(req, res) {
  const transaction = await db.sequelize.transaction();

  try {
    const userId = req.user.id;
    const { sourceInventoryId, targetItemId } = req.body;

    if (!sourceInventoryId || !targetItemId) {
      await transaction.rollback();
      return res.status(400).json({ message: 'sourceInventoryId и targetItemId обязательны' });
    }

    // Проверяем исходный предмет в инвентаре пользователя
    const sourceInventoryItem = await db.UserInventory.findOne({
      where: {
        id: sourceInventoryId,
        user_id: userId,
        status: 'inventory'
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!sourceInventoryItem) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Исходный предмет не найден в инвентаре' });
    }

    // Получаем данные о предмете отдельно
    const sourceItem = await db.Item.findByPk(sourceInventoryItem.item_id, { transaction });
    if (!sourceItem) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Данные о предмете не найдены' });
    }

    // Добавляем предмет к объекту инвентаря для совместимости с остальным кодом
    sourceInventoryItem.item = sourceItem;

    // Проверяем целевой предмет
    const targetItem = await db.Item.findByPk(targetItemId, { transaction });
    if (!targetItem) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Целевой предмет не найден' });
    }

    const sourcePrice = parseFloat(sourceInventoryItem.item.price);
    const targetPrice = parseFloat(targetItem.price);

    // Проверяем, что целевой предмет дороже исходного
    if (targetPrice <= sourcePrice * 1.2) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Целевой предмет должен быть минимум на 20% дороже исходного' });
    }

    // Вычисляем шанс успеха
    const priceRatio = targetPrice / sourcePrice;
    let successChance = Math.max(5, Math.min(50, 50 / Math.pow(priceRatio - 1, 0.8)));

    // Генерируем случайное число для определения успеха
    const randomValue = Math.random() * 100;
    const isSuccess = randomValue < successChance;

    // Удаляем исходный предмет
    sourceInventoryItem.status = 'used';
    sourceInventoryItem.transaction_date = new Date();
    await sourceInventoryItem.save({ transaction });

    let resultItem = null;

    if (isSuccess) {
      // Успешный апгрейд - добавляем целевой предмет
      resultItem = await db.UserInventory.create({
        user_id: userId,
        item_id: targetItemId,
        status: 'inventory',
        acquired_date: new Date()
      }, { transaction });

      // Обновляем достижения
      await transaction.commit();
      await updateUserAchievementProgress(userId, 'upgrade_item', 1);
      await addExperience(userId, 25, 'upgrade_success', null, 'Успешный апгрейд предмета');

      logger.info(`Пользователь ${userId} успешно улучшил предмет ${sourceInventoryItem.item?.name || 'Unknown'} до ${targetItem.name}`);

      return res.json({
        success: true,
        upgrade_success: true,
        message: 'Апгрейд успешен!',
        data: {
          source_item: sourceInventoryItem.item,
          result_item: targetItem,
          success_chance: Math.round(successChance * 10) / 10,
          rolled_value: Math.round(randomValue * 10) / 10
        }
      });
    } else {
      // Неудачный апгрейд - предмет потерян
      await transaction.commit();
      await addExperience(userId, 5, 'upgrade_fail', null, 'Неудачный апгрейд предмета');

      logger.info(`Пользователь ${userId} неудачно попытался улучшить предмет ${sourceInventoryItem.item?.name || 'Unknown'} до ${targetItem.name}`);

      return res.json({
        success: true,
        upgrade_success: false,
        message: 'Апгрейд не удался, предмет потерян',
        data: {
          source_item: sourceInventoryItem.item,
          target_item: targetItem,
          success_chance: Math.round(successChance * 10) / 10,
          rolled_value: Math.round(randomValue * 10) / 10
        }
      });
    }
  } catch (error) {
    await transaction.rollback();
    logger.error('Ошибка при выполнении апгрейда:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  getUpgradeableItems,
  getUpgradeOptions,
  performUpgrade
};
