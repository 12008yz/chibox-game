const { User, Item, UserInventory, Transaction, sequelize } = require('../../models');
const { logger } = require('../../utils/logger');
const { Op } = require('sequelize');

// Стоимость одного спина в рублях
const SLOT_COST = 10.00;

// Новая конфигурация весов для слота (согласно требованиям)
const SLOT_OUTCOME_WEIGHTS = {
  'cheap_items': 60,    // 60% шанс - дешевые предметы (1-12₽)
  'nothing': 30,        // 30% шанс - ничего не выпадает
  'expensive_items': 10 // 10% шанс - дорогие предметы (100-5000₽)
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
        origin: 'slot_machine', // только наши предметы для слота
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
        'steam_market_hash_name',
        'drop_weight'
      ],
      order: [
        ['price', 'ASC']
      ]
    });

    if (items.length === 0) {
      logger.error('No slot items found! Run add-slot-items.js script first');
      throw new Error('Предметы для слота не найдены. Запустите скрипт add-slot-items.js');
    }

    // Преобразуем в нужный формат и разделяем по ценовым категориям
    const allItems = items.map(item => ({
      id: item.id,
      name: item.name,
      image_url: item.image_url,
      price: parseFloat(item.price) || 0,
      rarity: item.rarity,
      weapon_type: item.weapon_type,
      skin_name: item.skin_name,
      steam_market_hash_name: item.steam_market_hash_name,
      drop_weight: parseFloat(item.drop_weight) || 1.0
    }));

    // Разделяем на категории по цене
    const cheapItems = allItems.filter(item => item.price >= 1 && item.price <= 12);
    const expensiveItems = allItems.filter(item => item.price >= 100 && item.price <= 5000);

    // Обновляем кэш
    slotItemsCache = {
      cheap: cheapItems,
      expensive: expensiveItems,
      all: allItems
    };
    cacheExpiry = Date.now() + CACHE_DURATION;

    logger.info(`Loaded slot items: ${cheapItems.length} cheap (1-12₽), ${expensiveItems.length} expensive (100-5000₽)`);

    return slotItemsCache;

  } catch (error) {
    logger.error('Error loading slot items:', error);
    throw error;
  }
}

/**
 * Выбирает исход слота на основе весов
 */
function selectSlotOutcome() {
  const totalWeight = Object.values(SLOT_OUTCOME_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
  const random = Math.random() * totalWeight;
  let currentWeight = 0;

  for (const [outcome, weight] of Object.entries(SLOT_OUTCOME_WEIGHTS)) {
    currentWeight += weight;
    if (random <= currentWeight) {
      return outcome;
    }
  }

  return 'nothing'; // Fallback
}

/**
 * Выбирает случайный предмет из категории с учетом drop_weight
 */
function selectRandomItemWithWeight(items) {
  if (items.length === 0) {
    return null;
  }

  // Если у предметов нет весов, выбираем случайно
  const hasWeights = items.some(item => item.drop_weight && item.drop_weight > 0);

  if (!hasWeights) {
    return items[Math.floor(Math.random() * items.length)];
  }

  // Выбираем по весам
  const totalWeight = items.reduce((sum, item) => sum + (item.drop_weight || 1), 0);
  const random = Math.random() * totalWeight;
  let currentWeight = 0;

  for (const item of items) {
    currentWeight += (item.drop_weight || 1);
    if (random <= currentWeight) {
      return item;
    }
  }

  return items[0]; // Fallback
}

/**
 * Создает "пустой" предмет для случаев когда ничего не выпадает
 */
function createEmptyItem() {
  return {
    id: 'empty',
    name: 'Пусто',
    image_url: '/images/empty-slot.png', // Заглушка
    price: 0,
    rarity: 'empty',
    weapon_type: null,
    skin_name: null,
    steam_market_hash_name: null
  };
}

/**
 * Генерирует результат слота (3 предмета) с новой логикой
 */
async function generateSlotResult() {
  const slotItems = await getSlotItems();
  const result = [];

  // Определяем исход для каждого из 3 слотов
  for (let i = 0; i < 3; i++) {
    const outcome = selectSlotOutcome();

    let item;
    switch (outcome) {
      case 'cheap_items':
        item = selectRandomItemWithWeight(slotItems.cheap);
        if (!item) {
          // Если нет дешевых предметов, создаем пустой
          item = createEmptyItem();
        }
        break;

      case 'expensive_items':
        item = selectRandomItemWithWeight(slotItems.expensive);
        if (!item) {
          // Если нет дорогих предметов, берем дешевый
          item = selectRandomItemWithWeight(slotItems.cheap) || createEmptyItem();
        }
        break;

      case 'nothing':
      default:
        item = createEmptyItem();
        break;
    }

    result.push(item);
  }

  // Проверяем выигрыш (3 одинаковых НЕ пустых предмета)
  const nonEmptyItems = result.filter(item => item.id !== 'empty');
  const isWin = nonEmptyItems.length === 3 &&
               nonEmptyItems[0].id === nonEmptyItems[1].id &&
               nonEmptyItems[1].id === nonEmptyItems[2].id;

  logger.info(`Generated slot result: [${result.map(item => `${item.name} (${item.price}₽)`).join(', ')}] - ${isWin ? 'WIN' : 'LOSE'}`);

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

    // Проверяем выигрыш (3 одинаковых НЕ пустых предмета)
    const nonEmptyItems = slotResult.filter(item => item.id !== 'empty');
    const isWin = nonEmptyItems.length === 3 &&
                 nonEmptyItems[0].id === nonEmptyItems[1].id &&
                 nonEmptyItems[1].id === nonEmptyItems[2].id;

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

    if (isWin && nonEmptyItems[0].id !== 'empty') {
      // Добавляем выигранный предмет в инвентарь
      wonItem = nonEmptyItems[0];

      // Проверяем что предмет существует в базе данных (не пустой)
      if (wonItem.id !== 'empty') {
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
          wonItem = null;
        }
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
