const db = require('../../models');
const winston = require('winston');
const { updateUserAchievementProgress } = require('../../services/achievementService');
const { addExperience } = require('../../services/xpService');

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
  try {
    const userId = req.user.id;
    const { itemId, steamTradeUrl } = req.body;

    // Проверяем, есть ли предмет в инвентаре пользователя
    const inventoryItem = await db.UserInventory.findOne({
      where: { user_id: userId, item_id: itemId, status: 'inventory' },
      include: [{
        model: db.Item,
        as: 'item'
      }]
    });

    if (!inventoryItem) {
      return res.status(404).json({ success: false, message: 'Предмет не найден в инвентаре' });
    }

    // Проверяем Steam Trade URL
    let tradeUrl = steamTradeUrl;
    if (!tradeUrl) {
      // Если в запросе не предоставлен URL, проверяем профиль пользователя
      const user = await db.User.findByPk(userId);
      tradeUrl = user.steam_trade_url;

      if (!tradeUrl) {
        return res.status(400).json({
          success: false,
          message: 'Отсутствует ссылка для обмена в Steam. Пожалуйста, добавьте её в свой профиль или укажите в запросе.'
        });
      }
    }

    // Проверяем, что предмет можно вывести
    if (!inventoryItem.item.steam_market_hash_name) {
      return res.status(400).json({
        success: false,
        message: 'Этот предмет нельзя вывести в Steam.'
      });
    }

    // Создаем заявку на вывод
    const withdrawal = await db.Withdrawal.create({
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
          market_hash_name: inventoryItem.item.steam_market_hash_name,
          exterior: inventoryItem.item.exterior,
          price: inventoryItem.item.price
        }
      }
    });

    // Связываем предмет с заявкой на вывод, но оставляем в инвентаре
    await inventoryItem.update({
      withdrawal_id: withdrawal.id
      // Статус остается 'inventory' до успешной отправки trade offer
    });

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

    logger.info(`Пользователь ${userId} запросил вывод предмета ${itemId} (${inventoryItem.item.name})`);

    return res.json({
      success: true,
      message: 'Заявка на вывод предмета создана успешно',
      data: {
        withdrawal_id: withdrawal.id,
        status: withdrawal.status,
        created_at: withdrawal.request_date
      }
    });
  } catch (error) {
    logger.error('Ошибка вывода предмета:', error);
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
          market_hash_name: item.item.steam_market_hash_name,
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
