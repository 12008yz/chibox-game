/**
 * Вычисляет время следующего доступного кейса
 * ИЗМЕНЕНО: Теперь кейсы доступны каждые 10 секунд вместо 24 часов
 * @returns {Date} время следующего запуска
 */
function getNextDailyCaseTime() {
  const now = new Date();
  const nextRun = new Date(now.getTime() + 10 * 1000); // Добавляем 10 секунд

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
