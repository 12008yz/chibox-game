const { UserInventory, User, Achievement, sequelize } = require('../../models');

async function exchangeItemForSubscription(req, res) {
  const { userId, itemId, tierId } = req.body;

  if (!userId) {
    return res.status(400).json({ message: 'userId не указан' });
  }
  if (!itemId) {
    return res.status(400).json({ message: 'itemId не указан' });
  }
  if (!tierId) {
    return res.status(400).json({ message: 'tierId не указан' });
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

    // Обновить статус предмета, чтобы он не был в инвентаре
    inventoryItem.status = 'used';
    await inventoryItem.save({ transaction });

    // Обновить подписку пользователя (пример)
    const user = await User.findByPk(userId, { transaction });
    user.subscription_tier = tierId;

    // Добавим время продления подписки пропорционально стоимости предмета
    const itemPrice = inventoryItem.item.price; // стоимость предмета
    const subscriptionPrice = 1000; // стоимость подписки в рублях, замените на актуальное значение или получите из настроек

    // Максимальное время продления подписки в миллисекундах (например, 30 дней)
    const maxExtensionMs = 30 * 24 * 60 * 60 * 1000;

    // Вычисляем время продления пропорционально стоимости предмета
    const extensionMs = Math.min(maxExtensionMs, (itemPrice / subscriptionPrice) * maxExtensionMs);

    const now = new Date();
    if (user.subscription_expiry_date && user.subscription_expiry_date > now) {
      user.subscription_expiry_date = new Date(user.subscription_expiry_date.getTime() + extensionMs);
    } else {
      user.subscription_expiry_date = new Date(now.getTime() + extensionMs);
    }

    await user.save({ transaction });

    // Обновить достижения пользователя, связанные с обменом предмета
    const achievements = await Achievement.findAll({
      where: {
        requirement_type: 'exchange_item',
        is_active: true,
      },
      transaction,
    });

    // Логика обновления прогресса достижений (пример)
    for (const achievement of achievements) {
      // Здесь должна быть ваша логика обновления прогресса
      // Например, вызвать функцию updateUserAchievementProgress
    }

    await transaction.commit();

    // Создание уведомления о обмене предмета на подписку
    await require('../../models').Notification.create({
      user_id: userId,
      title: 'Обмен предмета на подписку',
      message: `Вы успешно обменяли предмет "${inventoryItem.item.name}" на подписку.`,
      type: 'success',
      category: 'subscription',
      importance: 5,
      data: {
        itemId: itemId,
        tierId: tierId,
        subscription_expiry_date: user.subscription_expiry_date
      }
    });

    // Вычисляем время продления в днях для ответа
    const extensionDays = extensionMs / (24 * 60 * 60 * 1000);

    return res.json({ 
      message: 'Обмен предмета на подписку выполнен успешно',
      subscription_expiry_date: user.subscription_expiry_date,
      extended_days: extensionDays
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Ошибка обмена предмета на подписку:', error);
    return res.status(500).json({ message: 'Ошибка обмена предмета на подписку' });
  }
}

module.exports = { exchangeItemForSubscription };
