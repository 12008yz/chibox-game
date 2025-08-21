const { User, Item, UserInventory, Transaction, sequelize } = require('../../models');
const { logger } = require('../../utils/logger');
const { Op } = require('sequelize');

// Стоимость одного спина в рублях
const SLOT_COST = 10.00;

// Конфигурация весов для раритетностей
const RARITY_WEIGHTS = {
  'consumer': 50,      // 50% шанс
  'industrial': 25,    // 25% шанс
  'milspec': 15,       // 15% шанс
  'restricted': 6,     // 6% шанс
  'classified': 3,     // 3% шанс
  'covert': 1,         // 1% шанс
  'contraband': 0.1,   // 0.1% шанс
  'exotic': 0.05       // 0.05% шанс
};

/**
 * Выбирает случайную раритетность на основе весов
 */
function selectRandomRarity() {
  const totalWeight = Object.values(RARITY_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
  const random = Math.random() * totalWeight;
  let currentWeight = 0;

  for (const [rarity, weight] of Object.entries(RARITY_WEIGHTS)) {
    currentWeight += weight;
    if (random <= currentWeight) {
      return rarity;
    }
  }

  return 'consumer'; // Fallback
}

/**
 * Выбирает случайный предмет из заданной раритетности
 */
async function selectRandomItemFromRarity(rarity) {
  const items = await Item.findAll({
    where: {
      rarity: rarity,
      in_stock: true
    },
    order: sequelize.random(),
    limit: 1
  });

  if (items.length === 0) {
    // Если нет предметов этой раритетности, берём consumer
    const fallbackItems = await Item.findAll({
      where: {
        rarity: 'consumer',
        in_stock: true
      },
      order: sequelize.random(),
      limit: 1
    });

    if (fallbackItems.length === 0) {
      // Если даже consumer предметов нет, берём любой доступный предмет
      const anyItems = await Item.findAll({
        where: {
          in_stock: true
        },
        order: sequelize.random(),
        limit: 1
      });

      if (anyItems.length === 0) {
        // Если вообще нет предметов, создаём заглушку
        return {
          id: 'placeholder',
          name: 'Placeholder Item',
          image_url: '/placeholder-item.jpg',
          rarity: 'consumer',
          price: 1.00
        };
      }

      return anyItems[0];
    }

    return fallbackItems[0];
  }

  return items[0];
}

/**
 * Генерирует результат слота (3 предмета)
 */
async function generateSlotResult() {
  const result = [];

  // Определяем, будет ли это выигрыш (5% шанс)
  const isWin = Math.random() < 0.05;

  if (isWin) {
    // Выигрыш: 3 одинаковых предмета
    const rarity = selectRandomRarity();
    const item = await selectRandomItemFromRarity(rarity);

    // Проверяем что предмет валиден
    if (!item || !item.id) {
      logger.error('Invalid item generated for slot win');
      throw new Error('Failed to generate valid winning item');
    }

    result.push(item, item, item);
  } else {
    // Проигрыш: 3 разных предмета или 2 одинаковых
    for (let i = 0; i < 3; i++) {
      const rarity = selectRandomRarity();
      const item = await selectRandomItemFromRarity(rarity);

      // Проверяем что предмет валиден
      if (!item || !item.id) {
        logger.error(`Invalid item generated for slot position ${i}`);
        throw new Error(`Failed to generate valid item for slot position ${i}`);
      }

      result.push(item);
    }

    // Убеждаемся что все предметы валидны и нет 3 одинаковых
    const validItems = result.filter(item => item && item.id);
    if (validItems.length !== 3) {
      logger.error('Invalid slot result: some items are undefined');
      throw new Error('Failed to generate valid slot result');
    }

    const itemIds = result.map(item => item.id);
    const uniqueIds = [...new Set(itemIds)];

    if (uniqueIds.length === 1) {
      // Если все одинаковые, заменяем последний на другой
      const rarity = selectRandomRarity();
      const newItem = await selectRandomItemFromRarity(rarity);

      // Проверяем что новый предмет валиден
      if (!newItem || !newItem.id) {
        logger.error('Invalid replacement item generated for slot');
        throw new Error('Failed to generate valid replacement item');
      }

      result[2] = newItem;
    }
  }

  return result;
}

/**
 * Основная функция игры в слот
 */
const playSlot = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const userId = req.user.id;

    // Получаем пользователя с блокировкой
    const user = await User.findByPk(userId, {
      lock: true,
      transaction
    });

    if (!user) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }

    // Проверяем баланс
    if (user.balance < SLOT_COST) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Недостаточно средств для игры в слот',
        required: SLOT_COST,
        current: user.balance
      });
    }

    // Генерируем результат слота
    const slotResult = await generateSlotResult();

    // Проверяем выигрыш (3 одинаковых предмета)
    const itemIds = slotResult.map(item => item.id);
    const uniqueIds = [...new Set(itemIds)];
    const isWin = uniqueIds.length === 1;

    // Сохраняем начальный баланс
    const balanceBefore = user.balance;
    const balanceAfter = user.balance - SLOT_COST;

    // Списываем стоимость игры
    await user.update({
      balance: balanceAfter
    }, { transaction });

    // Создаём транзакцию списания
    await Transaction.create({
      user_id: userId,
      type: 'slot_play',
      amount: -SLOT_COST,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      description: 'Игра в слот',
      status: 'completed'
    }, { transaction });

    let wonItem = null;

    if (isWin) {
      // Добавляем выигранный предмет в инвентарь
      wonItem = slotResult[0];

      await UserInventory.create({
        user_id: userId,
        item_id: wonItem.id,
        status: 'won',
        source: 'slot_game'
      }, { transaction });

      logger.info(`User ${userId} won item ${wonItem.id} in slot game`);
    }

    await transaction.commit();

    res.json({
      success: true,
      result: {
        items: slotResult.map(item => ({
          id: item.id,
          name: item.name,
          image_url: item.image_url,
          rarity: item.rarity,
          price: item.price
        })),
        isWin,
        wonItem: wonItem ? {
          id: wonItem.id,
          name: wonItem.name,
          image_url: wonItem.image_url,
          rarity: wonItem.rarity,
          price: wonItem.price
        } : null,
        cost: SLOT_COST,
        newBalance: balanceAfter
      }
    });

  } catch (error) {
    await transaction.rollback();
    logger.error('Error in playSlot:', error);

    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
};

module.exports = playSlot;
