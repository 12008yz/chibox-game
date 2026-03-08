const { User, Transaction, UserInventory, Item } = require('../../models');
const { logger } = require('../../utils/logger');
const { checkFreeGameAvailability, updateFreeGameCounters } = require('../../utils/freeGameHelper');

// Кулдаун Safe Cracker в миллисекундах (нет кулдауна)
const SAFE_CRACKER_COOLDOWN_MS = 0;

// ID предметов, которые могут выпасть в SafeCracker (администратор может изменить этот список)
const SAFECRACKER_ITEM_IDS = [
  '1732de21-9bca-4328-ad90-b54b4d7d5af3',
  '2a59fe6d-4438-42eb-882f-b50a1f5b5020',
  '7472850b-99b4-409f-ab61-132fdaa89675',
  '7bec1b7a-c521-447c-bf7a-0f8c0a1c0374',
  '9bbbaa11-b3b0-43bd-977b-461130a39461',
];

/**
 * Генерирует случайный 3-значный код
 */
function generateRandomCode() {
  return Array.from({ length: 3 }, () => Math.floor(Math.random() * 10));
}

/**
 * Подсчитывает количество совпадений цифр
 */
function countMatches(secretCode, userCode) {
  let matches = 0;
  for (let i = 0; i < 3; i++) {
    if (secretCode[i] === userCode[i]) {
      matches++;
    }
  }
  return matches;
}

/**
 * Определяет приз на основе вероятностей
 * @returns {Object} - {type: string, value: number/object}
 */
function determinePrize() {
  const random = Math.random() * 100;

  // 5% шанс выиграть ChiCoins (от 15 до 50 ChiCoins)
  if (random < 5) {
    const amount = Math.floor(Math.random() * (50 - 15 + 1)) + 15;
    return { type: 'money', value: amount, matches: 3 };
  }

  // 2.5% шанс выиграть предмет
  if (random < 7.5) {
    return { type: 'item', value: null, matches: 3 }; // value будет заполнен позже
  }

  // 1% шанс - 5 дней подписки (3 совпадения)
  if (random < 8.5) {
    return { type: 'subscription', value: 5, matches: 3 };
  }

  // 10% шанс - 1 день подписки (2 совпадения)
  if (random < 18.5) {
    return { type: 'subscription', value: 1, matches: 2 };
  }

  // Остальное - без приза
  return { type: 'none', value: 0, matches: Math.random() < 0.5 ? 0 : 1 };
}

/**
 * Симулирует взлом сейфа с учетом настроенных шансов
 */
function simulateSafeCracker(prize) {
  const secretCode = generateRandomCode();
  let userCode;
  const matches = prize.matches;

  if (matches === 3) {
    // 3 совпадения - все цифры правильные
    userCode = [...secretCode];
  } else if (matches === 2) {
    // 2 совпадения - одна цифра неправильная
    userCode = [...secretCode];
    const randomIndex = Math.floor(Math.random() * 3);
    userCode[randomIndex] = (userCode[randomIndex] + Math.floor(Math.random() * 9) + 1) % 10;
  } else if (matches === 1) {
    // 1 совпадение - две цифры неправильные
    userCode = [...secretCode];
    const indices = [0, 1, 2];
    const keepIndex = indices.splice(Math.floor(Math.random() * 3), 1)[0];
    indices.forEach(idx => {
      userCode[idx] = (userCode[idx] + Math.floor(Math.random() * 9) + 1) % 10;
    });
  } else {
    // 0 совпадений - все цифры неправильные
    userCode = generateRandomCode();
    while (countMatches(secretCode, userCode) > 0) {
      userCode = generateRandomCode();
    }
  }

  return {
    secretCode,
    userCode,
    matches
  };
}

/**
 * Проверяет все предметы из списка SAFECRACKER_ITEM_IDS
 * Логирует информацию о каждом предмете и выявляет отсутствующие
 */
