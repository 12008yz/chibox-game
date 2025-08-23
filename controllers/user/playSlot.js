const { User, Item, UserInventory, Transaction, sequelize } = require('../../models');
const { logger } = require('../../utils/logger');
const { Op } = require('sequelize');

// Стоимость одного спина в рублях
const SLOT_COST = 10.00;

// Конфигурация весов для раритетностей (для выбора предметов)
const RARITY_WEIGHTS = {
  'consumer': 40,      // 40% шанс
  'industrial': 25,    // 25% шанс
  'milspec': 15,       // 15% шанс
  'restricted': 10,    // 10% шанс
  'classified': 6,     // 6% шанс
  'covert': 3,         // 3% шанс
  'contraband': 1,     // 1% шанс
  'exotic': 0.5        // 0.5% шанс
};

/**
 * Кэш предметов для слота
 */
let slotItemsCache = null;
let cacheExpiry = null;
const CACHE_DURATION = 300000; // 5 минут

/**
 * Получает предметы для слота из базы данных с кэшированием
 */
async function getSlotItems() {
  // Проверяем кэш
  if (slotItemsCache && cacheExpiry && Date.now() < cacheExpiry) {
    return slotItemsCache;
  }

  try {
    // Получаем предметы всех редкостей
    const items = await Item.findAll({
      where: {
        is_available: true,
        in_stock: true,
        price: {
          [Op.gt]: 0
        }
      },
      attributes: [
        'id',
        'name',
        'image_url',
        'price',
        'rarity',
        'weapon_type',
        'skin_name'
      ],
      order: [
        ['rarity', 'DESC'],
        ['price', 'DESC']
      ],
      limit: 200
    });

    if (items.length === 0) {
      logger.warn('No items found for slot game');
      // Возвращаем заглушечные предметы если в базе ничего нет
      return [{
        id: 'fallback-1',
        name: 'AK-47 | Redline',
        image_url: null,
        rarity: 'classified',
        price: 45.50
      }];
    }

    // Группируем предметы по редкости
    const itemsByRarity = {
      consumer: [],
      industrial: [],
      milspec: [],
      restricted: [],
      classified: [],
      covert: [],
      contraband: [],
      exotic: []
    };

    items.forEach(item => {
      const rarity = item.rarity || 'consumer';
      if (itemsByRarity[rarity]) {
        itemsByRarity[rarity].push({
          id: item.id,
          name: item.name,
          image_url: item.image_url,
          price: parseFloat(item.price) || 0,
          rarity: item.rarity,
          weapon_type: item.weapon_type,
          skin_name: item.skin_name
        });
      }
    });

    // Создаем сбалансированный набор для слота
    const slotItems = [];
    const rarityLimits = {
      consumer: 30,
      industrial: 25,
      milspec: 20,
      restricted: 15,
      classified: 10,
      covert: 8,
      contraband: 5,
      exotic: 3
    };

    Object.entries(rarityLimits).forEach(([rarity, limit]) => {
      const rarityItems = itemsByRarity[rarity] || [];
      const itemsToAdd = rarityItems.slice(0, limit);
      slotItems.push(...itemsToAdd);
    });

    // Если предметов мало, добавляем больше дешевых
    if (slotItems.length < 50) {
      const additionalConsumer = itemsByRarity.consumer.slice(30, 80);
      slotItems.push(...additionalConsumer);
    }

    // Обновляем кэш
    slotItemsCache = slotItems;
    cacheExpiry = Date.now() + CACHE_DURATION;

    logger.info(`Loaded ${slotItems.length} items for slot game`);
    return slotItems;

  } catch (error) {
    logger.error('Error loading slot items:', error);
    // Возвращаем заглушку при ошибке
    return [{
      id: 'fallback-1',
      name: 'Default Item',
      image_url: null,
      rarity: 'consumer',
      price: 1.00
    }];
  }
}

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
 * Выбирает случайный предмет из заданной раритетности из предметов слота
 */
function selectRandomItemFromRarity(rarity, slotItems) {
  const itemsOfRarity = slotItems.filter(item => item.rarity === rarity);

  if (itemsOfRarity.length === 0) {
    // Если нет предметов этой раритетности, берём consumer
    const consumerItems = slotItems.filter(item => item.rarity === 'consumer');
    if (consumerItems.length === 0) {
      // Если даже consumer предметов нет, берём любой
      if (slotItems.length === 0) {
        return {
          id: 'fallback',
          name: 'Default Item',
          image_url: null,
          rarity: 'consumer',
          price: 1.00
        };
      }
      return slotItems[Math.floor(Math.random() * slotItems.length)];
    }
    return consumerItems[Math.floor(Math.random() * consumerItems.length)];
  }

  return itemsOfRarity[Math.floor(Math.random() * itemsOfRarity.length)];
}

/**
 * Генерирует результат слота (3 предмета)
 */
async function generateSlotResult() {
  const slotItems = await getSlotItems();
  const result = [];

  // Определяем, будет ли это выигрыш (8% шанс для более честной игры)
  const isWin = Math.random() < 0.08;

  if (isWin) {
    // Выигрыш: 3 одинаковых предмета
    const rarity = selectRandomRarity();
    const item = selectRandomItemFromRarity(rarity, slotItems);

    // Проверяем что предмет валиден
    if (!item || !item.id) {
      logger.error('Invalid item generated for slot win');
      throw new Error('Failed to generate valid winning item');
    }

    result.push(item, item, item);
  } else {
    // Проигрыш: 3 разных предмета
    const usedIds = new Set();

    for (let i = 0; i < 3; i++) {
      let attempts = 0;
      let item;

      // Пытаемся найти уникальный предмет (до 10 попыток)
      do {
        const rarity = selectRandomRarity();
        item = selectRandomItemFromRarity(rarity, slotItems);
        attempts++;
      } while (usedIds.has(item.id) && attempts < 10);

      // Проверяем что предмет валиден
      if (!item || !item.id) {
        logger.error(`Invalid item generated for slot position ${i}`);
        throw new Error(`Failed to generate valid item for slot position ${i}`);
      }

      usedIds.add(item.id);
      result.push(item);
    }

    // Проверяем что не получилось 3 одинаковых случайно
    const itemIds = result.map(item => item.id);
    const uniqueIds = [...new Set(itemIds)];

    if (uniqueIds.length === 1) {
      // Если все одинаковые, заменяем последний на другой
      let newItem;
      let attempts = 0;

      do {
        const rarity = selectRandomRarity();
        newItem = selectRandomItemFromRarity(rarity, slotItems);
        attempts++;
      } while (newItem.id === result[0].id && attempts < 10);

      if (newItem && newItem.id !== result[0].id) {
        result[2] = newItem;
      }
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
      type: 'balance_subtract',
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

      // Проверяем что предмет существует в базе данных
      const itemExists = await Item.findByPk(wonItem.id);

      if (itemExists) {
        await UserInventory.create({
          user_id: userId,
          item_id: wonItem.id,
          status: 'won',
          source: 'slot_game'
        }, { transaction });

        logger.info(`User ${userId} won item ${wonItem.id} (${wonItem.name}) in slot game`);
      } else {
        logger.warn(`Won item ${wonItem.id} does not exist in database, skipping inventory addition`);
        // Не добавляем предмет в инвентарь если его нет в базе (fallback предмет)
      }
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
