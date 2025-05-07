const db = require('../../models');
const { createLocalPayment, createOnlinePayment } = require('../../services/paymentService');
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

async function buyBonus(req, res) {
  try {
    const userId = req.user.id;
    const { bonusId, method } = req.body;

    // Здесь можно добавить логику получения цены бонуса по bonusId
    // Для примера возьмем фиксированную цену
    const price = 500;

    if (method === 'balance') {
      const user = await db.User.findByPk(userId);
      if ((user.balance || 0) < price) {
        return res.status(400).json({ message: 'Недостаточно средств' });
      }
      user.balance -= price;
      await user.save();

      try {
        await createLocalPayment(price, userId, 'bonus', {
          paymentSystem: 'balance',
          status: 'completed',
          description: `Оплата бонуса через баланс, bonusId ${bonusId}`
        });
      } catch (error) {
        logger.error('Ошибка создания локального платежа через баланс:', error);
        return res.status(500).json({ message: 'Ошибка при создании платежа' });
      }

      // Здесь можно добавить логику активации бонуса для пользователя

      return res.json({ success: true, message: 'Бонус успешно приобретен через баланс' });
    } else if (method === 'card') {
      try {
        const paymentUrl = await createOnlinePayment(price, userId, null, {
          purpose: 'bonus',
          description: `Оплата бонуса bonusId ${bonusId}`
        });
        return res.json({ paymentUrl, message: 'Перенаправьте пользователя для оплаты' });
      } catch (error) {
        logger.error('Ошибка создания платежа через YooMoney:', error);
        return res.status(500).json({ message: 'Ошибка при создании платежа' });
      }
    } else {
      return res.status(400).json({ message: 'Неверный метод оплаты' });
    }
  } catch (error) {
    logger.error('Ошибка покупки бонуса:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  buyBonus
};