async function validateSafeCrackerItems() {
  logger.info('SafeCracker: Проверка предметов из списка SAFECRACKER_ITEM_IDS');

  if (SAFECRACKER_ITEM_IDS.length === 0) {
    logger.error('SafeCracker: Список предметов ПУСТ!');
    return { valid: false, items: [] };
  }

  try {
    const items = await Item.findAll({
      where: {
        id: SAFECRACKER_ITEM_IDS
      }
    });

    logger.info(`SafeCracker: Найдено ${items.length} из ${SAFECRACKER_ITEM_IDS.length} предметов`);

    // Проверяем каждый предмет
    items.forEach(item => {
      logger.info(`SafeCracker Item: ID=${item.id}, Name="${item.name}", Price=${item.price} ChiCoins, Rarity=${item.rarity}, Available=${item.is_available}`);

      // Проверяем наличие всех необходимых полей для операций
      const hasAllFields = item.id && item.name && item.price && item.rarity && item.image_url;
      if (!hasAllFields) {
        logger.warn(`SafeCracker: Предмет ${item.id} имеет пропущенные поля!`);
      }
    });

    // Находим отсутствующие предметы
    const foundIds = items.map(item => item.id);
    const missingIds = SAFECRACKER_ITEM_IDS.filter(id => !foundIds.includes(id));

    if (missingIds.length > 0) {
      logger.error(`SafeCracker: НЕ НАЙДЕНЫ предметы с ID: ${missingIds.join(', ')}`);
    }

    // Находим недоступные предметы
    const unavailableItems = items.filter(item => !item.is_available);
    if (unavailableItems.length > 0) {
      logger.warn(`SafeCracker: НЕДОСТУПНЫ для выпадения (is_available=false): ${unavailableItems.map(i => `${i.name} (${i.id})`).join(', ')}`);
    }

    return {
      valid: missingIds.length === 0,
      items,
      missingIds,
      unavailableItems
    };
  } catch (error) {
    logger.error('SafeCracker: Ошибка при проверке предметов:', error);
    return { valid: false, items: [], error };
  }
}

/**
 * Выбирает случайный предмет из списка доступных для SafeCracker
 */
async function selectRandomItem() {
  if (SAFECRACKER_ITEM_IDS.length === 0) {
    logger.warn('SafeCracker: Список предметов пуст!');
    return null;
  }

  try {
    const items = await Item.findAll({
      where: {
        id: SAFECRACKER_ITEM_IDS,
        is_available: true
      }
    });

    if (items.length === 0) {
      logger.warn('SafeCracker: Не найдено доступных предметов из списка');
      // Проверяем все предметы для диагностики
      await validateSafeCrackerItems();
      return null;
    }

    const randomItem = items[Math.floor(Math.random() * items.length)];
    logger.info(`SafeCracker: Выбран предмет "${randomItem.name}" (ID: ${randomItem.id}, Price: ${randomItem.price} ChiCoins)`);
    return randomItem;
  } catch (error) {
    logger.error('SafeCracker: Ошибка при выборе предмета:', error);
    return null;
  }
}

/**
 * Игра Safe Cracker
 */
