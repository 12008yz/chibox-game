/**
 * Вычисляет время следующего доступного кейса
 * Кейсы для подписчиков выдаются каждый день в 16:00 по МСК
 * @returns {Date} время следующего запуска
 */
function getNextDailyCaseTime() {
  const now = new Date();

  // Конвертируем текущее время в МСК (UTC+3)
  const moscowOffset = 3 * 60; // МСК = UTC+3
  const localOffset = now.getTimezoneOffset(); // Разница с UTC в минутах (отрицательная для восточных часовых поясов)
  const moscowTime = new Date(now.getTime() + (moscowOffset + localOffset) * 60 * 1000);

  // Устанавливаем следующее время выдачи кейсов на 16:00 МСК
  let nextRun = new Date(moscowTime);
  nextRun.setHours(16, 0, 0, 0);

  // Если 16:00 уже прошло сегодня, переносим на следующий день
  if (moscowTime >= nextRun) {
    nextRun.setDate(nextRun.getDate() + 1);
  }

  // Конвертируем обратно в UTC
  const nextRunUTC = new Date(nextRun.getTime() - (moscowOffset + localOffset) * 60 * 1000);

  return nextRunUTC;
}

/**
 * Проверяет, наступило ли время для выдачи ежедневных кейсов
 * @returns {boolean}
 */

/**
 * Форматирует время до следующего кейса для отображения
 * @param {Date} nextCaseTime
 * @returns {string}
 */
function formatTimeUntilNextCase(nextCaseTime) {
  const now = new Date();
  const diff = nextCaseTime.getTime() - now.getTime();

  if (diff <= 0) {
    return 'Доступен';
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  if (hours > 0) {
    return `${hours}ч ${minutes}м ${seconds}с`;
  } else if (minutes > 0) {
    return `${minutes}м ${seconds}с`;
  } else {
    return `${seconds}с`;
  }
}

module.exports = {
  getNextDailyCaseTime,
  formatTimeUntilNextCase
};
