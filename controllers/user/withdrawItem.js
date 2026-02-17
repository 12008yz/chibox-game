const db = require('../../models');
const winston = require('winston');
const { Op } = require('sequelize');
const { updateUserAchievementProgress } = require('../../services/achievementService');
const { addExperience } = require('../../services/xpService');
const { addJob } = require('../../services/queueService');
const { getTradeOfferStateFromApi } = require('../../utils/steamTradeHelper');
const { applyWithdrawalOutcome } = require('../../services/withdrawalOutcomeService');

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
  const transaction = await db.sequelize.transaction();
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
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Необходимо указать itemId или inventoryItemId'
      });
    }

    // Проверяем, есть ли предмет в инвентаре пользователя с блокировкой
    // Сначала блокируем запись без include (чтобы избежать FOR UPDATE с LEFT JOIN)
    inventoryItem = await db.UserInventory.findOne({
      where: searchCriteria,
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!inventoryItem) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Предмет не найден в инвентаре' });
    }

    // Теперь получаем связанные данные item отдельным запросом
    const item = await db.Item.findByPk(inventoryItem.item_id, { transaction });
    if (item) {
      inventoryItem.item = item;
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
      }],
      transaction
    });

    if (existingWithdrawal) {
      await transaction.rollback();
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
    const user = await db.User.findByPk(userId, { transaction });
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }

    // ✅ ПРОВЕРЯЕМ ПОДПИСКУ: пользователь должен иметь действующую подписку
    const now = new Date();
    let hasActiveSubscription = false;
    let subscriptionStatus = 'Статус отсутствует';

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

      await transaction.rollback();
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
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Отсутствует ссылка для обмена в Steam. Пожалуйста, добавьте её в свой профиль или укажите в запросе.'
        });
      }
    }

    // Проверяем, что предмет можно вывести
    const marketHashName = inventoryItem.item.steam_market_hash_name || inventoryItem.item.name;
    if (!marketHashName) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Этот предмет нельзя вывести в Steam.'
      });
    }

    // Создаем заявку на вывод
    logger.info('📝 [WITHDRAW ITEM] Создание заявки на вывод:', {
      userId,
      marketHashName,
      itemId: inventoryItem.item.id,
      itemName: inventoryItem.item.name,
      inventoryItemId: inventoryItem.id
    });

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
    }, { transaction });

    logger.info('✅ [WITHDRAW ITEM] Заявка создана:', {
      withdrawalId: withdrawal.id,
      status: withdrawal.status
    });

    // Связываем предмет с заявкой на вывод и обновляем статус
    logger.info('🔗 [WITHDRAW ITEM] Связывание предмета с заявкой:', {
      inventoryItemId: inventoryItem.id,
      withdrawalId: withdrawal.id,
      old_status: inventoryItem.status
    });

    await inventoryItem.update({
      withdrawal_id: withdrawal.id,
      status: 'pending_withdrawal', // Ставим статус ожидания вывода при создании заявки
      transaction_date: new Date()
    }, { transaction });

    logger.info('✅ [WITHDRAW ITEM] Предмет успешно обновлен:', {
      inventoryItemId: inventoryItem.id,
      withdrawal_id: inventoryItem.withdrawal_id,
      new_status: inventoryItem.status
    });

    // Коммитим транзакцию перед добавлением в очередь
    await transaction.commit();

    // ✅ ДОБАВЛЯЕМ: Сразу добавляем в очередь для обработки (после коммита)
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
      // Транзакция уже закоммичена, заявка создана, просто логируем ошибку
      // Заявка будет обработана позже вручную или через cron
    }

    // Создаем уведомление для пользователя (после коммита)
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

    // Начисляем опыт за вывод предмета (после коммита)
    await addExperience(userId, 20, 'withdraw_item', null, 'Вывод предмета');

    // Обновляем прогресс достижений (после коммита)
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

    // Откатываем транзакцию при ошибке
    try {
      await transaction.rollback();
      logger.info('Транзакция успешно откатана');
    } catch (rollbackError) {
      logger.error('Ошибка отката транзакции:', rollbackError);
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

async function cancelWithdrawal(req, res) {
  let transaction;

  try {
    const userId = req.user.id;
    const { withdrawalId } = req.params;

    logger.info('🔍 [CANCEL WITHDRAWAL] Начало обработки отмены вывода:', {
      userId,
      withdrawalId,
      params: req.params,
      body: req.body
    });

    // Создаем транзакцию с уровнем изоляции READ COMMITTED
    logger.info('📝 [CANCEL WITHDRAWAL] Создание транзакции...');
    transaction = await db.sequelize.transaction({
      isolationLevel: db.Sequelize.Transaction.ISOLATION_LEVELS.READ_COMMITTED
    });
    logger.info('✅ [CANCEL WITHDRAWAL] Транзакция создана успешно');

    // Получаем заявку С БЛОКИРОВКОЙ для предотвращения race condition
    logger.info('🔍 [CANCEL WITHDRAWAL] Поиск заявки в БД с блокировкой...', {
      withdrawalId,
      userId
    });

    let withdrawal;
    try {
      // Сначала блокируем запись withdrawal БЕЗ include
      withdrawal = await db.Withdrawal.findOne({
        where: {
          id: withdrawalId,
          user_id: userId
        },
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      logger.info('📊 [CANCEL WITHDRAWAL] Withdrawal запись получена:', {
        found: !!withdrawal,
        id: withdrawal?.id,
        status: withdrawal?.status
      });

      // Если нашли, подгружаем items отдельным запросом С БЛОКИРОВКОЙ
      if (withdrawal) {
        const items = await db.UserInventory.findAll({
          where: { withdrawal_id: withdrawalId },
          transaction,
          lock: transaction.LOCK.UPDATE
        });
        withdrawal.items = items;

        logger.info('📦 [CANCEL WITHDRAWAL] Items загружены с блокировкой:', {
          items_count: items.length
        });
      }

      logger.info('✅ [CANCEL WITHDRAWAL] Запрос к БД выполнен успешно');
    } catch (dbError) {
      logger.error('❌ [CANCEL WITHDRAWAL] Ошибка при запросе к БД:', {
        error: dbError.message,
        code: dbError.original?.code,
        detail: dbError.original?.detail,
        hint: dbError.original?.hint
      });
      throw dbError;
    }

    logger.info('📊 [CANCEL WITHDRAWAL] Результат поиска заявки:', {
      withdrawal_found: !!withdrawal,
      withdrawal_id: withdrawal?.id,
      withdrawal_status: withdrawal?.status,
      withdrawal_user_id: withdrawal?.user_id,
      items_count: withdrawal?.items?.length || 0
    });

    if (!withdrawal) {
      logger.error('❌ [CANCEL WITHDRAWAL] Заявка на вывод не найдена:', {
        withdrawalId,
        userId
      });
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Заявка на вывод не найдена'
      });
    }

    // Проверяем, что заявку можно отменить (только pending и queued статусы)
    const cancellableStatuses = ['pending', 'queued'];
    logger.info('🔒 [CANCEL WITHDRAWAL] Проверка статуса заявки:', {
      current_status: withdrawal.status,
      cancellableStatuses,
      is_cancellable: cancellableStatuses.includes(withdrawal.status)
    });

    if (!cancellableStatuses.includes(withdrawal.status)) {
      logger.warn('⚠️ [CANCEL WITHDRAWAL] Невозможно отменить заявку:', {
        current_status: withdrawal.status,
        allowed_statuses: cancellableStatuses
      });
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Нельзя отменить заявку со статусом "${withdrawal.status}". Отмена возможна только для статусов: ${cancellableStatuses.join(', ')}`,
        data: {
          current_status: withdrawal.status
        }
      });
    }



    // Возвращаем предметы в инвентарь
    logger.info('🔄 [CANCEL WITHDRAWAL] Возврат предметов в инвентарь:', {
      items_count: withdrawal.items?.length || 0
    });

    if (withdrawal.items && withdrawal.items.length > 0) {
      for (const item of withdrawal.items) {
        logger.info('📦 [CANCEL WITHDRAWAL] Обновление предмета:', {
          item_id: item.id,
          old_status: item.status,
          old_withdrawal_id: item.withdrawal_id
        });

        await item.update({
          status: 'inventory',
          withdrawal_id: null,
          transaction_date: new Date()
        }, { transaction });
      }
    }

    // Обновляем статус заявки
    logger.info('📝 [CANCEL WITHDRAWAL] Обновление статуса заявки на cancelled');
    await withdrawal.update({
      status: 'cancelled',
      cancellation_reason: 'Отменено пользователем',
      cancellation_date: new Date()
    }, { transaction });

    await transaction.commit();
    logger.info('✅ [CANCEL WITHDRAWAL] Транзакция успешно завершена');

    // Создаем уведомление для пользователя
    await db.Notification.create({
      user_id: userId,
      type: 'info',
      title: 'Вывод отменен',
      message: 'Ваш запрос на вывод предмета был успешно отменен. Предмет возвращен в инвентарь.',
      related_id: withdrawal.id,
      category: 'withdrawal',
      importance: 3
    });

    logger.info(`Пользователь ${userId} отменил заявку на вывод ${withdrawalId}`);

    return res.json({
      success: true,
      message: 'Заявка на вывод успешно отменена. Предмет возвращен в инвентарь.',
      data: {
        withdrawal_id: withdrawal.id,
        status: 'cancelled'
      }
    });

  } catch (error) {
    logger.error('❌ [CANCEL WITHDRAWAL] Ошибка отмены вывода:', {
      error: error.message,
      name: error.name,
      code: error.original?.code,
      detail: error.original?.detail,
      sql: error.sql?.substring(0, 200),
      stack: error.stack
    });

    // Откатываем транзакцию, если она существует
    if (transaction) {
      try {
        logger.info('🔄 [CANCEL WITHDRAWAL] Попытка отката транзакции...');
        await transaction.rollback();
        logger.info('✅ [CANCEL WITHDRAWAL] Транзакция откачена успешно');
      } catch (rollbackError) {
        logger.error('❌ [CANCEL WITHDRAWAL] Ошибка отката транзакции:', {
          error: rollbackError.message,
          stack: rollbackError.stack
        });
      }
    }

    return res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера',
      error: error.message
    });
  }
}

/**
 * Проверяет статусы отправленных трейдов через Steam API и обновляет заявки,
 * если пользователь уже принял предмет в Steam (state 3 = Accepted).
 * Вызывается при открытии профиля/вкладки «Выведенные», чтобы без крона показать «Успешно».
 */
async function checkWithdrawalStatuses(req, res) {
  try {
    const userId = req.user.id;
    const apiKey = process.env.STEAM_API_KEY;
    if (!apiKey) {
      return res.json({ success: true, updated: 0, message: 'Steam API не настроен' });
    }

    const withdrawals = await db.Withdrawal.findAll({
      where: {
        user_id: userId,
        status: 'direct_trade_sent'
      },
      attributes: ['id', 'status', 'tracking_data', 'steam_trade_offer_id']
    });

    let updated = 0;
    for (const w of withdrawals) {
      // send-steam-withdrawals пишет в tracking_data.trade_offer_id, withdrawal-processor — в steam_trade_offer_id
      const offerId = w.tracking_data?.trade_offer_id || w.steam_trade_offer_id;
      if (!offerId) continue;

      const resolved = await getTradeOfferStateFromApi(apiKey, offerId);
      if (resolved.error) continue;

      const state = resolved.state;
      // 3 = Accepted, 6 = Canceled/Expired, 7 = Declined
      if (state === 3) {
        const withdrawal = await db.Withdrawal.findByPk(w.id);
        if (withdrawal && withdrawal.status === 'direct_trade_sent') {
          await applyWithdrawalOutcome(withdrawal, 'completed', 'Трейд принят пользователем');
          updated++;
        }
      } else if (state === 6 || state === 7) {
        const withdrawal = await db.Withdrawal.findByPk(w.id);
        if (withdrawal && withdrawal.status === 'direct_trade_sent') {
          const msg = state === 7 ? 'Трейд отклонен пользователем' : 'Трейд истек или отменен';
          await applyWithdrawalOutcome(withdrawal, 'failed', msg);
          updated++;
        }
      }
    }

    return res.json({ success: true, updated });
  } catch (error) {
    logger.error('Ошибка проверки статусов выводов:', error);
    return res.status(500).json({ success: false, message: 'Ошибка проверки статусов' });
  }
}

/**
 * Разрешение ситуации "предмет не у бота": пользователь выбирает ChiCoins или ожидание.
 * POST body: { action: 'chicoins' | 'wait' }
 */
async function resolveWithdrawalNoStock(req, res) {
  const transaction = await db.sequelize.transaction();
  try {
    const userId = req.user.id;
    const { withdrawalId } = req.params;
    const { action } = req.body;

    if (!action || !['chicoins', 'wait'].includes(action)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Укажите action: "chicoins" (получить ChiCoins) или "wait" (подождать)'
      });
    }

    const withdrawal = await db.Withdrawal.findOne({
      where: { id: withdrawalId, user_id: userId, status: 'item_not_in_stock' },
      include: [{
        model: db.UserInventory,
        as: 'items',
        include: [{ model: db.Item, as: 'item', attributes: ['id', 'name', 'price'] }]
      }],
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!withdrawal) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Заявка не найдена или уже обработана'
      });
    }

    if (action === 'chicoins') {
      const totalValue = parseFloat(withdrawal.total_items_value) || withdrawal.items?.reduce((sum, inv) => sum + (parseFloat(inv.item?.price) || 0), 0) || 0;
      if (totalValue <= 0) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'Некорректная сумма предметов' });
      }

      const user = await db.User.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!user) {
        await transaction.rollback();
        return res.status(404).json({ success: false, message: 'Пользователь не найден' });
      }

      await user.increment('balance', { by: totalValue, transaction });
      await db.UserInventory.update(
        { status: 'withdrawn', transaction_date: new Date() },
        { where: { withdrawal_id: withdrawal.id, status: 'pending_withdrawal' }, transaction, validate: false }
      );
      await withdrawal.update({
        status: 'cancelled',
        cancellation_reason: 'Компенсация ChiCoins за отсутствие предмета у бота',
        cancellation_date: new Date(),
        completion_date: new Date()
      }, { transaction });

      await transaction.commit();

      await db.Notification.create({
        user_id: userId,
        type: 'success',
        title: 'Компенсация ChiCoins',
        message: `На ваш баланс зачислено ${totalValue} ChiCoins за предмет, который временно отсутствовал у бота.`,
        category: 'withdrawal',
        importance: 5,
        data: { withdrawal_id: withdrawal.id, amount: totalValue }
      });

      const updatedUser = await db.User.findByPk(userId, { attributes: ['balance'] });
      const newBalance = updatedUser ? parseFloat(updatedUser.balance) || 0 : (parseFloat(user.balance) || 0) + totalValue;

      logger.info(`Пользователь ${userId} выбрал компенсацию ChiCoins за withdrawal ${withdrawal.id}, сумма ${totalValue}`);
      return res.json({
        success: true,
        message: `На баланс зачислено ${totalValue} ChiCoins`,
        data: { withdrawal_id: withdrawal.id, balance_added: totalValue, new_balance: newBalance }
      });
    }

    if (action === 'wait') {
      await withdrawal.update({ status: 'pending', failed_reason: null }, { transaction });
      await transaction.commit();

      await db.Notification.create({
        user_id: userId,
        type: 'info',
        title: 'Вывод в очереди',
        message: 'Заявка на вывод снова в очереди. Мы повторим попытку отправить предмет, когда он появится у бота.',
        category: 'withdrawal',
        importance: 4,
        data: { withdrawal_id: withdrawal.id }
      });
      logger.info(`Пользователь ${userId} выбрал ожидание для withdrawal ${withdrawal.id}`);
      return res.json({
        success: true,
        message: 'Заявка снова в очереди. Попытка вывода повторится автоматически.',
        data: { withdrawal_id: withdrawal.id, status: 'pending' }
      });
    }

    await transaction.rollback();
    return res.status(400).json({ success: false, message: 'Недопустимое действие' });
  } catch (error) {
    if (transaction) await transaction.rollback().catch(() => {});
    logger.error('Ошибка resolveWithdrawalNoStock:', error);
    return res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  withdrawItem,
  getWithdrawalStatus,
  cancelWithdrawal,
  checkWithdrawalStatuses,
  resolveWithdrawalNoStock
};