const playSafeCracker = async (req, res) => {
  try {
    const userId = req.user.id;

    // Получаем информацию о пользователе
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }

    // Проверяем, выигрывал ли пользователь сегодня
    if (user.has_won_safecracker) {
      return res.status(403).json({
        success: false,
        message: 'Вы уже выиграли в Safe Cracker сегодня! Попытки обновятся в 16:00 МСК.'
      });
    }

    // Проверяем бесплатные попытки для новых пользователей
    const freeGameAvailability = checkFreeGameAvailability(user, 'safecracker');
    const hasFreeAttempts = freeGameAvailability.canPlay;
    const hasRegularAttempts = user.game_attempts && user.game_attempts > 0;

    // Если нет ни бесплатных, ни обычных попыток
    if (!hasFreeAttempts && !hasRegularAttempts) {
      return res.status(403).json({
        success: false,
        message: 'У вас закончились попытки для игры Safe Cracker'
      });
    }

    // Определяем приз
    const prize = determinePrize();

    // Если используются бесплатные попытки и выпала подписка - заменяем на деньги
    if (hasFreeAttempts && prize.type === 'subscription') {
      prize.type = 'money';
      prize.value = Math.floor(Math.random() * (50 - 15 + 1)) + 15;
      logger.info('SafeCracker: Бесплатная попытка - заменяем подписку на деньги');
    }

    // Если у пользователя нет статуса (подписки) — дни подписки не выпадают, заменяем на деньги
    const hasNoStatus = !user.subscription_tier || user.subscription_tier === 0;
    if (hasNoStatus && prize.type === 'subscription') {
      prize.type = 'money';
      prize.value = Math.floor(Math.random() * (50 - 15 + 1)) + 15;
      logger.info('SafeCracker: У пользователя нет статуса — заменяем дни подписки на деньги');
    }

    // Если приз - предмет, выбираем случайный предмет
    let wonItem = null;
    if (prize.type === 'item') {
      wonItem = await selectRandomItem();
      if (!wonItem) {
        // Если предметов нет, заменяем приз на деньги
        prize.type = 'money';
        prize.value = Math.floor(Math.random() * (50 - 15 + 1)) + 15;
        logger.warn('SafeCracker: Не удалось выбрать предмет, заменяем на деньги');
      }
    }

    // Симулируем взлом сейфа
    const { secretCode, userCode, matches } = simulateSafeCracker(prize);

    logger.info(`SafeCracker - пользователь ${user.username}: секретный код ${secretCode}, код пользователя ${userCode}, совпадений: ${matches}, приз: ${prize.type}`);

    // Уменьшаем количество попыток (сначала бесплатные, потом обычные)
    if (hasFreeAttempts) {
      await updateFreeGameCounters(user, 'safecracker');
      logger.info(`SafeCracker - использована бесплатная попытка. Осталось: ${2 - user.free_safecracker_claim_count}`);
    } else {
      user.game_attempts -= 1;
      logger.info(`SafeCracker - использована обычная попытка. Осталось: ${user.game_attempts}`);
    }

    // Применяем приз если есть
    let message = '';
    const balanceBefore = parseFloat(user.balance) || 0;
    let balanceAfter = balanceBefore;

    if (prize.type === 'money') {
      // Выигрыш денег на баланс
      balanceAfter = balanceBefore + prize.value;
      user.balance = balanceAfter;
      user.has_won_safecracker = true;

      message = `🎉 Поздравляем! ${matches} совпадения! Вы выиграли ${prize.value} ChiCoins на баланс!`;

      logger.info(`Пользователь ${user.username} выиграл ${prize.value} ChiCoins в SafeCracker. Баланс: ${balanceBefore} -> ${balanceAfter}`);

      // Создаем транзакцию
      await Transaction.create({
        user_id: userId,
        type: 'bonus',
        amount: prize.value,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        description: `Выигрыш в Safe Cracker: ${prize.value} ChiCoins`,
        status: 'completed'
      });

    } else if (prize.type === 'item' && wonItem) {
      // Выигрыш предмета
      user.has_won_safecracker = true;

      // Добавляем предмет в инвентарь
      await UserInventory.create({
        user_id: userId,
        item_id: wonItem.id,
        status: 'inventory',
        source: 'bonus'
      });

      message = `🎉 Поздравляем! ${matches} совпадения! Вы выиграли предмет: ${wonItem.name}!`;

      logger.info(`Пользователь ${user.username} выиграл предмет ${wonItem.name} (${wonItem.id}) в SafeCracker`);

      // Создаем транзакцию для истории (баланс не меняется)
      await Transaction.create({
        user_id: userId,
        type: 'bonus',
        amount: 0,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        description: `Выигрыш в Safe Cracker: ${wonItem.name}`,
        status: 'completed'
      });

    } else if (prize.type === 'subscription' && prize.value > 0) {
      // Выигрыш подписки
      const currentSubscriptionDays = user.subscription_days_left || 0;
      const newSubscriptionDays = currentSubscriptionDays + prize.value;

      logger.info(`Пользователь ${user.username} выиграл ${prize.value} дней подписки в SafeCracker (${matches} совпадения). Было: ${currentSubscriptionDays}, станет: ${newSubscriptionDays}`);

      user.subscription_days_left = newSubscriptionDays;
      user.has_won_safecracker = true;

      message = `🎉 Поздравляем! ${matches} совпадения! Вы выиграли ${prize.value} ${prize.value === 1 ? 'день' : 'дней'} подписки! Следующие попытки будут доступны в 16:00 МСК.`;

      // Создаем транзакцию
      await Transaction.create({
        user_id: userId,
        type: 'bonus',
        amount: 0,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        description: `Выигрыш в Safe Cracker: ${prize.value} ${prize.value === 1 ? 'день' : 'дней'} подписки`,
        status: 'completed'
      });
    } else {
      message = matches === 1
        ? 'Одно совпадение! Попробуйте еще раз.'
        : 'Не угадали. Попробуйте еще раз!';

      // Создаем транзакцию для истории даже при проигрыше
      await Transaction.create({
        user_id: userId,
        type: 'bonus',
        amount: 0,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        description: `Игра в Safe Cracker (${matches} совпадения)`,
        status: 'completed'
      });
    }

    await user.save();

    // Формируем ответ
    const response = {
      success: true,
      message,
      secret_code: secretCode,
      user_code: userCode,
      matches,
      prize_type: prize.type,
      prize_value: prize.value,
      won_item: wonItem ? {
        id: wonItem.id,
        name: wonItem.name,
        image_url: wonItem.image_url,
        price: wonItem.price,
        rarity: wonItem.rarity
      } : null,
      new_balance: balanceAfter,
      remaining_attempts: user.game_attempts
    };

    logger.info(`SafeCracker - ответ пользователю ${user.username}:`, response);

    res.json(response);

  } catch (error) {
    logger.error('Ошибка при игре в SafeCracker:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
};

module.exports = playSafeCracker;
