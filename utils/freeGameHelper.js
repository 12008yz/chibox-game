const MAX_FREE_ATTEMPTS = 2; // Максимальное количество бесплатных попыток
const FREE_GAME_PERIOD_DAYS = 2; // Период в днях для бесплатных попыток

/**
 * Преобразует UTC время в московское время (UTC+3)
 * @param {Date} date - дата в UTC
 * @returns {Date} дата в московском времени
 */
function getMoscowTime(date) {
  const moscowOffset = 3 * 60; // Московское время UTC+3 в минутах
  const localOffset = date.getTimezoneOffset(); // Локальное смещение в минутах (отрицательное для UTC+)
  const totalOffset = moscowOffset + localOffset;

  return new Date(date.getTime() + totalOffset * 60 * 1000);
}

/**
 * Проверяет, может ли пользователь использовать бесплатную попытку в игре
 * @param {Object} user - объект пользователя из базы данных
 * @param {string} gameType - тип игры: 'safecracker', 'slot', 'tictactoe'
 * @returns {Object} { canPlay: boolean, reason: string, nextAvailableTime: Date|null }
 */
function checkFreeGameAvailability(user, gameType) {
  const now = new Date();
  const countField = `free_${gameType}_claim_count`;
  const firstClaimField = `free_${gameType}_first_claim_date`;

  const claimCount = user[countField] || 0;
  const firstClaimDate = user[firstClaimField];

  // ГЛАВНАЯ ПРОВЕРКА: Проверяем, прошло ли 2 дня с момента регистрации
  if (user.createdAt) {
    const registrationDate = new Date(user.createdAt);
    const moscowTimeNow = getMoscowTime(now);
    const moscowTimeRegistration = getMoscowTime(registrationDate);

    // Вычисляем количество дней с момента регистрации
    const daysSinceRegistration = Math.floor((moscowTimeNow - moscowTimeRegistration) / (1000 * 60 * 60 * 24));

    // Если прошло более 2 дней с момента регистрации - отказываем в доступе
    if (daysSinceRegistration >= FREE_GAME_PERIOD_DAYS) {
      return {
        canPlay: false,
        reason: `Бесплатные попытки доступны только в первые ${FREE_GAME_PERIOD_DAYS} дня после регистрации`,
        nextAvailableTime: null
      };
    }
  }

  // Если пользователь уже использовал максимальное количество бесплатных попыток
  if (claimCount >= MAX_FREE_ATTEMPTS) {
    return {
      canPlay: false,
      reason: 'Вы уже использовали все бесплатные попытки (2)',
      nextAvailableTime: null
    };
  }

  // Если это первая попытка - разрешаем сразу в любое время
  if (claimCount === 0) {
    return {
      canPlay: true,
      reason: 'Первая бесплатная попытка доступна сразу после регистрации',
      nextAvailableTime: null
    };
  }

  // Если это вторая попытка
  if (claimCount === 1 && firstClaimDate) {
    const firstClaim = new Date(firstClaimDate);
    const moscowTimeNow = getMoscowTime(now);
    const moscowTimeFirstClaim = getMoscowTime(firstClaim);

    // Проверяем, прошло ли 2 дня с момента первой попытки
    const daysDiff = Math.floor((moscowTimeNow - moscowTimeFirstClaim) / (1000 * 60 * 60 * 24));

    if (daysDiff >= FREE_GAME_PERIOD_DAYS) {
      return {
        canPlay: false,
        reason: 'Прошло более 2 дней с момента первой бесплатной попытки',
        nextAvailableTime: null
      };
    }

    // Вычисляем время следующего доступного 16:00 МСК после первой попытки
    const nextAvailable16 = new Date(moscowTimeFirstClaim);
    nextAvailable16.setHours(16, 0, 0, 0);

    // Если первая попытка была после 16:00, берем 16:00 следующего дня
    if (moscowTimeFirstClaim.getHours() >= 16 ||
        (moscowTimeFirstClaim.getHours() === 16 && moscowTimeFirstClaim.getMinutes() > 0)) {
      nextAvailable16.setDate(nextAvailable16.getDate() + 1);
    }

    // Проверяем, наступило ли уже это время
    if (moscowTimeNow < nextAvailable16) {
      return {
        canPlay: false,
        reason: 'Вторая бесплатная попытка будет доступна в 16:00 МСК',
        nextAvailableTime: nextAvailable16
      };
    }

    return {
      canPlay: true,
      reason: 'Вторая бесплатная попытка доступна',
      nextAvailableTime: null
    };
  }

  return {
    canPlay: false,
    reason: 'Неизвестная ошибка',
    nextAvailableTime: null
  };
}

/**
 * Обновляет счетчики бесплатных попыток пользователя для конкретной игры
 * @param {Object} user - объект пользователя из базы данных
 * @param {string} gameType - тип игры: 'safecracker', 'slot', 'tictactoe'
 * @param {Object} transaction - опциональная транзакция Sequelize
 */
async function updateFreeGameCounters(user, gameType, transaction = null) {
  const now = new Date();
  const countField = `free_${gameType}_claim_count`;
  const firstClaimField = `free_${gameType}_first_claim_date`;
  const lastClaimField = `free_${gameType}_last_claim_date`;

  const currentCount = user[countField] || 0;

  const updateData = {};

  if (currentCount === 0) {
    // Первая попытка
    updateData[firstClaimField] = now;
    updateData[lastClaimField] = now;
    updateData[countField] = 1;
  } else {
    // Вторая попытка
    updateData[lastClaimField] = now;
    updateData[countField] = currentCount + 1;
  }

  // ВАЖНО: Используем user.update() с transaction вместо user.save()
  if (transaction) {
    await user.update(updateData, { transaction });
  } else {
    await user.update(updateData);
  }

  // Обновляем локальные значения в объекте user
  Object.assign(user, updateData);
}

module.exports = {
  checkFreeGameAvailability,
  updateFreeGameCounters,
  getMoscowTime,
  MAX_FREE_ATTEMPTS,
  FREE_GAME_PERIOD_DAYS
};
