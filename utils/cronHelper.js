/**
 * Вычисляет время следующего запуска cron задачи dailyCaseIssuer
 * Cron: '41 18 * * *' - каждый день в 18:41 UTC (21:41 МСК)
 * @returns {Date} время следующего запуска
 */
function getNextDailyCaseTime() {
  const now = new Date();
  const nextRun = new Date();

  // Устанавливаем время на 18:41 UTC (21:41 МСК)
  nextRun.setUTCHours(18, 41, 0, 0);

  // Если время уже прошло сегодня, переносим на завтра
  if (nextRun <= now) {
    nextRun.setUTCDate(nextRun.getUTCDate() + 1);
  }

  return nextRun;
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
