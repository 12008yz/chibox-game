const db = require('../../models');
const winston = require('winston');
const { addJob } = require('../../services/queueService');
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

// Убрано ограничение на максимальное количество кейсов в день

async function buyCase(req, res) {
  try {
    const userId = req.user.id;
    const { method, quantity = 1, caseTemplateId } = req.body;

    // Валидация количества
    if (!quantity || quantity < 1) {
      return res.status(400).json({
        success: false,
        message: 'Количество кейсов должно быть больше 0'
      });
    }

    const user = await db.User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Пользователь не найден' });
    }

    // Получаем шаблон кейса
    if (!caseTemplateId) {
      return res.status(400).json({ success: false, message: 'Не указан тип кейса' });
    }

    const caseTemplate = await db.CaseTemplate.findByPk(caseTemplateId);
    if (!caseTemplate) {
      return res.status(404).json({ success: false, message: 'Шаблон кейса не найден' });
    }

    if (!caseTemplate.price || caseTemplate.price <= 0) {
      return res.status(400).json({ success: false, message: 'Этот кейс нельзя купить (бесплатный)' });
    }

    if (!caseTemplate.is_active) {
      return res.status(400).json({ success: false, message: 'Кейс временно недоступен' });
    }

    const CASE_PRICE = parseFloat(caseTemplate.price);

    const allowedQuantity = quantity;
    const totalPrice = CASE_PRICE * allowedQuantity;

    if (method === 'balance') {
      // Покупка за баланс
      if ((user.balance || 0) < totalPrice) {
        return res.status(400).json({
          success: false,
          message: 'Недостаточно средств на балансе',
          data: {
            required: totalPrice,
            available: user.balance || 0
          }
        });
      }

      // Используем транзакцию для атомарности операции
      const transaction = await db.sequelize.transaction();

      try {
        // Списываем средства
        user.balance -= totalPrice;
        await user.save({ transaction });

        // Создаем кейсы в инвентаре
        const inventoryCases = [];
        for (let i = 0; i < allowedQuantity; i++) {
          const inventoryCase = await db.UserInventory.create({
            user_id: userId,
            item_id: null, // Для кейсов item_id не используется
            item_type: 'case',
            case_template_id: caseTemplate.id,
            source: 'purchase',
            status: 'inventory',
            acquisition_date: new Date(),
            expires_at: caseTemplate.availability_end || null // Устанавливаем срок действия если есть
          }, { transaction });
          inventoryCases.push(inventoryCase);
        }

        // Добавляем опыт за покупку
        await addExperience(userId, 5 * allowedQuantity, 'buy_case', null, `Покупка ${allowedQuantity} кейса(ов)`);

        // Создаем уведомление
        await db.Notification.create({
          user_id: userId,
          title: 'Покупка кейсов',
          message: `Вы успешно купили ${allowedQuantity} кейс(ов) за ${totalPrice}₽`,
          type: 'success',
          category: 'transaction',
          link: '/cases',
          importance: 3,
          data: {
            quantity: allowedQuantity,
            price: totalPrice,
            inventory_case_ids: inventoryCases.map(c => c.id)
          }
        }, { transaction });

        // Фиксируем транзакцию
        await transaction.commit();

        // Обновляем данные пользователя из базы для корректного ответа
        await user.reload();

        logger.info(`Пользователь ${userId} купил ${allowedQuantity} кейсов за баланс (${totalPrice}₽)`);

        return res.json({
          success: true,
          message: `Успешно куплено ${allowedQuantity} кейс(ов) в инвентарь`,
          data: {
            inventory_cases: inventoryCases.map(c => ({
              id: c.id,
              case_template_id: c.case_template_id,
              template_name: caseTemplate.name,
              template_image: caseTemplate.image_url,
              purchase_price: CASE_PRICE,
              acquisition_date: c.acquisition_date,
              expires_at: c.expires_at,
              item_type: c.item_type
            })),
            balance: user.balance,
            new_balance: user.balance
          }
        });
      } catch (error) {
        // Откатываем транзакцию при ошибке
        await transaction.rollback();
        logger.error('Ошибка при покупке кейса, транзакция откатана:', error);
        throw error;
      }

    } else if (method === 'bank_card') {
      // Покупка через банковскую карту
      try {
        const allowedQuantity = quantity;
        const totalPrice = CASE_PRICE * allowedQuantity;

        // Добавляем платеж в очередь для обработки
        const paymentJob = await addJob.processPayment({
          userId,
          amount: totalPrice,
          purpose: 'case_purchase',
          extraData: {
            quantity: allowedQuantity,
            case_price: CASE_PRICE
          }
        });

        logger.info(`Платеж добавлен в очередь для покупки ${allowedQuantity} кейсов на сумму ${totalPrice}₽`);

        // Пока что возвращаем временную ссылку, в реальности нужно дождаться обработки
        const paymentUrl = `payment-processing-${paymentJob.id}`;

        return res.json({
          success: true,
          message: 'Перенаправьте пользователя для оплаты',
          data: {
            paymentUrl,
            quantity: allowedQuantity,
            total_price: totalPrice,
            case_price: CASE_PRICE
          }
        });
      } catch (error) {
        logger.error('Ошибка создания платежа для покупки кейсов:', error);
        return res.status(500).json({ success: false, message: 'Ошибка при создании платежа' });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'Неверный метод оплаты. Используйте "balance" или "bank_card"'
      });
    }

  } catch (error) {
    logger.error('Ошибка покупки кейсов:', error);
    return res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
  }
}

async function getCasePurchaseInfo(req, res) {
  try {
    const userId = req.user.id;
    const user = await db.User.findByPk(userId);

    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    // Получаем доступные покупные кейсы
    const availableCases = await db.CaseTemplate.findAll({
      where: {
        is_active: true,
        price: { [db.Sequelize.Op.gt]: 0 } // Только платные кейсы
      },
      order: [['sort_order', 'ASC'], ['price', 'ASC']],
      attributes: ['id', 'name', 'description', 'price', 'type', 'color_scheme', 'image_url']
    });

    return res.json({
      available_cases: availableCases.map(caseTemplate => ({
        id: caseTemplate.id,
        name: caseTemplate.name,
        description: caseTemplate.description,
        price: parseFloat(caseTemplate.price),
        type: caseTemplate.type,
        color_scheme: caseTemplate.color_scheme,
        image_url: caseTemplate.image_url
      })),
      can_buy: true, // Теперь всегда можно покупать
      user_balance: user.balance || 0
    });

  } catch (error) {
    logger.error('Ошибка получения информации о покупке кейсов:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  buyCase,
  getCasePurchaseInfo
};
