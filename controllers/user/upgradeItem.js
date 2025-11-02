const db = require('../../models');
const winston = require('winston');
const { updateUserAchievementProgress } = require('../../services/achievementService');
const { addExperience } = require('../../services/xpService');
const { calculateUpgradeChance, isValidUpgradeTarget, getUpgradePriceRange } = require('../../utils/upgradeCalculator');

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
    const { itemIds } = req.query; // Теперь получаем массив ID предметов
    const userId = req.user.id;

    if (!itemIds) {
      return res.status(400).json({ message: 'itemIds обязательны' });
    }

    // Парсим ID предметов из строки или массива
    let itemIdArray;
    if (typeof itemIds === 'string') {
      itemIdArray = itemIds.split(',').map(id => id.trim());
    } else {
      itemIdArray = Array.isArray(itemIds) ? itemIds : [itemIds];
    }

    if (itemIdArray.length === 0) {
      return res.status(400).json({ message: 'Нужно выбрать хотя бы один предмет' });
    }

    // Получаем выбранные предметы пользователя из инвентаря
    const selectedItems = await db.UserInventory.findAll({
      where: {
        user_id: userId,
        status: 'inventory'
      },
      include: [{
        model: db.Item,
        as: 'item',
        where: {
          id: itemIdArray
        },
        attributes: ['id', 'name', 'image_url', 'price', 'rarity', 'weapon_type'],
        required: true
      }]
    });

    if (selectedItems.length === 0) {
      return res.status(404).json({ message: 'Выбранные предметы не найдены в инвентаре' });
    }

    // Вычисляем общую стоимость выбранных предметов
    const totalSourcePrice = selectedItems.reduce((sum, invItem) => {
      return sum + parseFloat(invItem.item.price);
    }, 0);

    // Получаем диапазон цен для поиска предметов улучшения
    const { minPrice, maxPrice } = getUpgradePriceRange(totalSourcePrice);

    const upgradeOptions = await db.Item.findAll({
      where: {
        price: {
          [db.Sequelize.Op.between]: [minPrice, maxPrice]
        },
        is_available: true,
        id: {
          [db.Sequelize.Op.notIn]: itemIdArray // Исключаем выбранные предметы
        }
      },
      attributes: ['id', 'name', 'image_url', 'price', 'rarity', 'weapon_type'],
      order: [['price', 'ASC']],
      limit: 30
    });

    // Вычисляем шансы для каждого варианта используя единую утилиту
    const optionsWithChances = upgradeOptions.map(item => {
      const targetPrice = parseFloat(item.price);
      const chanceData = calculateUpgradeChance(totalSourcePrice, targetPrice);

      return {
        ...item.toJSON(),
        upgrade_chance: chanceData.finalChance,
        base_chance: chanceData.baseChance,
        cheap_target_bonus: chanceData.cheapTargetBonus,
        price_ratio: chanceData.priceRatio
      };
    });

    return res.json({
      success: true,
      data: {
        source_items: selectedItems.map(item => item.item),
        total_source_price: Math.round(totalSourcePrice * 100) / 100,
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
  let transaction;

  try {
    transaction = await db.sequelize.transaction();
    const userId = req.user.id;
    const { sourceInventoryIds, targetItemId } = req.body;

    // Проверяем, что sourceInventoryIds это массив и содержит хотя бы один элемент
    if (!Array.isArray(sourceInventoryIds) || sourceInventoryIds.length === 0 || !targetItemId) {
      await transaction.rollback();
      return res.status(400).json({ message: 'sourceInventoryIds (массив) и targetItemId обязательны. Нужно выбрать минимум 1 предмет.' });
    }

    // Ограничиваем количество предметов для улучшения (максимум 10)
    if (sourceInventoryIds.length > 10) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Максимум 10 предметов можно использовать для улучшения одновременно' });
    }

    // Получаем все исходные предметы в инвентаре пользователя
    const sourceInventoryItems = await db.UserInventory.findAll({
      where: {
        id: sourceInventoryIds,
        user_id: userId,
        status: 'inventory'
      },
      include: [{
        model: db.Item,
        as: 'item',
        attributes: ['id', 'name', 'image_url', 'price', 'rarity', 'weapon_type'],
        required: true
      }],
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (sourceInventoryItems.length !== sourceInventoryIds.length) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Некоторые предметы не найдены в инвентаре или уже использованы' });
    }

    // Вычисляем общую стоимость исходных предметов
    const totalSourcePrice = sourceInventoryItems.reduce((sum, invItem) => {
      return sum + parseFloat(invItem.item.price);
    }, 0);

    // Проверяем целевой предмет
    const targetItem = await db.Item.findByPk(targetItemId, { transaction });
    if (!targetItem) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Целевой предмет не найден' });
    }

    const targetPrice = parseFloat(targetItem.price);

    // Проверяем, что целевой предмет подходит для улучшения
    if (!isValidUpgradeTarget(totalSourcePrice, targetPrice)) {
      await transaction.rollback();
      return res.status(400).json({
        message: `Целевой предмет должен быть минимум на 5% дороже общей стоимости выбранных предметов. Общая стоимость: ${totalSourcePrice.toFixed(2)}, целевая: ${targetPrice.toFixed(2)}`
      });
    }

    // Вычисляем шанс успеха используя единую утилиту
    const chanceData = calculateUpgradeChance(totalSourcePrice, targetPrice);
    const finalSuccessChance = chanceData.finalChance;
    const cheapTargetBonus = chanceData.cheapTargetBonus;

    // Генерируем случайное число для определения успеха
    const randomValue = Math.random() * 100;
    const isSuccess = randomValue < finalSuccessChance;

    // Логируем детали для отладки
    logger.info(`Апгрейд: пользователь ${userId}, общая цена исходных: ${totalSourcePrice.toFixed(2)}${chanceData.isLowValueSource ? ' (дешевые предметы)' : ''}, цена цели: ${targetPrice.toFixed(2)}, соотношение: ${chanceData.priceRatio}, базовый шанс: ${chanceData.baseChance}%, бонус: ${cheapTargetBonus}%, финальный шанс: ${finalSuccessChance.toFixed(1)}%, мат. ожидание: ${chanceData.expectedValue.toFixed(2)}КР, выпало: ${randomValue.toFixed(1)}, результат: ${isSuccess ? 'УСПЕХ' : 'НЕУДАЧА'}`);

    // Помечаем все исходные предметы как использованные
    await Promise.all(sourceInventoryItems.map(async (invItem) => {
      invItem.status = 'used';
      invItem.transaction_date = new Date();
      await invItem.save({ transaction });
    }));

    let resultItem = null;

    if (isSuccess) {
      // Успешный апгрейд - добавляем целевой предмет
      resultItem = await db.UserInventory.create({
        user_id: userId,
        item_id: targetItemId,
        status: 'inventory',
        acquisition_date: new Date(),
        source: 'upgrade',
        item_type: 'item'
      }, { transaction });

      // Обновляем лучший предмет, если текущий дороже (атомарно)
      const user = await db.User.findByPk(userId, { transaction });
      const currentBestValue = parseFloat(user.best_item_value) || 0;
      logger.info(`DEBUG UPGRADE: Обновление лучшего предмета. Текущий: ${currentBestValue}, Новый: ${targetPrice}, Предмет: ${targetItem.name}`);

      if (targetPrice > currentBestValue) {
        logger.info(`DEBUG UPGRADE: Новый рекорд! Обновляем best_item_value с ${currentBestValue} на ${targetPrice}`);

        // Используем прямое обновление для надежности
        await db.User.update(
          {
            best_item_value: targetPrice,
            total_items_value: db.Sequelize.literal(`COALESCE(total_items_value, 0) + ${targetPrice}`)
          },
          {
            where: { id: userId },
            transaction
          }
        );

        logger.info(`DEBUG UPGRADE: best_item_value успешно обновлен в базе данных`);
      } else {
        // Все равно обновляем общую стоимость
        await db.User.update(
          {
            total_items_value: db.Sequelize.literal(`COALESCE(total_items_value, 0) + ${targetPrice}`)
          },
          {
            where: { id: userId },
            transaction
          }
        );
      }

      // Коммитим транзакцию перед обновлением достижений
      await transaction.commit();
      transaction = null; // Помечаем что транзакция завершена

      // Обновляем достижения и опыт асинхронно после коммита
      try {
        await updateUserAchievementProgress(userId, 'upgrade_item', 1);

        // Обновляем достижение для лучшего предмета
        await updateUserAchievementProgress(userId, 'best_item_value', targetPrice);
        logger.info(`Обновлено достижение best_item_value для пользователя ${userId}: ${targetPrice}`);

        // Проверяем достижение для успешного апгрейда с вероятностью <10%
        if (finalSuccessChance < 10) {
          await updateUserAchievementProgress(userId, 'upgrade_success', 1);
          logger.info(`Обновлено достижение upgrade_success для пользователя ${userId} (шанс был ${finalSuccessChance.toFixed(1)}%)`);
        }

        // Больше опыта за успешный апгрейд с несколькими предметами
        const expReward = 25 + (sourceInventoryItems.length * 5);
        await addExperience(userId, expReward, 'upgrade_success', null, `Успешный апгрейд ${sourceInventoryItems.length} предметов`);
      } catch (achievementError) {
        logger.error('Ошибка при обновлении достижений/опыта:', achievementError);
        // Не возвращаем ошибку пользователю, так как основная операция прошла успешно
      }

      const sourceItemNames = sourceInventoryItems.map(item => item.item?.name || 'Unknown').join(', ');
      logger.info(`Пользователь ${userId} успешно улучшил предметы [${sourceItemNames}] до ${targetItem.name}`);

      return res.json({
        success: true,
        upgrade_success: true,
        message: 'Апгрейд успешен!',
        data: {
          source_items: sourceInventoryItems.map(item => item.item),
          result_item: targetItem,
          success_chance: Math.round(finalSuccessChance * 10) / 10,
          rolled_value: Math.round(randomValue * 10) / 10,
          total_source_price: Math.round(totalSourcePrice * 100) / 100,
          cheap_target_bonus: cheapTargetBonus
        }
      });
    } else {
      // Неудачный апгрейд - предметы потеряны, коммитим транзакцию
      await transaction.commit();
      transaction = null; // Помечаем что транзакция завершена

      // Добавляем опыт за попытку асинхронно после коммита
      try {
        await addExperience(userId, 5 + sourceInventoryItems.length, 'upgrade_fail', null, `Неудачный апгрейд ${sourceInventoryItems.length} предметов`);
      } catch (expError) {
        logger.error('Ошибка при добавлении опыта:', expError);
        // Не возвращаем ошибку пользователю
      }

      const sourceItemNames = sourceInventoryItems.map(item => item.item?.name || 'Unknown').join(', ');
      logger.info(`Пользователь ${userId} неудачно попытался улучшить предметы [${sourceItemNames}] до ${targetItem.name}`);

      return res.json({
        success: true,
        upgrade_success: false,
        message: 'Апгрейд не удался, предметы потеряны',
        data: {
          source_items: sourceInventoryItems.map(item => item.item),
          target_item: targetItem,
          success_chance: Math.round(finalSuccessChance * 10) / 10,
          rolled_value: Math.round(randomValue * 10) / 10,
          total_source_price: Math.round(totalSourcePrice * 100) / 100,
          cheap_target_bonus: cheapTargetBonus
        }
      });
    }
  } catch (error) {
    // Откатываем транзакцию только если она еще не завершена
    if (transaction && !transaction.finished) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        logger.error('Ошибка при откате транзакции:', rollbackError);
      }
    }
    logger.error('Ошибка при выполнении апгрейда:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  getUpgradeableItems,
  getUpgradeOptions,
  performUpgrade
};
