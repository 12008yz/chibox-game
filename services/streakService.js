const { updateUserAchievementProgress } = require('./achievementService');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Возвращает строку даты YYYY-MM-DD для переданной даты (локальная полночь).
 */
function toDateOnly(d) {
  const date = d instanceof Date ? d : new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Обновляет ежедневную серию по факту "визита" на сайт (новый календарный день).
 * Вызывать при любом обращении под авторизованным пользователем (например GET /profile).
 * Один раз в день засчитывается один визит; повторные запросы в тот же день серию не меняют.
 *
 * @param {Object} user - инстанс User с полями id, daily_streak, max_daily_streak, last_streak_activity_date
 * @param {Date} [now] - текущее время (по умолчанию new Date())
 * @returns {Promise<boolean>} - true если серия была обновлена
 */
async function updateStreakByVisit(user, now = new Date()) {
  const todayStr = toDateOnly(now);
  const lastStr = user.last_streak_activity_date
    ? toDateOnly(new Date(user.last_streak_activity_date + 'T12:00:00'))
    : null;

  if (lastStr === todayStr) {
    return false; // уже учли визит сегодня
  }

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - MS_PER_DAY);
  const yesterdayStr = toDateOnly(yesterdayStart);

  let newStreak = 1;
  if (!lastStr) {
    newStreak = 1;
  } else if (lastStr === yesterdayStr) {
    newStreak = (user.daily_streak || 0) + 1;
  }
  const newMax = Math.max(user.max_daily_streak || 0, newStreak);

  user.daily_streak = newStreak;
  user.max_daily_streak = newMax;
  user.last_streak_activity_date = todayStr;
  await user.save({ fields: ['daily_streak', 'max_daily_streak', 'last_streak_activity_date'] });

  try {
    await updateUserAchievementProgress(user.id, 'daily_streak', newStreak);
  } catch (err) {
    console.error('Ошибка обновления достижений по daily_streak:', err);
  }

  return true;
}

module.exports = {
  updateStreakByVisit,
  toDateOnly
};
