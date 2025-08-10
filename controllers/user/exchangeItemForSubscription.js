const { UserInventory, User, Achievement, sequelize } = require('../../models');

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

    // Получить стоимость предмета в рублях
    const itemPrice = parseFloat(inventoryItem.item.price || 0);
    console.log(`Item price: ${itemPrice} rubles`);

    // Базовая стоимость 1 дня подписки (средняя стоимость по тарифам)
    // Тариф 1: 1210₽ за 30 дней = 40.33₽/день
    // Тариф 2: 2890₽ за 30 дней = 96.33₽/день
    // Тариф 3: 6819₽ за 30 дней = 227.3₽/день
    // Используем среднее значение: примерно 120₽ за 1 день
    const pricePerDay = 120;

    // Вычисляем количество дней подписки
    const subscriptionDays = Math.floor(itemPrice / pricePerDay);
    console.log(`Calculated subscription days: ${subscriptionDays} for item price ${itemPrice}`);

    // Минимальная проверка: предмет должен стоить минимум 1 день подписки
    if (subscriptionDays < 1) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Предмет слишком дешевый для обмена. Минимальная стоимость: ${pricePerDay}₽ (стоимость предмета: ${itemPrice}₽)`,
        required_price: pricePerDay,
        item_price: itemPrice
      });
    }

    // Обновить статус предмета
    inventoryItem.status = 'used';
    await inventoryItem.save({ transaction });

    // Получить пользователя и обновить подписку
    const user = await User.findByPk(userId, { transaction });
    const now = new Date();

    // Если нет текущей подписки, установить минимальный тариф (1)
    if (!user.subscription_tier || user.subscription_tier === 0) {
      user.subscription_tier = 1;
      user.subscription_purchase_date = now;
    }

    // Обновляем дату истечения подписки
    if (user.subscription_expiry_date && user.subscription_expiry_date > now) {
      // Если подписка ещё активна, добавляем дни к текущей дате истечения
      user.subscription_expiry_date = new Date(user.subscription_expiry_date.getTime() + (subscriptionDays * 24 * 60 * 60 * 1000));
    } else {
      // Если подписка истекла или нет, начинаем с текущей даты
      user.subscription_expiry_date = new Date(now.getTime() + (subscriptionDays * 24 * 60 * 60 * 1000));
    }

    // Обновляем поле subscription_days_left
    const msLeft = user.subscription_expiry_date.getTime() - now.getTime();
    user.subscription_days_left = Math.ceil(msLeft / (24 * 60 * 60 * 1000));

    await user.save({ transaction });

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
