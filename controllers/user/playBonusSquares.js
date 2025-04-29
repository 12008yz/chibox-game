const db = require('../../models');
const winston = require('winston');

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
    const ready = !user.next_bonus_available_time || user.next_bonus_available_time <= now;
    if (!ready) return res.status(400).json({ message: 'Бонус пока недоступен', next_time: user.next_bonus_available_time });

    const totalSquares = 9;
    const prizes = [ 'item', 'balance', null, null, null, null, null, null, null ];
    prizes.sort(() => Math.random() - 0.5);

    const wonIndexes = prizes
      .map((val, idx) => ({ val, idx }))
      .filter(({ val }) => !!val)
      .map(({ idx }) => idx);

    let rewardMessage = '';
    if (prizes[wonIndexes[0]] === 'item') {
      rewardMessage = 'Вам выпал предмет!';
    } else if (prizes[wonIndexes[0]] === 'balance') {
      user.balance = (user.balance || 0) + 50;
      rewardMessage = 'Вам начислено 50 на баланс!';
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
      reward: rewardMessage
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
