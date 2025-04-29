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

async function withdrawBalance(req, res) {
  try {
    const userId = req.user.id;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Некорректная сумма для вывода' });
    }

    const user = await db.User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    if ((user.balance || 0) < amount) {
      return res.status(400).json({ message: 'Недостаточно средств для вывода' });
    }

    await db.Withdrawal.create({
      user_id: userId,
      amount,
      status: 'pending',
      type: 'balance'
    });

    user.balance -= amount;
    await user.save();

    logger.info(`Пользователь ${userId} отправил заявку на вывод баланса на сумму ${amount}`);

    return res.json({ success: true, message: 'Заявка на вывод оформлена' });
  } catch (error) {
    logger.error('Ошибка вывода баланса:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  withdrawBalance
};
