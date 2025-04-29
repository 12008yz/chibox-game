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

async function applyPromo(req, res) {
  try {
    const userId = req.user.id;
    const { code } = req.body;

    const promo = await db.PromoCode.findOne({ where: { code, active: true } });
    if (!promo) {
      return res.status(404).json({ message: 'Промокод не найден или неактивен' });
    }

    const usage = await db.PromoCodeUsage.findOne({ where: { user_id: userId, promoCodeId: promo.id } });
    if (usage) {
      return res.status(400).json({ message: 'Промокод уже использован' });
    }

    const user = await db.User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    user.balance = (user.balance || 0) + promo.bonusAmount;
    await user.save();

    await db.PromoCodeUsage.create({
      user_id: userId,
      promoCodeId: promo.id,
      usedAt: new Date()
    });

    logger.info(`Пользователь ${userId} применил промокод ${code}`);

    return res.json({ success: true, message: 'Промокод успешно применён' });
  } catch (error) {
    logger.error('Ошибка применения промокода:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  applyPromo
};
