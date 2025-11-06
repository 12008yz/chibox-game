const db = require('../../models');
const winston = require('winston');
const { giveDailyCaseToUser } = require('../../services/caseService');
const { createPayment } = require('../../services/paymentService');
const { updateUserAchievementProgress } = require('../../services/achievementService');
const { activateSubscription } = require('../../services/subscriptionService');
const { addExperience } = require('../../services/xpService');

// Цены в ChiCoins (1 ChiCoin = 1₽)
const subscriptionTiers = {
  1: { days: 30, max_daily_cases: 1, bonus_percentage: 2.0, name: 'Статус', price: 1811 },      // 1800 ChiCoins
  2: { days: 30, max_daily_cases: 1, bonus_percentage: 3.0, name: 'Статус+', price: 3666 },     // 3600 ChiCoins
  3: { days: 30, max_daily_cases: 1, bonus_percentage: 5.0, name: 'Статус++', price: 7580 }     // 7500 ChiCoins
};

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

async function buySubscription(req, res) {
  logger.info('buySubscription start');
  try {
    const userId = req.user.id;
    const { tierId, method, itemId, promoCode } = req.body;
    logger.info(`buySubscription called with userId=${userId}, tierId=${tierId}, method=${method}, itemId=${itemId}, promoCode=${promoCode}`);
    const user = await db.User.findByPk(userId);
    logger.info(`User loaded: ${JSON.stringify(user)}`);
    const tier = subscriptionTiers[tierId];
    if (!tier) {
      logger.warn(`Subscription tier not found: ${tierId}`);
      return res.status(404).json({ message: 'Тариф не найден' });
    }
    logger.info(`Subscription tier found: ${JSON.stringify(tier)}`);

    // ✅ ПРОВЕРКА: запрещаем покупку другого статуса при наличии активной подписки
    const now = new Date();
    const hasActiveSubscription = user.subscription_tier &&
                                   user.subscription_expiry_date &&
                                   user.subscription_expiry_date > now;

    if (hasActiveSubscription && user.subscription_tier !== parseInt(tierId)) {
      logger.warn(`User ${userId} tried to buy different tier ${tierId} while having active tier ${user.subscription_tier}`);
      return res.status(400).json({
        success: false,
        message: `У вас уже есть активная подписка "${subscriptionTiers[user.subscription_tier].name}". Дождитесь окончания текущей подписки или продлите существующую.`,
        current_tier: user.subscription_tier,
        expiry_date: user.subscription_expiry_date
      });
    }

    let price = tier.price || 0;
    let action = 'purchase';
    let exchangeItemId = null;

    if (method === 'balance') {
      logger.info(`Баланс пользователя до покупки: ${user.balance}`);
      if ((user.balance || 0) < price) {
        logger.warn('Недостаточно средств');
        return res.status(400).json({ message: 'Недостаточно средств' });
      }
      user.balance -= price;
      await user.save(); // Сохраняем изменения в базу данных
      logger.info(`Баланс пользователя после покупки: ${user.balance}`);
    } else if (method === 'item') {
      const rule = await db.ItemSubscriptionExchangeRule.findOne({
        where: { item_id: itemId, subscription_tier_id: parseInt(tierId) },
      });
      if (!rule) {
        logger.warn('Нельзя обменять данный предмет');
        return res.status(400).json({ message: 'Нельзя обменять данный предмет' });
      }
      const inventoryItem = await db.UserInventory.findOne({ where: { userId, itemId } });
      if (!inventoryItem) {
        logger.warn('У пользователя нет предмета');
        return res.status(404).json({ message: 'У пользователя нет предмета' });
      }
      exchangeItemId = itemId;
      price = 0;
      action = 'exchange_item';
      await inventoryItem.destroy();
    } else if (method === 'promo') {
      action = 'promo';
    } else if (method === 'bank_card') {
      // Создаем платеж через YooMoney и возвращаем ссылку на оплату
      try {
        logger.info('Создание платежа через YooMoney');
        const paymentResult = await createPayment({
          amount: price,
          description: `Статус ${tier.name} на ${tier.days} дней`,
          userId: userId,
          purpose: 'subscription',
          metadata: { tierId },
          paymentMethod: 'yookassa'
        });

        if (!paymentResult.success) {
          logger.error('Ошибка создания платежа:', paymentResult.error);
          return res.status(500).json({
            success: false,
            message: 'Ошибка при создании платежа'
          });
        }

        logger.info(`Платеж создан, paymentUrl: ${paymentResult.paymentUrl}`);

        // Получаем актуальные данные пользователя для возврата
        const updatedUser = await db.User.findByPk(userId);

        return res.json({
          success: true,
          data: {
            paymentUrl: paymentResult.paymentUrl
          },
          message: 'Перенаправьте пользователя для оплаты',
          subscription_purchase_date: updatedUser.subscription_purchase_date,
          subscription_expiry_date: updatedUser.subscription_expiry_date,
          subscription_tier: updatedUser.subscription_tier
        });
      } catch (error) {
        logger.error('Ошибка создания платежа через YooMoney:', error);
        return res.status(500).json({
          success: false,
          message: 'Ошибка при создании платежа'
        });
      }
    }

    // Проверяем наличие активного промокода с типом 'subscription_extend' для пользователя
    let promoExtendDays = 0;
    const promoCodeUser = await db.PromoCodeUser.findOne({
      where: { user_id: userId, is_used: false },
      include: [{
        model: db.PromoCode,
        as: 'promo_code',
        where: { type: 'subscription_extend', is_active: true }
      }]
    });
    if (promoCodeUser) {
      promoExtendDays = 3; // Добавляем 3 дня к подписке
      // Отмечаем промокод как использованный
      promoCodeUser.is_used = true;
      await promoCodeUser.save();

      // Создаем запись о применении промокода в PromoCodeUsage
      try {
        await db.PromoCodeUsage.create({
          promo_code_id: promoCodeUser.promo_code_id,
          user_id: userId,
          usage_date: new Date(),
          applied_value: 3,
          subscription_days_added: 3,
          status: 'applied'
        });
      } catch (error) {
        logger.error('Ошибка при создании записи PromoCodeUsage:', error);
      }
    }

    if (method !== 'bank_card') {
      // Перед активацией подписки добавляем pending_subscription_days, если есть
      // Обновляем user объект вместо загрузки нового
      let totalExtraDays = promoExtendDays + (user.pending_subscription_days || 0);
      if (totalExtraDays > 0) {
        // Обнуляем pending_subscription_days
        user.pending_subscription_days = 0;
        await user.save();
      }
      await activateSubscription(userId, parseInt(tierId), totalExtraDays);
      // Заново загружаем пользователя, чтобы получить обновленные данные подписки
      const updatedUser = await db.User.findByPk(userId);
      user.subscription_expiry_date = updatedUser.subscription_expiry_date;
      user.subscription_tier = updatedUser.subscription_tier;
      user.subscription_purchase_date = updatedUser.subscription_purchase_date;
      user.max_daily_cases = updatedUser.max_daily_cases;
      user.subscription_bonus_percentage = updatedUser.subscription_bonus_percentage;
      user.cases_available = updatedUser.cases_available;
      // Сохраняем баланс из нашего объекта user, чтобы не потерять изменения
      user.balance = method === 'balance' ? user.balance : updatedUser.balance;
    }

    await db.SubscriptionHistory.create({
      user_id: userId,
      action,
      days: tier.days + promoExtendDays,
      price,
      item_id: exchangeItemId,
      method: method,
      date: new Date()
    });
    logger.info(`Пользователь ${userId} приобрёл подписку tier=${tierId}`);

    // Добавление опыта за покупку подписки
    await addExperience(userId, 50, 'buy_subscription', null, 'Покупка подписки');

    // Создание уведомления о покупке подписки
    await db.Notification.create({
      user_id: userId,
      title: 'Покупка подписки',
      message: `Вы успешно приобрели подписку "${tier.name}" на ${tier.days} дней.`,
      type: 'success',
      category: 'subscription',
      link: '/subscription',
      importance: 5,
      data: {
        tierId: tierId,
        days: tier.days + promoExtendDays
      }
    });

    logger.info('buySubscription end');
    return res.json({
      success: true,
      tier: {
        id: parseInt(tierId),
        name: tier.name,
        expiry_date: user.subscription_expiry_date,
        bonus: tier.bonus_percentage,
        max_daily_cases: tier.max_daily_cases
      },
      balance: user.balance,
      message: 'Статус успешно активирован'
    });
  } catch (error) {
    logger.error('Ошибка покупки подписки:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  buySubscription
};
