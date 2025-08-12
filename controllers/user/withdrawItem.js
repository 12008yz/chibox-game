const db = require('../../models');
const winston = require('winston');
const { Op } = require('sequelize');
const { updateUserAchievementProgress } = require('../../services/achievementService');
const { addExperience } = require('../../services/xpService');
const { addJob } = require('../../services/queueService');

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

async function withdrawItem(req, res) {
  let inventoryItem = null;
  let withdrawal = null;

  try {
    const userId = req.user.id;
    const { itemId, inventoryItemId, steamTradeUrl } = req.body;

    // Поддерживаем оба формата: новый (inventoryItemId) и старый (itemId) для обратной совместимости
    let searchCriteria;
    if (inventoryItemId) {
      // Новый формат: передается конкретный ID записи из user_inventory
      searchCriteria = { id: inventoryItemId, user_id: userId, status: 'inventory' };
    } else if (itemId) {
      // Старый формат: передается item_id, берем первый доступный экземпляр
      searchCriteria = { user_id: userId, item_id: itemId, status: 'inventory' };
    } else {
      return res.status(400).json({
        success: false,
        message: 'Необходимо указать itemId или inventoryItemId'
      });
    }

    // Проверяем, есть ли предмет в инвентаре пользователя
    inventoryItem = await db.UserInventory.findOne({
      where: searchCriteria,
      include: [{
        model: db.Item,
        as: 'item'
      }]
    });

    if (!inventoryItem) {
      return res.status(404).json({ success: false, message: 'Предмет не найден в инвентаре' });
    }

    // Проверяем, нет ли уже активной заявки на вывод ЭТОГО КОНКРЕТНОГО экземпляра предмета
    const activeStatuses = ['pending', 'queued', 'processing', 'waiting_confirmation', 'direct_trade_pending', 'direct_trade_sent'];
    logger.info(`Проверяем активные заявки для конкретного экземпляра предмета ID: ${inventoryItem.id}`);

    const existingWithdrawal = await db.Withdrawal.findOne({
      where: {
        user_id: userId,
        status: {
          [Op.in]: activeStatuses
        }
      },
      include: [{
        model: db.UserInventory,
        as: 'items',
        where: { id: inventoryItem.id } // Проверяем конкретный экземпляр, а не item_id
      }]
    });

    if (existingWithdrawal) {
      return res.status(400).json({
        success: false,
        message: 'На этот экземпляр предмета уже создана заявка на вывод',
        data: {
          withdrawal_id: existingWithdrawal.id,
          status: existingWithdrawal.status,
          inventory_item_id: inventoryItem.id
        }
      });
    }

    // Получаем данные пользователя для проверки подписки и Steam Trade URL
    const user = await db.User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }

    // ✅ ПРОВЕРЯЕМ ПОДПИСКУ: пользователь должен иметь действующую подписку
    const now = new Date();
    let hasActiveSubscription = false;
    let subscriptionStatus = 'Подписка отсутствует';

    // Проверяем количество оставшихся дней подписки
    if (user.subscription_days_left && user.subscription_days_left > 0) {
      hasActiveSubscription = true;
      subscriptionStatus = `${user.subscription_days_left} дней подписки`;
    }

    // Дополнительная проверка через дату истечения подписки
    if (user.subscription_expiry_date) {
      const expiryDate = new Date(user.subscription_expiry_date);
      if (expiryDate > now) {
        hasActiveSubscription = true;
        const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        subscriptionStatus = `${daysLeft} дней подписки (до ${expiryDate.toLocaleDateString('ru-RU')})`;
      }
    }

    // Блокируем вывод для пользователей без подписки
    if (!hasActiveSubscription) {
      logger.warn(`Попытка вывода предмета пользователем ${userId} без действующей подписки`);

      return res.status(403).json({
        success: false,
        message: 'Для вывода предметов в Steam необходима действующая подписка',
        error_code: 'SUBSCRIPTION_REQUIRED',
        data: {
          subscription_status: subscriptionStatus,
          subscription_days_left: user.subscription_days_left || 0,
          subscription_expiry_date: user.subscription_expiry_date,
          can_purchase_subscription: true
        }
      });
    }

    logger.info(`Пользователь ${userId} имеет действующую подписку: ${subscriptionStatus}`);

    // Проверяем Steam Trade URL
    let tradeUrl = steamTradeUrl;
    if (!tradeUrl) {
      // Используем URL из профиля пользователя
      tradeUrl = user.steam_trade_url;

      if (!tradeUrl) {
        return res.status(400).json({
          success: false,
          message: 'Отсутствует ссылка для обмена в Steam. Пожалуйста, добавьте её в свой профиль или укажите в запросе.'
        });
      }
    }

    // Проверяем, что предмет можно вывести
    const marketHashName = inventoryItem.item.steam_market_hash_name || inventoryItem.item.name;
    if (!marketHashName) {
      return res.status(400).json({
        success: false,
        message: 'Этот предмет нельзя вывести в Steam.'
      });
    }

    // Создаем заявку на вывод
    withdrawal = await db.Withdrawal.create({
      user_id: userId,
      status: 'pending',
      steam_trade_url: tradeUrl,
      total_items_count: 1,
      total_items_value: inventoryItem.item.price,
      is_automatic: true,
      priority: 1,
      tracking_data: {
        created_at: new Date().toISOString(),
        item_details: {
          id: inventoryItem.item.id,
          name: inventoryItem.item.name,
          market_hash_name: marketHashName,
          exterior: inventoryItem.item.exterior,
          price: inventoryItem.item.price
        }
      }
    });

    // Связываем предмет с заявкой на вывод и обновляем статус
    await inventoryItem.update({
      withdrawal_id: withdrawal.id,
      status: 'pending_withdrawal', // Ставим статус ожидания вывода при создании заявки
      transaction_date: new Date()
    });

    // ✅ ДОБАВЛЯЕМ: Сразу добавляем в очередь для обработки
    try {
      await addJob.processWithdrawal({
        withdrawalId: withdrawal.id
      }, {
        priority: 10, // Высокий приоритет для моментальной обработки
        delay: 2000   // Небольшая задержка 2 секунды
      });

      logger.info(`Withdrawal #${withdrawal.id} добавлен в очередь для обработки`);
    } catch (queueError) {
      logger.warn(`Не удалось добавить withdrawal в очередь: ${queueError.message}`);

      // Если не удалось добавить в очередь, откатываем статус предмета
      await inventoryItem.update({
        withdrawal_id: null,
        status: 'inventory',
        transaction_date: null
      });

      return res.status(500).json({
        success: false,
        message: 'Не удалось обработать заявку на вывод. Попробуйте позже.'
      });
    }

    // Создаем уведомление для пользователя
    await db.Notification.create({
      user_id: userId,
      type: 'success',
      title: 'Запрос на вывод предмета',
      message: `Ваш запрос на вывод предмета "${inventoryItem.item.name}" создан и обрабатывается.`,
      related_id: withdrawal.id,
      category: 'withdrawal',
      importance: 5,
      data: {
        itemId: inventoryItem.item.id,
        itemName: inventoryItem.item.name
      }
    });

    // Начисляем опыт за вывод предмета
    await addExperience(userId, 20, 'withdraw_item', null, 'Вывод предмета');

    // Обновляем прогресс достижений
    await updateUserAchievementProgress(userId, 'steam_inventory', 1);

    logger.info(`Пользователь ${userId} запросил вывод предмета ${inventoryItem.item.id} (${inventoryItem.item.name}). Статус подписки: ${subscriptionStatus}`);

    return res.json({
      success: true,
      message: 'Заявка на вывод предмета создана успешно',
      data: {
        withdrawal_id: withdrawal.id,
        status: withdrawal.status,
        created_at: withdrawal.request_date,
        subscription_status: subscriptionStatus
      }
    });
  } catch (error) {
    logger.error('Ошибка вывода предмета:', error);

    // Если произошла ошибка, пытаемся откатить статус предмета
    try {
      if (inventoryItem && withdrawal) {
        await inventoryItem.update({
          withdrawal_id: null,
          status: 'inventory',
          transaction_date: null
        });

        // Также удаляем созданную заявку на вывод
        await withdrawal.destroy();
      }
    } catch (rollbackError) {
      logger.error('Ошибка отката статуса предмета:', rollbackError);
    }

    return res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера', error: error.message });
  }
}

