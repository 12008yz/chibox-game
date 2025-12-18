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
    const { promo_code } = req.body;

    if (!promo_code || !promo_code.trim()) {
      return res.status(400).json({ success: false, message: 'Промокод не указан' });
    }

    const code = promo_code.trim().toUpperCase();

    // Проверка активности промокода
    const promo = await db.PromoCode.findOne({ where: { code, is_active: true } });
    if (!promo) {
      return res.status(404).json({ success: false, message: 'Промокод не найден или неактивен' });
    }

    // Проверка даты действия
    const now = new Date();
    if (promo.start_date && new Date(promo.start_date) > now) {
      return res.status(400).json({ success: false, message: 'Промокод еще не активен' });
    }
    if (promo.end_date && new Date(promo.end_date) < now) {
      return res.status(400).json({ success: false, message: 'Срок действия промокода истек' });
    }

    // Проверка максимального количества использований
    if (promo.max_usages && promo.usage_count >= promo.max_usages) {
      return res.status(400).json({ success: false, message: 'Достигнут лимит использований промокода' });
    }

    // Проверка использования пользователем
    const usageCount = await db.PromoCodeUsage.count({
      where: {
        user_id: userId,
        promo_code_id: promo.id
      }
    });

    if (usageCount >= promo.max_usages_per_user) {
      return res.status(400).json({ success: false, message: 'Вы уже использовали этот промокод' });
    }

    const user = await db.User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Пользователь не найден' });
    }

    // Проверка минимального уровня пользователя
    if (promo.min_user_level && user.level < promo.min_user_level) {
      return res.status(400).json({
        success: false,
        message: `Для использования этого промокода требуется минимум ${promo.min_user_level} уровень`
      });
    }

    let message = 'Промокод успешно применён!';
    const value = parseFloat(promo.value);

    // Применение промокода в зависимости от типа
    switch (promo.type) {
      case 'balance_add':
        user.balance = (user.balance || 0) + value;
        message = `Промокод применён! Вы получили ${value} ChiCoins`;
        break;

      case 'subscription_extend':
        user.subscription_days_left = (user.subscription_days_left || 0) + Math.floor(value);
        if (user.subscription_tier === 0) {
          user.subscription_tier = promo.subscription_tier || 1;
        }
        message = `Промокод применён! Подписка продлена на ${Math.floor(value)} дней`;
        break;

      case 'case_bonus':
        // Добавляем бонусные кейсы - можно реализовать позже
        message = `Промокод применён! Вы получили ${Math.floor(value)} бонусных кейсов`;
        break;

      default:
        return res.status(400).json({ success: false, message: 'Неподдерживаемый тип промокода' });
    }

    await user.save();

    // Создание записи об использовании
    await db.PromoCodeUsage.create({
      user_id: userId,
      promo_code_id: promo.id,
      usage_date: new Date(),
      applied_value: value,
      status: 'applied'
    });

    // Обновление счетчика использований
    await promo.increment('usage_count');

    logger.info(`Пользователь ${userId} применил промокод ${code}, тип: ${promo.type}, значение: ${value}`);

    return res.json({ success: true, message });
  } catch (error) {
    logger.error('Ошибка применения промокода:', error);
    return res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  applyPromo
};
