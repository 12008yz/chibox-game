const { UserInventory, User, Achievement, SubscriptionHistory, sequelize } = require('../../models');
const { grantGameAttemptsForTier } = require('../../services/subscriptionService');
const { logger } = require('../../utils/logger');
const isExchangeDebugEnabled = process.env.DEBUG_EXCHANGE === 'true';

function debugLog(...args) {
  if (isExchangeDebugEnabled) {
    logger.info(...args);
  }
}

async function exchangeItemForSubscription(req, res) {
  const { userId, itemId } = req.body;

  if (!userId) {
    return res.status(400).json({ message: 'userId не указан' });
  }
  if (!itemId) {
    return res.status(400).json({ message: 'itemId не указан' });
  }

  const transaction = await sequelize.transaction();

  try {
    // Найти конкретный экземпляр предмета в инвентаре пользователя
    const inventoryItem = await UserInventory.findOne({
      where: {
        id: itemId,  // ID конкретного экземпляра в инвентаре
        user_id: userId,
        status: 'inventory',
      },
      include: [{
        association: 'item',
        required: true
      }],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!inventoryItem) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Нет такого предмета для обмена' });
    }

    // Получить пользователя и определить тариф
    const user = await User.findByPk(userId, { transaction });

    // Получить стоимость предмета в ChiCoins
    const itemPrice = parseFloat(inventoryItem.item.price || 0);
    debugLog(`Item price: ${itemPrice} ChiCoins`);

    // Определяем цену за день в зависимости от текущего тарифа подписки
    let pricePerDay;
    const currentTier = user.subscription_tier || 1; // По умолчанию тариф 1

    if (currentTier === 3) {
      pricePerDay = 160; // 800 ChiCoins / 5 дней
    } else if (currentTier === 2) {
      pricePerDay = 100; // 500 ChiCoins / 5 дней
    } else {
      pricePerDay = 60; // 300 ChiCoins / 5 дней
    }

    debugLog(`Using price per day: ${pricePerDay} ChiCoins for tier ${currentTier}`);

    // Вычисляем количество дней подписки с правильной логикой (оптимизировано)
    // Расчет согласован с новыми тарифами:
    // Статус (300/5): ~60 ChiCoins за день
    // Статус+ (500/5): ~100 ChiCoins за день
    // Статус++ (800/5): ~160 ChiCoins за день
    const subscriptionDays = Math.floor((itemPrice + pricePerDay * 0.067) / pricePerDay);

    debugLog(`Calculated subscription days: ${subscriptionDays} for item price ${itemPrice} (formula: floor((${itemPrice} + ${pricePerDay * 0.067}) / ${pricePerDay})) for tier ${currentTier}`);

    // Минимальная проверка: предмет должен давать минимум 1 день
    const minPrice = Math.floor(pricePerDay * 0.93); // ~93% от цены за день
    if (subscriptionDays < 1 || itemPrice < minPrice) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Предмет слишком дешевый для обмена. Минимальная стоимость для тарифа ${currentTier}: ${minPrice} ChiCoins (стоимость предмета: ${itemPrice} ChiCoins)`,
        required_price: minPrice,
        item_price: itemPrice,
        tier: currentTier,
        price_per_day: pricePerDay
      });
    }

    // Обновить статус предмета
    inventoryItem.status = 'used';
    await inventoryItem.save({ transaction });

    // Получаем текущие дни подписки более точно
    const now = new Date();
    const { snapshotSubscriptionPrior, normalizeSubscriptionStreakAfterChange } = require('../../utils/subscriptionStreak');
    const priorSub = snapshotSubscriptionPrior(user);

    // Если нет текущей подписки, установить минимальный тариф (1)
    if (!user.subscription_tier || user.subscription_tier === 0) {
      user.subscription_tier = 1;
      user.subscription_purchase_date = now;
    }

    // Правильная логика добавления дней к подписке
    let newExpiryDate;
    let newDaysLeft;

    if (user.subscription_expiry_date && user.subscription_expiry_date > now) {
      // Если подписка активна, добавляем дни к существующей дате истечения
      newExpiryDate = new Date(user.subscription_expiry_date.getTime() + (subscriptionDays * 24 * 60 * 60 * 1000));

      // Пересчитываем дни от текущего момента до новой даты истечения
      const msLeft = newExpiryDate.getTime() - now.getTime();
      newDaysLeft = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000))); // Используем ceil для округления вверх
    } else {
      // Если подписка неактивна, устанавливаем от текущего момента
      newExpiryDate = new Date(now.getTime() + (subscriptionDays * 24 * 60 * 60 * 1000));
      newDaysLeft = subscriptionDays;
    }

    debugLog(`Adding ${subscriptionDays} days. New expiry: ${newExpiryDate}, days left: ${newDaysLeft}`);

    user.subscription_expiry_date = newExpiryDate;
    user.subscription_days_left = newDaysLeft;

    normalizeSubscriptionStreakAfterChange(user, now, priorSub);

    // Выдаём попытки игр по текущему тарифу (крестики-нолики, сейф, рулетка), чтобы после обмена на статус пользователь мог сразу играть
    const tierForAttempts = user.subscription_tier || 1;
    grantGameAttemptsForTier(user, tierForAttempts);

    await user.save({ transaction });

    // Записываем историю обмена в SubscriptionHistory
    await SubscriptionHistory.create({
      user_id: userId,
      action: 'exchange_item',
      days: subscriptionDays,
      price: 0.00, // Обмен бесплатный
      item_id: inventoryItem.item.id,  // ID шаблона предмета для истории
      method: 'item_exchange',
      date: now
    }, { transaction });

    // Коммитим транзакцию ПЕРЕД обновлением достижений
    await transaction.commit();

    // Обновляем прогресс достижений ПОСЛЕ коммита (не критично для основной операции)
    try {
      const { updateUserAchievementProgress } = require('../../services/achievementService');
      await updateUserAchievementProgress(userId, 'exchange_item', 1);
      await updateUserAchievementProgress(userId, 'subscription_days', 0);
    } catch (achievementError) {
      logger.error('Ошибка при обновлении достижений (не критично):', achievementError);
      // Продолжаем выполнение, так как основная операция уже завершена
    }

    // Создание уведомления о обмене предмета на подписку
    await require('../../models').Notification.create({
      user_id: userId,
      title: 'Обмен предмета на подписку',
      message: `Вы успешно обменяли предмет "${inventoryItem.item.name}" на ${subscriptionDays} дней подписки.`,
      type: 'success',
      category: 'subscription',
      importance: 5,
      data: {
        itemId: inventoryItem.item.id,  // ID шаблона предмета для уведомления
        item_name: inventoryItem.item.name,
        item_price: itemPrice,
        subscription_days_added: subscriptionDays,
        subscription_expiry_date: user.subscription_expiry_date
      }
    });

    return res.json({
      success: true,
      message: 'Обмен предмета на подписку выполнен успешно',
      data: {
        subscription_days_added: subscriptionDays,
        subscription_days_left: user.subscription_days_left,
        subscription_expiry_date: user.subscription_expiry_date,
        item_name: inventoryItem.item.name,
        item_price: itemPrice
      }
    });
  } catch (error) {
    await transaction.rollback();
    logger.error('Ошибка обмена предмета на подписку:', error);
    return res.status(500).json({ message: 'Ошибка обмена предмета на подписку' });
  }
}

module.exports = { exchangeItemForSubscription };
