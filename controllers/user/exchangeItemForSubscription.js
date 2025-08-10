const { UserInventory, User, Achievement, SubscriptionHistory, sequelize } = require('../../models');

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
    // Найти предмет в инвентаре пользователя с статусом 'inventory'
    const inventoryItem = await UserInventory.findOne({
      where: {
        user_id: userId,
        item_id: itemId,
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

    // Получить стоимость предмета в рублях
    const itemPrice = parseFloat(inventoryItem.item.price || 0);
    console.log(`Item price: ${itemPrice} rubles`);

    // Определяем цену за день в зависимости от текущего тарифа подписки
    let pricePerDay;
    const currentTier = user.subscription_tier || 1; // По умолчанию тариф 1

    if (currentTier === 3) {
      pricePerDay = 300; // 300₽ за день для тарифа "Статус++"
    } else {
      pricePerDay = 150; // 150₽ за день для тарифов "Статус" и "Статус+"
    }

    console.log(`Using price per day: ${pricePerDay}₽ for tier ${currentTier}`);

    // Вычисляем количество дней подписки с правильной логикой
    // Для тарифа 3: 280-300₽ = 1 день, 580-600₽ = 2 дня и т.д.
    // Для тарифов 1,2: 140-150₽ = 1 день, 290-300₽ = 2 дня и т.д.
    const subscriptionDays = Math.floor((itemPrice + pricePerDay * 0.067) / pricePerDay);

    console.log(`Calculated subscription days: ${subscriptionDays} for item price ${itemPrice} (formula: floor((${itemPrice} + ${pricePerDay * 0.067}) / ${pricePerDay})) for tier ${currentTier}`);

    // Минимальная проверка: предмет должен давать минимум 1 день
    const minPrice = Math.floor(pricePerDay * 0.93); // ~93% от цены за день
    if (subscriptionDays < 1 || itemPrice < minPrice) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Предмет слишком дешевый для обмена. Минимальная стоимость для тарифа ${currentTier}: ${minPrice}₽ (стоимость предмета: ${itemPrice}₽)`,
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

    // Если нет текущей подписки, установить минимальный тариф (1)
    if (!user.subscription_tier || user.subscription_tier === 0) {
      user.subscription_tier = 1;
      user.subscription_purchase_date = now;
    }

    // Получаем текущие дни подписки более точно
    let currentDaysLeft = 0;
    if (user.subscription_expiry_date && user.subscription_expiry_date > now) {
      const msLeft = user.subscription_expiry_date.getTime() - now.getTime();
      currentDaysLeft = Math.max(0, Math.floor(msLeft / (24 * 60 * 60 * 1000)));
    }

    console.log(`Current subscription days left: ${currentDaysLeft}, adding: ${subscriptionDays}`);

    // Просто добавляем дни к текущему количеству
    const newDaysTotal = currentDaysLeft + subscriptionDays;

    // Устанавливаем новую дату истечения от текущего момента
    user.subscription_expiry_date = new Date(now.getTime() + (newDaysTotal * 24 * 60 * 60 * 1000));
    user.subscription_days_left = newDaysTotal;

    await user.save({ transaction });

    // Записываем историю обмена в SubscriptionHistory
    await SubscriptionHistory.create({
      user_id: userId,
      action: 'exchange_item',
      days: subscriptionDays,
      price: 0.00, // Обмен бесплатный
      item_id: inventoryItem.item.id,
      method: 'item_exchange',
      date: now
    }, { transaction });

    // Обновляем прогресс достижений
    const { updateUserAchievementProgress } = require('../../services/achievementService');
    await updateUserAchievementProgress(userId, 'exchange_item', 1);

    await transaction.commit();

    // Создание уведомления о обмене предмета на подписку
    await require('../../models').Notification.create({
      user_id: userId,
      title: 'Обмен предмета на подписку',
      message: `Вы успешно обменяли предмет "${inventoryItem.item.name}" на ${subscriptionDays} дней подписки.`,
      type: 'success',
      category: 'subscription',
      importance: 5,
      data: {
        itemId: itemId,
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
    console.error('Ошибка обмена предмета на подписку:', error);
    return res.status(500).json({ message: 'Ошибка обмена предмета на подписку' });
  }
}

module.exports = { exchangeItemForSubscription };
