const { User, Item, UserInventory, Transaction, sequelize } = require('../../models');
const { logger } = require('../../utils/logger');
const { Op } = require('sequelize');
const { checkFreeGameAvailability, updateFreeGameCounters } = require('../../utils/freeGameHelper');

// Стоимость одного спина в рублях
const SLOT_COST = 0.00;

// Лимиты спинов по уровню подписки
const SLOT_LIMITS = {
  0: 0, // Без подписки - запрещено
  1: 1, // Статус - 1 спин в день
  2: 2, // Статус+ - 2 спина в день
  3: 3  // Статус++ - 3 спина в день
};

// АГРЕССИВНАЯ оптимизация для достижения рентабельности 22.5%
// Из 100 спинов: 78 дешевых выигрышей, 20 проигрышей, 2 дорогих выигрыша
const SLOT_OUTCOME_WEIGHTS = {
  'cheap_win': 78,      // 78% шанс - выигрыш дешевого предмета (1-12₽)
  'lose': 20,           // 20% шанс - проигрыш (предметы не совпадают)
  'expensive_win': 2    // 2% шанс - выигрыш дорогого предмета (12-5000₽) - снижено до 2%
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
 * Выбирает случайный предмет из всех доступных
 */
function selectRandomItem(allItems) {
  if (allItems.length === 0) {
    return null;
  }
  return allItems[Math.floor(Math.random() * allItems.length)];
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

  // Проверяем выигрыш (3 одинаковых предмета по ID)
  const isWin = result.length === 3 &&
               result[0].id === result[1].id &&
               result[1].id === result[2].id;

  logger.info(`Generated slot result: [${result.map(item => `${item.name} (${item.price}₽)`).join(', ')}] - ${isWin ? 'WIN' : 'LOSE'} - Outcome: ${outcome}`);

  return result;
}

/**
 * Генерирует проигрышную комбинацию (3 разных предмета)
 * Всегда возвращает РЕАЛЬНЫЕ предметы, но РАЗНЫЕ, чтобы не было выигрыша
 */
function generateLoseResult(slotItems) {
  const result = [];
  const allItems = [...slotItems.cheap, ...slotItems.expensive];

  if (allItems.length < 3) {
    // Если предметов меньше 3, дублируем чтобы было минимум 3
    while (allItems.length < 3 && allItems.length > 0) {
      allItems.push(...allItems);
    }
  }

  // Выбираем 3 РАЗНЫХ предмета для проигрыша
  const usedIndices = new Set();

  for (let i = 0; i < 3; i++) {
    let attempts = 0;
    let selectedIndex;

    do {
      selectedIndex = Math.floor(Math.random() * allItems.length);
      attempts++;
    } while (usedIndices.has(selectedIndex) && attempts < 50 && allItems.length > 3);

    usedIndices.add(selectedIndex);
    result.push(allItems[selectedIndex]);
  }

  // ВАЖНО: Убеждаемся, что это точно проигрыш (не все предметы одинаковые по ID)
  if (result[0].id === result[1].id && result[1].id === result[2].id) {
    // Если случайно получились 3 одинаковых, заменяем последний на другой
    if (allItems.length > 1) {
      const differentItem = allItems.find(item => item.id !== result[0].id);
      if (differentItem) {
        result[2] = differentItem;
      }
    }
  }

  return result;
}

/**
 * Проверяет, нужно ли сбросить счетчик спинов (каждый день в 16:00 МСК)
 */
function shouldResetSlotCounter(lastResetDate) {
  if (!lastResetDate) {
    logger.info(`[SLOT RESET DEBUG] No lastResetDate -> RESET NEEDED`);
    return true;
  }

  const now = new Date();
  const lastReset = new Date(lastResetDate);

  // Сегодняшний сброс в 16:00 МСК (в UTC это 13:00)
  const todayReset = new Date(now);
  todayReset.setUTCHours(13, 0, 0, 0); // 16:00 МСК = 13:00 UTC

  // Если сегодня ещё не наступило время сброса (до 16:00), то используем вчерашний сброс
  if (now < todayReset) {
    todayReset.setDate(todayReset.getDate() - 1);
  }

  logger.info(`[SLOT RESET DEBUG] Times:`);
  logger.info(`[SLOT RESET DEBUG] - Current UTC time: ${now.toISOString()}`);
  logger.info(`[SLOT RESET DEBUG] - Target reset time: ${todayReset.toISOString()}`);
  logger.info(`[SLOT RESET DEBUG] - Last reset: ${lastReset.toISOString()}`);

  // ПРОСТАЯ И ПРАВИЛЬНАЯ ЛОГИКА:
  // Нужен сброс, если последний сброс был ДО текущего планового времени сброса
  if (lastReset < todayReset) {
    logger.info(`[SLOT RESET DEBUG] Last reset before target reset time -> RESET NEEDED`);
    return true;
  }

  logger.info(`[SLOT RESET DEBUG] Last reset after target reset time -> NO RESET NEEDED`);
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
  // ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ
  logger.info(`[SLOT DEBUG] Checking slot availability for user ${user.id}:`);
  logger.info(`[SLOT DEBUG] - subscription_tier: ${user.subscription_tier}`);
  logger.info(`[SLOT DEBUG] - slots_played_today: ${user.slots_played_today}`);
  logger.info(`[SLOT DEBUG] - last_slot_reset_date: ${user.last_slot_reset_date}`);

  // Проверяем бесплатные попытки для новых пользователей
  const freeGameAvailability = checkFreeGameAvailability(user, 'slot');
  const hasFreeAttempts = freeGameAvailability.canPlay;

  // Проверяем подписку
  const slotLimit = getSlotLimit(user.subscription_tier);
  logger.info(`[SLOT DEBUG] - slot limit for tier ${user.subscription_tier}: ${slotLimit}`);
  logger.info(`[SLOT DEBUG] - free attempts available: ${hasFreeAttempts}`);

  if (slotLimit === 0 && !hasFreeAttempts) {
    logger.info(`[SLOT DEBUG] - BLOCKED: No subscription and no free attempts`);
    return {
      available: false,
      reason: 'subscription_required',
      message: 'Для игры в слот необходима подписка'
    };
  }

  // Проверяем, нужно ли сбросить счетчик
  const needsReset = shouldResetSlotCounter(user.last_slot_reset_date);
  logger.info(`[SLOT DEBUG] - needs reset: ${needsReset}`);

  if (needsReset) {
    logger.info(`[SLOT DEBUG] Resetting slot counter for user ${user.id}: ${user.slots_played_today} -> 0`);
    await user.update({
      slots_played_today: 0,
      last_slot_reset_date: new Date()
    }, { transaction });

    // Обновляем данные в объекте
    user.slots_played_today = 0;
    user.last_slot_reset_date = new Date();
    logger.info(`[SLOT DEBUG] - AFTER RESET: slots_played_today = ${user.slots_played_today}`);
  }

  // Проверяем лимит (учитывая бесплатные попытки)
  logger.info(`[SLOT DEBUG] - Checking limit: ${user.slots_played_today} >= ${slotLimit}?`);
  if (user.slots_played_today >= slotLimit && !hasFreeAttempts) {
    logger.info(`[SLOT DEBUG] - BLOCKED: Daily limit reached and no free attempts (${user.slots_played_today}/${slotLimit})`);
    return {
      available: false,
      reason: 'daily_limit_reached',
      message: `Достигнут дневной лимит спинов (${slotLimit}). Следующая возможность в 16:00 МСК.`,
      limit: slotLimit,
      used: user.slots_played_today
    };
  }

  const remaining = slotLimit - user.slots_played_today;
  const freeAttemptsRemaining = hasFreeAttempts ? (2 - (user.free_slot_claim_count || 0)) : 0;
  logger.info(`[SLOT DEBUG] - ALLOWED: ${user.slots_played_today}/${slotLimit} used, ${remaining} remaining, ${freeAttemptsRemaining} free attempts`);

  return {
    available: true,
    limit: slotLimit,
    used: user.slots_played_today,
    remaining: remaining,
    has_free_attempts: hasFreeAttempts,
    free_attempts_remaining: freeAttemptsRemaining
  };
}

/**
 * Основная функция игры в слот
 */
const playSlot = async (req, res) => {
  logger.info(`[SLOT API] === PLAY SLOT REQUEST STARTED for user ${req.user?.id} ===`);
  const transaction = await sequelize.transaction();

  try {
    const userId = req.user.id;
    logger.info(`[SLOT API] User ID: ${userId}`);

    // Получаем пользователя с блокировкой
    const user = await User.findByPk(userId, {
      lock: true,
      transaction
    });
    logger.info(`[SLOT API] User found: ${user ? 'YES' : 'NO'}`);

    if (!user) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }

    // Игра теперь бесплатная - проверка баланса не нужна

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
    logger.info('[SLOT API] Generating slot result...');
    const slotResult = await generateSlotResult();
    logger.info('[SLOT API] Slot result generated successfully');

    // Проверяем выигрыш (3 одинаковых предмета по ID)
    const isWin = slotResult.length === 3 &&
                 slotResult[0].id === slotResult[1].id &&
                 slotResult[1].id === slotResult[2].id;
    logger.info(`[SLOT API] Win check: ${isWin}`);

    // Сохраняем начальный баланс (игра бесплатная)
    const balanceBefore = user.balance;
    const balanceAfter = user.balance; // Баланс не изменяется

    // Увеличиваем счетчик попыток (сначала бесплатные, потом обычные)
    logger.info('[SLOT API] Updating game counters...');
    if (slotAvailability.has_free_attempts) {
      logger.info('[SLOT API] Using free attempt, updating free game counters...');
      await updateFreeGameCounters(user, 'slot', transaction);
      logger.info(`[SLOT DEBUG] Free attempt used. Remaining: ${2 - user.free_slot_claim_count}`);
    } else {
      const newSlotsCount = user.slots_played_today + 1;
      logger.info(`[SLOT DEBUG] Incrementing slot counter for user ${userId}: ${user.slots_played_today} -> ${newSlotsCount}`);
      await user.update({
        slots_played_today: newSlotsCount
      }, { transaction });
    }
    logger.info('[SLOT API] Game counters updated');

    // Создаём транзакцию для истории (бесплатная игра)
    logger.info('[SLOT API] Creating transaction record...');
    await Transaction.create({
      user_id: userId,
      type: 'bonus',
      amount: 0,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      description: 'Бесплатная игра в слот',
      status: 'completed'
    }, { transaction });
    logger.info('[SLOT API] Transaction record created');

    let wonItem = null;

    logger.info('[SLOT API] Processing win/lose logic...');
    if (isWin) {
      logger.info('[SLOT API] Player won! Adding item to inventory...');
      // Добавляем выигранный предмет в инвентарь
      wonItem = slotResult[0];

      // Проверяем что предмет существует в базе данных
      logger.info(`[SLOT API] Checking if item ${wonItem.id} exists in database...`);
      const itemExists = await Item.findByPk(wonItem.id);
      logger.info(`[SLOT API] Item exists: ${!!itemExists}`);

      if (itemExists) {
        logger.info('[SLOT API] Creating inventory record...');
        await UserInventory.create({
          user_id: userId,
          item_id: wonItem.id,
          status: 'inventory', // предмет в инвентаре
          source: 'bonus' // слот как бонусная игра
        }, { transaction });
        logger.info('[SLOT API] Inventory record created');

        // Обновляем лучший предмет, если текущий дороже (атомарно)
        const itemPrice = parseFloat(wonItem.price) || 0;
        const currentBestValue = parseFloat(user.best_item_value) || 0;
        logger.info(`[SLOT API] Updating best item. Current: ${currentBestValue}, New: ${itemPrice}, Item: ${wonItem.name}`);

        if (itemPrice > currentBestValue) {
          logger.info(`[SLOT API] New record! Updating best_item_value from ${currentBestValue} to ${itemPrice}`);

          // Используем прямое обновление для надежности
          await User.update(
            {
              best_item_value: itemPrice,
              total_items_value: sequelize.literal(`COALESCE(total_items_value, 0) + ${itemPrice}`)
            },
            {
              where: { id: userId },
              transaction
            }
          );

          logger.info(`[SLOT API] best_item_value successfully updated in database`);
        } else {
          // Все равно обновляем общую стоимость
          logger.info('[SLOT API] Updating total items value...');
          await User.update(
            {
              total_items_value: sequelize.literal(`COALESCE(total_items_value, 0) + ${itemPrice}`)
            },
            {
              where: { id: userId },
              transaction
            }
          );
          logger.info('[SLOT API] Total items value updated');
        }

        logger.info(`[SLOT API] User ${userId} won item ${wonItem.id} (${wonItem.name}) in slot game`);
      } else {
        logger.warn(`[SLOT API] Won item ${wonItem.id} does not exist in database, skipping inventory addition`);
        wonItem = null;
      }
    } else {
      logger.info('[SLOT API] Player lost, no item to add');
    }

    logger.info('[SLOT API] Committing transaction...');
    await transaction.commit();
    logger.info('[SLOT API] Transaction committed successfully');

    // Обновляем достижения после успешной игры
    logger.info('[SLOT API] Updating achievements...');
    try {
      const { updateUserAchievementProgress } = require('../../services/achievementService');

      // Обновляем счетчик игр в слоты
      logger.info('[SLOT API] Updating slot_plays achievement...');
      await updateUserAchievementProgress(userId, 'slot_plays', 1);
      logger.info(`[SLOT API] Updated slot_plays achievement for user ${userId}`);

      // Если выиграл, обновляем достижение для лучшего предмета
      if (isWin && wonItem) {
        logger.info('[SLOT API] Updating best_item_value achievement...');
        await updateUserAchievementProgress(userId, 'best_item_value', wonItem.price);
        logger.info(`[SLOT API] Updated best_item_value achievement for user ${userId}: ${wonItem.price}`);

        // Если выиграл джекпот (дорогой предмет), обновляем достижение
        if (wonItem.price >= 1000) {
          logger.info('[SLOT API] Updating roulette_jackpot achievement...');
          await updateUserAchievementProgress(userId, 'roulette_jackpot', 1);
          logger.info(`[SLOT API] Updated roulette_jackpot achievement for user ${userId} (won ${wonItem.name} for ${wonItem.price})`);
        }
      }
      logger.info('[SLOT API] Achievements updated successfully');
    } catch (achievementError) {
      logger.error('[SLOT API] Error updating achievements:', achievementError);
      logger.error('[SLOT API] Achievement error stack:', achievementError.stack);
      // Не прерываем выполнение из-за ошибки в достижениях
    }

    logger.info(`User ${userId} played slot: ${isWin ? 'WIN' : 'LOSE'}, balance: ${balanceBefore} -> ${balanceAfter}`);

    const responseData = {
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
    };

    logger.info('[SLOT API] === SENDING RESPONSE ===');
    logger.info(`[SLOT API] Response:`, JSON.stringify(responseData, null, 2));
    res.json(responseData);

  } catch (error) {
    await transaction.rollback();
    logger.error('[SLOT API] === ERROR OCCURRED ===');
    logger.error('[SLOT API] Error message:', error.message);
    logger.error('[SLOT API] Error stack:', error.stack);
    logger.error('[SLOT API] Full error:', error);

    const errorResponse = {
      success: false,
      message: error.message.includes('Предметы для слота не найдены')
        ? 'Предметы для слота не настроены. Обратитесь к администратору.'
        : 'Внутренняя ошибка сервера',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    };

    logger.error('[SLOT API] Sending error response:', errorResponse);
    res.status(500).json(errorResponse);
  }
};

module.exports = playSlot;
