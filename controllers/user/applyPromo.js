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
const isPromoDebugEnabled = process.env.DEBUG_PROMO === 'true';
function debugLog(...args) {
  if (isPromoDebugEnabled) {
    logger.info(...args);
  }
}

async function applyPromo(req, res) {
  const transaction = await db.sequelize.transaction();

  try {
    const userId = req.user.id;
    const { promo_code } = req.body;

    if (!promo_code || !promo_code.trim()) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Промокод не указан' });
    }

    const code = promo_code.trim().toUpperCase();

    // Проверка активности промокода (включая category для deposit-промокодов)
    const promo = await db.PromoCode.findOne({ where: { code, is_active: true }, transaction });
    if (!promo) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Промокод не найден или неактивен' });
    }

    // Проверка даты действия
    const now = new Date();
    if (promo.start_date && new Date(promo.start_date) > now) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Промокод еще не активен' });
    }
    if (promo.end_date && new Date(promo.end_date) < now) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Срок действия промокода истек' });
    }

    // Проверка максимального количества использований
    if (promo.max_usages && promo.usage_count >= promo.max_usages) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Достигнут лимит использований промокода' });
    }

    // Проверка использования пользователем
    const usageCount = await db.PromoCodeUsage.count({
      where: {
        user_id: userId,
        promo_code_id: promo.id
      },
      transaction
    });

    if (usageCount >= promo.max_usages_per_user) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Вы уже использовали этот промокод' });
    }

    const user = await db.User.findByPk(userId, { transaction });
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Пользователь не найден' });
    }

    // Проверка минимального уровня пользователя
    if (promo.min_user_level && user.level < promo.min_user_level) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Для использования этого промокода требуется минимум ${promo.min_user_level} уровень`
      });
    }

    let message = 'Промокод успешно применён!';
    const value = parseFloat(promo.value);
    const balanceBefore = parseFloat(user.balance) || 0;
    let balanceAfter = balanceBefore;

    // Применение промокода в зависимости от типа
    switch (promo.type) {
      case 'balance_add':
        balanceAfter = balanceBefore + value;
        user.balance = balanceAfter;
        message = `Промокод применён! Вы получили ${value} ChiCoins`;

        // Создаем транзакцию
        await db.Transaction.create({
          user_id: userId,
          type: 'promo_code',
          amount: value,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          description: `Промокод ${code}: ${promo.description || 'бонус'}`,
          status: 'completed'
        }, { transaction });

        debugLog(`Баланс пользователя ${userId}: ${balanceBefore} -> ${balanceAfter} (промокод ${code})`);
        break;

      case 'balance_percentage':
        // Промокоды пополнения (category === 'deposit'): не списываем и не потребляем — бонус % применится при успешной оплате
        if (promo.category === 'deposit') {
          const minPayment = promo.min_payment_amount != null ? parseFloat(promo.min_payment_amount) : 0;
          await transaction.commit();
          return res.json({
            success: true,
            message: `Промокод активирован! При пополнении от ${minPayment} ChiCoins вы получите +${value}% к сумме пополнения.`,
            data: {
              is_deposit_bonus: true,
              bonus_percent: value,
              min_payment_amount: minPayment,
              newBalance: balanceBefore,
              addedAmount: 0
            }
          });
        }
        // Старое поведение для не-deposit: процент от текущего баланса
        const percentageBonus = (balanceBefore * value) / 100;
        balanceAfter = balanceBefore + percentageBonus;
        user.balance = balanceAfter;
        message = `Промокод применён! Вы получили +${value}% к балансу (${percentageBonus.toFixed(2)} ChiCoins)`;

        await db.Transaction.create({
          user_id: userId,
          type: 'promo_code',
          amount: percentageBonus,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          description: `Промокод ${code}: +${value}% к балансу`,
          status: 'completed'
        }, { transaction });

        debugLog(`Баланс пользователя ${userId}: ${balanceBefore} -> ${balanceAfter} (промокод ${code}, +${value}%)`);
        break;

      case 'subscription_extend': {
        const addedDays = Math.floor(value);
        if (addedDays <= 0) {
          await transaction.rollback();
          return res.status(400).json({ success: false, message: 'Некорректное значение дней для продления подписки' });
        }

        const { snapshotSubscriptionPrior, normalizeSubscriptionStreakAfterChange } = require('../../utils/subscriptionStreak');
        const priorSub = snapshotSubscriptionPrior(user);

        // Если не было подписки — включаем минимальный/заданный тариф
        if (!user.subscription_tier || user.subscription_tier === 0) {
          user.subscription_tier = promo.subscription_tier || 1;
        }

        // Продлеваем по дате истечения, чтобы всё было консистентно
        const nowForSub = new Date();
        const MS_PER_DAY = 24 * 60 * 60 * 1000;
        let baseExpiry = user.subscription_expiry_date ? new Date(user.subscription_expiry_date) : null;

        if (!baseExpiry || baseExpiry <= nowForSub) {
          baseExpiry = new Date(nowForSub.getTime());
          user.subscription_purchase_date = user.subscription_purchase_date || nowForSub;
        }

        const newExpiry = new Date(baseExpiry.getTime() + addedDays * MS_PER_DAY);
        const msLeft = newExpiry.getTime() - nowForSub.getTime();
        const newDaysLeft = msLeft > 0 ? Math.ceil(msLeft / MS_PER_DAY) : 0;

        user.subscription_expiry_date = newExpiry;
        user.subscription_days_left = newDaysLeft;

        normalizeSubscriptionStreakAfterChange(user, nowForSub, priorSub);

        message = `Промокод применён! Подписка продлена на ${addedDays} дней`;
        break;
      }

      case 'case_bonus':
        // Добавляем бонусные кейсы - можно реализовать позже
        message = `Промокод применён! Вы получили ${Math.floor(value)} бонусных кейсов`;
        break;

      default:
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'Неподдерживаемый тип промокода' });
    }

    await user.save({ transaction });

    // Создание записи об использовании
    await db.PromoCodeUsage.create({
      user_id: userId,
      promo_code_id: promo.id,
      usage_date: new Date(),
      applied_value: value,
      status: 'applied'
    }, { transaction });

    // Обновление счетчика использований
    await promo.increment('usage_count', { transaction });

    await transaction.commit();

    if (promo.type === 'subscription_extend') {
      try {
        const { updateUserAchievementProgress } = require('../../services/achievementService');
        await updateUserAchievementProgress(userId, 'subscription_days', 0);
      } catch (e) {
        logger.error('subscription_days achievement sync after promo:', e);
      }
    }

    debugLog(`Пользователь ${userId} применил промокод ${code}, тип: ${promo.type}, значение: ${value}`);

    return res.json({
      success: true,
      message,
      data: {
        newBalance: balanceAfter,
        addedAmount: value
      }
    });
  } catch (error) {
    await transaction.rollback();
    logger.error('Ошибка применения промокода:', error);
    return res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  applyPromo
};