async function getWithdrawalStatus(req, res) {
  try {
    const userId = req.user.id;
    const { withdrawalId } = req.params;

    // Получаем заявку на вывод
    const withdrawal = await db.Withdrawal.findOne({
      where: { id: withdrawalId, user_id: userId },
      include: [{
        model: db.UserInventory,
        as: 'items',
        include: [{
          model: db.Item,
          as: 'item'
        }]
      }]
    });

    if (!withdrawal) {
      return res.status(404).json({ success: false, message: 'Заявка на вывод не найдена' });
    }

    // Формируем данные для ответа
    const response = {
      success: true,
      data: {
        id: withdrawal.id,
        status: withdrawal.status,
        created_at: withdrawal.request_date,
        processing_date: withdrawal.processing_date,
        completion_date: withdrawal.completion_date,
        steam_trade_offer_id: withdrawal.steam_trade_offer_id,
        steam_trade_status: withdrawal.steam_trade_status,
        failed_reason: withdrawal.failed_reason,
        items: withdrawal.items.map(item => ({
          id: item.item.id,
          name: item.item.name,
          market_hash_name: item.item.steam_market_hash_name || item.item.name,
          exterior: item.item.exterior,
          price: item.item.price
        }))
      }
    };

    return res.json(response);
  } catch (error) {
    logger.error('Ошибка получения статуса вывода:', error);
    return res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера', error: error.message });
  }
}

module.exports = {
  withdrawItem,
  getWithdrawalStatus
};
