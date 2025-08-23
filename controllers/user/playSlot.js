const { User, Item, UserInventory, Transaction, sequelize } = require('../../models');
const { logger } = require('../../utils/logger');
const { Op } = require('sequelize');

// Стоимость одного спина в рублях
const SLOT_COST = 10.00;

// Конфигурация весов для раритетностей (более сбалансированная для наших 20 предметов)
const RARITY_WEIGHTS = {
  'consumer': 60,      // 60% шанс - дешевые предметы (7 штук)
  'industrial': 25,    // 25% шанс - промышленные (3 штуки)
  'milspec': 12,       // 12% шанс - армейские (5 штук)
  'restricted': 2.5,   // 2.5% шанс - запрещенные (3 штуки)
  'classified': 0.4,   // 0.4% шанс - засекреченные (0 штук в нашем наборе)
  'covert': 0.1        // 0.1% шанс - секретные (2 штуки)
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
    // Получаем только предметы слота с origin = 'slot_machine'
    const items = await Item.findAll({
      where: {
        origin: 'slot_machine', // только наши 20 предметов
        is_available: true,
        in_stock: true,
        image_url: {
          [Op.not]: null,
          [Op.ne]: ''
        },
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
        'skin_name',
        'steam_market_hash_name'
      ],
      order: [
        ['rarity', 'ASC'], // сначала дешевые
        ['price', 'ASC']
      ]
    });

    if (items.length === 0) {
      logger.error('No slot items found! Run add-slot-items.js script first');
      throw new Error('Предметы для слота не найдены. Запустите скрипт add-slot-items.js');
    }

    // Преобразуем в нужный формат
    const slotItems = items.map(item => ({
      id: item.id,
      name: item.name,
      image_url: item.image_url,
      price: parseFloat(item.price) || 0,
      rarity: item.rarity,
      weapon_type: item.weapon_type,
      skin_name: item.skin_name,
      steam_market_hash_name: item.steam_market_hash_name
    }));

    // Обновляем кэш
    slotItemsCache = slotItems;
    cacheExpiry = Date.now() + CACHE_DURATION;

    logger.info(`Loaded ${slotItems.length} slot items for game`);

    // Выводим статистику по редкости
    const rarityStats = {};
    slotItems.forEach(item => {
      rarityStats[item.rarity] = (rarityStats[item.rarity] || 0) + 1;
    });
    logger.info('Slot items by rarity:', rarityStats);

    return slotItems;

  } catch (error) {
    logger.error('Error loading slot items:', error);
    throw error;
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
        throw new Error('No items available for slot');
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

  // Определяем, будет ли это выигрыш (5% шанс для честной игры)
  const isWin = Math.random() < 0.05;

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
    logger.info(`Generated winning slot result: 3x ${item.name} (${item.rarity})`);
  } else {
    // Проигрыш: 3 разных предмета
    const usedIds = new Set();

    for (let i = 0; i < 3; i++) {
      let attempts = 0;
      let item;

      // Пытаемся найти уникальный предмет (до 20 попыток)
      do {
        const rarity = selectRandomRarity();
        item = selectRandomItemFromRarity(rarity, slotItems);
        attempts++;
      } while (usedIds.has(item.id) && attempts < 20);

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
      } while (newItem.id === result[0].id && attempts < 20);

      if (newItem && newItem.id !== result[0].id) {
        result[2] = newItem;
      }
    }

    logger.info(`Generated losing slot result: ${result.map(item => item.name).join(', ')}`);
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
          status: 'available', // предмет доступен для продажи/вывода
          source: 'slot_game'
        }, { transaction });

        logger.info(`User ${userId} won item ${wonItem.id} (${wonItem.name}) in slot game`);
      } else {
        logger.warn(`Won item ${wonItem.id} does not exist in database, skipping inventory addition`);
        // Не добавляем предмет в инвентарь если его нет в базе
        wonItem = null;
      }
    }

    await transaction.commit();

    logger.info(`User ${userId} played slot: ${isWin ? 'WIN' : 'LOSE'}, balance: ${balanceBefore} -> ${balanceAfter}`);

    res.json({
      success: true,
      result: {
        items: slotResult.map(item => ({
          id: item.id,
          name: item.name,
          image_url: item.image_url,
          rarity: item.rarity,
          price: item.price,
          weapon_type: item.weapon_type
        })),
        isWin,
        wonItem: wonItem ? {
          id: wonItem.id,
          name: wonItem.name,
          image_url: wonItem.image_url,
          rarity: wonItem.rarity,
          price: wonItem.price,
          weapon_type: wonItem.weapon_type
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
      message: error.message.includes('Предметы для слота не найдены')
        ? 'Предметы для слота не настроены. Обратитесь к администратору.'
        : 'Внутренняя ошибка сервера'
    });
  }
};

module.exports = playSlot;
