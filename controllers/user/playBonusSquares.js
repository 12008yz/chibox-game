const db = require('../../models');
const winston = require('winston');
const { addExperience } = require('../../services/xpService');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

async function playBonusSquares(req, res) {
  try {
    const userId = req.user.id;
    const user = await db.User.findByPk(userId);
    const now = new Date();
    // Для тестирования сбрасываем next_bonus_available_time, чтобы бонус был доступен
    user.next_bonus_available_time = new Date(now.getTime() - 1000);
    await user.save();
    const ready = !user.next_bonus_available_time || user.next_bonus_available_time <= now;
    if (!ready) return res.status(400).json({ message: 'Бонус пока недоступен', next_time: user.next_bonus_available_time });

    // Добавляем опыт за игру бонусных клеток
    await addExperience(userId, 5, 'play_bonus_squares', null, 'Игра бонусных клеток');

    const totalSquares = 9;
    const prizes = [ 'item', 'sub_days', null, null, null, null, null, null, null ];
    prizes.sort(() => Math.random() - 0.5);

    const chosenCell = req.body.chosenCell;
    if (typeof chosenCell !== 'number' || chosenCell < 0 || chosenCell >= totalSquares) {
      return res.status(400).json({ message: 'Неверный индекс выбранной клетки' });
    }

    let reward = prizes[chosenCell];
    let rewardMessage = '';

    if (reward === 'item') {
      rewardMessage = 'Вам выпал предмет!';
      // Дополнительный опыт за выигрыш предмета
      await addExperience(userId, 10, 'play_bonus_squares_win', null, 'Выигрыш предмета в бонусной игре');
    } else if (reward === 'sub_days') {
      const bonusDays = 3; // например, 3 дня подписки
      if (!user.subscription_expiry_date || user.subscription_expiry_date < now) {
        // Нет активной подписки, добавляем бонусные дни в pending_subscription_days
        user.pending_subscription_days = (user.pending_subscription_days || 0) + bonusDays;
      } else {
        user.subscription_expiry_date = new Date(user.subscription_expiry_date.getTime() + bonusDays * 86400000);
      }

      // Обновляем поле subscription_days_left
      const msLeft = user.subscription_expiry_date ? user.subscription_expiry_date.getTime() - new Date().getTime() : 0;
      user.subscription_days_left = msLeft > 0 ? Math.ceil(msLeft / 86400000) : 0;

      rewardMessage = `Вам начислено ${bonusDays} дней подписки!`;
      // Сохраняем пользователя после обновления подписки
      await user.save();

      // Дополнительный опыт за выигрыш дней подписки
      await addExperience(userId, 15, 'play_bonus_squares_win', null, 'Выигрыш дней подписки в бонусной игре');

      // Обновляем поле subscription_days_left после сохранения
      // Удаляем повторное объявление переменной msLeft
      const msLeftAfterSave = user.subscription_expiry_date ? user.subscription_expiry_date.getTime() - new Date().getTime() : 0;
      user.subscription_days_left = msLeftAfterSave > 0 ? Math.ceil(msLeftAfterSave / 86400000) : 0;
      await user.save();
    } else {
      rewardMessage = 'Вы ничего не выиграли.';
    }

    user.next_bonus_available_time = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    user.lifetime_bonuses_claimed = (user.lifetime_bonuses_claimed || 0) + 1;
    user.last_bonus_date = now;
    await user.save();

    await db.BonusMiniGameHistory.create({
      user_id: userId,
      played_at: now,
      game_grid: JSON.stringify(prizes),
      chosen_cells: JSON.stringify([chosenCell]),
      won: reward !== null,
      prize_type: reward || 'none',
      prize_value: reward === 'sub_days' ? '3' : null,
    });

    return res.json({ message: rewardMessage, next_time: user.next_bonus_available_time });
  } catch (error) {
    logger.error('Ошибка бонус-миниигры:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  playBonusSquares
};
