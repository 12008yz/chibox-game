const { User, Item, UserInventory, Transaction, sequelize } = require('../../models');
const { logger } = require('../../utils/logger');
const { Op } = require('sequelize');

// Стоимость одного спина в рублях
const SLOT_COST = 10.00;

// Лимиты спинов по уровню подписки
const SLOT_LIMITS = {
  0: 0, // Без подписки - запрещено
  1: 1, // Статус - 1 спин в день
  2: 2, // Статус+ - 2 спина в день
  3: 3  // Статус++ - 3 спина в день
};

// Новая конфигурация весов для слота (согласно требованиям)
// Из 10 спинов: 6 дешевых выигрышей, 3 проигрыша, 1 дорогой выигрыш
const SLOT_OUTCOME_WEIGHTS = {
  'cheap_win': 60,      // 60% шанс - выигрыш дешевого предмета (1-12₽)
  'lose': 30,           // 30% шанс - проигрыш (предметы не совпадают)
  'expensive_win': 10   // 10% шанс - выигрыш дорогого предмета (12-5000₽)
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
    const expensiveItems = allItems.filter(item => item.price >= 12 && item.price <= 5000);

    // Обновляем кэш
    slotItemsCache = {
      cheap: cheapItems,
      expensive: expensiveItems,
      all: allItems
    };
    cacheExpiry = Date.now() + CACHE_DURATION;

    logger.info(`Loaded slot items: ${cheapItems.length} cheap (1-12₽), ${expensiveItems.length} expensive (12-5000₽)`);

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

  return 'lose'; // Fallback
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
 * Сначала определяем исход, затем создаем соответствующую комбинацию
 */
async function generateSlotResult() {
  const slotItems = await getSlotItems();
  const outcome = selectSlotOutcome();
  const result = [];

  switch (outcome) {
    case 'cheap_win':
      // Выигрыш дешевого предмета - 3 одинаковых дешевых предмета
      const cheapItem = selectRandomItemWithWeight(slotItems.cheap);
      if (cheapItem) {
        result.push(cheapItem, cheapItem, cheapItem);
      } else {
        // Если нет дешевых предметов, делаем проигрыш
        result.push(...generateLoseResult(slotItems));
      }
      break;

    case 'expensive_win':
      // Выигрыш дорогого предмета - 3 одинаковых дорогих предмета
      const expensiveItem = selectRandomItemWithWeight(slotItems.expensive);
      if (expensiveItem) {
        result.push(expensiveItem, expensiveItem, expensiveItem);
      } else {
        // Если нет дорогих предметов, берем дешевый выигрыш
        const fallbackItem = selectRandomItemWithWeight(slotItems.cheap);
        if (fallbackItem) {
          result.push(fallbackItem, fallbackItem, fallbackItem);
        } else {
          result.push(...generateLoseResult(slotItems));
        }
      }
      break;

    case 'lose':
    default:
      // Проигрыш - предметы не совпадают
      result.push(...generateLoseResult(slotItems));
      break;
  }

  // Проверяем выигрыш (3 одинаковых НЕ пустых предмета)
  const isWin = result.length === 3 &&
               result[0].id !== 'empty' &&
               result[0].id === result[1].id &&
               result[1].id === result[2].id;

  logger.info(`Generated slot result: [${result.map(item => `${item.name} (${item.price}₽)`).join(', ')}] - ${isWin ? 'WIN' : 'LOSE'} - Outcome: ${outcome}`);

  return result;
}

/**
 * Генерирует проигрышную комбинацию (3 разных предмета)
 */
function generateLoseResult(slotItems) {
  const result = [];
  const allItems = [...slotItems.cheap, ...slotItems.expensive];

  if (allItems.length === 0) {
    // Если нет предметов, возвращаем 3 пустых слота
    return [createEmptyItem(), createEmptyItem(), createEmptyItem()];
  }

  // Выбираем 3 разных предмета для проигрыша
  const usedItems = new Set();

  for (let i = 0; i < 3; i++) {
    let attempts = 0;
    let selectedItem;

    do {
      // Случайно выбираем между предметом и пустым слотом (70% предмет, 30% пустой)
      if (Math.random() < 0.7 && allItems.length > 0) {
        selectedItem = allItems[Math.floor(Math.random() * allItems.length)];
      } else {
        selectedItem = createEmptyItem();
      }
      attempts++;
    } while (usedItems.has(selectedItem.id) && attempts < 10);

    // Если не смогли найти уникальный предмет, берем случайный
    if (usedItems.has(selectedItem.id)) {
      if (allItems.length > 0) {
        selectedItem = allItems[Math.floor(Math.random() * allItems.length)];
      } else {
        selectedItem = createEmptyItem();
      }
    }

    usedItems.add(selectedItem.id);
    result.push(selectedItem);
  }

  // Убеждаемся, что это точно проигрыш (не все предметы одинаковые)
  if (result[0].id === result[1].id && result[1].id === result[2].id && result[0].id !== 'empty') {
    // Если случайно получились 3 одинаковых, заменяем последний
    if (allItems.length > 1) {
      const differentItem = allItems.find(item => item.id !== result[0].id) || createEmptyItem();
      result[2] = differentItem;
    } else {
      result[2] = createEmptyItem();
    }
  }

  return result;
}

/**
 * Проверяет, нужно ли сбросить счетчик спинов (каждый день в 16:00 МСК)
 */
function shouldResetSlotCounter(lastResetDate) {
  if (!lastResetDate) {
    return true;
  }

  const now = new Date();
  const moscowOffset = 3 * 60; // МСК = UTC+3
  const moscowTime = new Date(now.getTime() + (moscowOffset * 60 * 1000));

  const today = new Date(moscowTime);
  today.setHours(16, 0, 0, 0); // 16:00 МСК сегодня

  const lastReset = new Date(lastResetDate);

  // Если сегодняшний сброс еще не был, и время уже прошло 16:00
  if (moscowTime >= today && lastReset < today) {
    return true;
  }

  // Если прошло больше суток с последнего сброса
  if (moscowTime.getTime() - lastReset.getTime() >= 24 * 60 * 60 * 1000) {
    return true;
  }

  return false;
}

/**
 * Получает максимальное количество спинов для уровня подписки
 */
function getSlotLimit(subscriptionTier) {
  return SLOT_LIMITS[subscriptionTier] || 0;
}

/**
 * Проверяет доступность игры в слот для пользователя
 */
async function checkSlotAvailability(user, transaction) {
  // Проверяем подписку
  const slotLimit = getSlotLimit(user.subscription_tier);

  if (slotLimit === 0) {
    return {
      available: false,
      reason: 'subscription_required',
      message: 'Для игры в слот необходима подписка'
    };
  }

  // Проверяем, нужно ли сбросить счетчик
  if (shouldResetSlotCounter(user.last_slot_reset_date)) {
    await user.update({
      slots_played_today: 0,
      last_slot_reset_date: new Date()
    }, { transaction });

    // Обновляем данные в объекте
    user.slots_played_today = 0;
    user.last_slot_reset_date = new Date();
  }

  // Проверяем лимит
  if (user.slots_played_today >= slotLimit) {
    return {
      available: false,
      reason: 'daily_limit_reached',
      message: `Достигнут дневной лимит спинов (${slotLimit}). Следующая возможность в 16:00 МСК.`,
      limit: slotLimit,
      used: user.slots_played_today
    };
  }

  return {
    available: true,
    limit: slotLimit,
    used: user.slots_played_today,
    remaining: slotLimit - user.slots_played_today
  };
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

    // Проверяем доступность слота (подписка и лимиты)
    const slotAvailability = await checkSlotAvailability(user, transaction);

    if (!slotAvailability.available) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: slotAvailability.message,
        reason: slotAvailability.reason,
        limit: slotAvailability.limit,
        used: slotAvailability.used
      });
    }

    // Генерируем результат слота
    const slotResult = await generateSlotResult();

    // Проверяем выигрыш (3 одинаковых НЕ пустых предмета)
    const isWin = slotResult.length === 3 &&
                 slotResult[0].id !== 'empty' &&
                 slotResult[0].id === slotResult[1].id &&
                 slotResult[1].id === slotResult[2].id;

    // Сохраняем начальный баланс
    const balanceBefore = user.balance;
    const balanceAfter = user.balance - SLOT_COST;

    // Списываем стоимость игры и увеличиваем счетчик спинов
    await user.update({
      balance: balanceAfter,
      slots_played_today: user.slots_played_today + 1
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

    if (isWin && slotResult[0].id !== 'empty') {
      // Добавляем выигранный предмет в инвентарь
      wonItem = slotResult[0];

      // Проверяем что предмет существует в базе данных (не пустой)
      if (wonItem.id !== 'empty') {
        const itemExists = await Item.findByPk(wonItem.id);

        if (itemExists) {
          await UserInventory.create({
            user_id: userId,
            item_id: wonItem.id,
            status: 'inventory', // предмет в инвентаре
            source: 'bonus' // слот как бонусная игра
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
        newBalance: balanceAfter,
        slotInfo: {
          limit: getSlotLimit(user.subscription_tier),
          used: user.slots_played_today + 1,
          remaining: getSlotLimit(user.subscription_tier) - (user.slots_played_today + 1)
        }
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
