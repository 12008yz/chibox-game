const FREE_CASE_TEMPLATE_ID = '11111111-1111-1111-1111-111111111111';
const MAX_FREE_CASES = 2; // Максимальное количество бесплатных кейсов
const FREE_CASE_PERIOD_DAYS = 2; // Период в днях для получения бесплатных кейсов

/**
 * Проверяет, может ли пользователь открыть бесплатный кейс
 * @param {Object} user - объект пользователя из базы данных
 * @returns {Object} { canClaim: boolean, reason: string, nextAvailableTime: Date|null }
 */
function checkFreeCaseAvailability(user) {
  const now = new Date();

  // Если пользователь уже открыл максимальное количество бесплатных кейсов
  if (user.free_case_claim_count >= MAX_FREE_CASES) {
    return {
      canClaim: false,
      reason: 'Вы уже открыли максимальное количество бесплатных кейсов (2)',
      nextAvailableTime: null
    };
  }

  // Если это первое открытие - разрешаем сразу в любое время
  if (user.free_case_claim_count === 0) {
    return {
      canClaim: true,
      reason: 'Первый бесплатный кейс доступен сразу после регистрации',
      nextAvailableTime: null
    };
  }

  // Если это второе открытие
  if (user.free_case_claim_count === 1 && user.free_case_first_claim_date) {
    const firstClaimDate = new Date(user.free_case_first_claim_date);
    const moscowTimeNow = getMoscowTime(now);
    const moscowTimeFirstClaim = getMoscowTime(firstClaimDate);

    // Проверяем, прошло ли 2 дня с момента первого открытия
    const daysDiff = Math.floor((moscowTimeNow - moscowTimeFirstClaim) / (1000 * 60 * 60 * 24));

    if (daysDiff >= FREE_CASE_PERIOD_DAYS) {
      return {
        canClaim: false,
        reason: 'Прошло более 2 дней с момента первого открытия бесплатного кейса',
        nextAvailableTime: null
      };
    }

    // Вычисляем время следующего доступного 16:00 МСК после первого открытия
    const nextAvailable16 = new Date(moscowTimeFirstClaim);
    nextAvailable16.setHours(16, 0, 0, 0);

    // Если первое открытие было после 16:00, берем 16:00 следующего дня
    if (moscowTimeFirstClaim.getHours() >= 16 ||
        (moscowTimeFirstClaim.getHours() === 16 && moscowTimeFirstClaim.getMinutes() > 0)) {
      nextAvailable16.setDate(nextAvailable16.getDate() + 1);
    }

    // Проверяем, наступило ли уже это время
    if (moscowTimeNow < nextAvailable16) {
      return {
        canClaim: false,
        reason: 'Второй бесплатный кейс будет доступен в 16:00 МСК',
        nextAvailableTime: nextAvailable16
      };
    }

    return {
      canClaim: true,
      reason: 'Второй бесплатный кейс доступен',
      nextAvailableTime: null
    };
  }

  return {
    canClaim: false,
    reason: 'Неизвестная ошибка',
    nextAvailableTime: null
  };
}

/**
 * Обновляет счетчики бесплатных кейсов пользователя
 * @param {Object} user - объект пользователя из базы данных
 */
async function updateFreeCaseCounters(user) {
  const now = new Date();

  if (user.free_case_claim_count === 0) {
    // Первое открытие
    user.free_case_first_claim_date = now;
    user.free_case_last_claim_date = now;
    user.free_case_claim_count = 1;
  } else {
    // Второе открытие
    user.free_case_last_claim_date = now;
    user.free_case_claim_count += 1;
  }

  await user.save();
}

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

module.exports = {
  FREE_CASE_TEMPLATE_ID,
  checkFreeCaseAvailability,
  updateFreeCaseCounters,
  getMoscowTime
};
