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

const MAX_PAID_CASES_PER_DAY = 5; // Максимум 5 покупных кейсов в день

async function buyCase(req, res) {
  try {
    const userId = req.user.id;
    const { method, quantity = 1, caseTemplateId } = req.body;

    // Валидация количества
    if (!quantity || quantity < 1 || quantity > MAX_PAID_CASES_PER_DAY) {
      return res.status(400).json({
        message: `Количество кейсов должно быть от 1 до ${MAX_PAID_CASES_PER_DAY}`
      });
    }

    const user = await db.User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    // Получаем шаблон кейса
    if (!caseTemplateId) {
      return res.status(400).json({ message: 'Не указан тип кейса' });
    }

    const caseTemplate = await db.CaseTemplate.findByPk(caseTemplateId);
    if (!caseTemplate) {
      return res.status(404).json({ message: 'Шаблон кейса не найден' });
    }

    if (!caseTemplate.price || caseTemplate.price <= 0) {
      return res.status(400).json({ message: 'Этот кейс нельзя купить (бесплатный)' });
    }

    if (!caseTemplate.is_active) {
      return res.status(400).json({ message: 'Кейс временно недоступен' });
    }

    const CASE_PRICE = parseFloat(caseTemplate.price);

    // Проверяем дневной лимит покупных кейсов
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Сбрасываем счетчик покупных кейсов если новый день
    if (!user.last_reset_date || new Date(user.last_reset_date).setHours(0,0,0,0) < today.getTime()) {
      user.paid_cases_bought_today = 0;
      user.last_reset_date = today;
      await user.save();
    }

    const currentPaidCases = user.paid_cases_bought_today || 0;
    let allowedQuantity = quantity;
    if (currentPaidCases + quantity > MAX_PAID_CASES_PER_DAY) {
      allowedQuantity = MAX_PAID_CASES_PER_DAY - currentPaidCases;
    }

    if (allowedQuantity <= 0) {
      return res.status(400).json({
        message: `Превышен дневной лимит покупки кейсов. Осталось: 0 из ${MAX_PAID_CASES_PER_DAY}`,
        remaining_cases: 0
      });
    }

    const totalPrice = CASE_PRICE * allowedQuantity;

    if (method === 'balance') {
      // Покупка за баланс
      if ((user.balance || 0) < totalPrice) {
        return res.status(400).json({
          message: 'Недостаточно средств на балансе',
          required: totalPrice,
          available: user.balance || 0
        });
      }

      // Списываем средства
      user.balance -= totalPrice;
      user.paid_cases_bought_today = currentPaidCases + allowedQuantity;
      user.last_reset_date = new Date(new Date().setHours(0,0,0,0)); // Обновляем дату сброса на сегодня
      await user.save();

      logger.info(`После сохранения: paid_cases_bought_today = ${user.paid_cases_bought_today}, last_reset_date = ${user.last_reset_date}`);

      // Обновляем данные пользователя из базы для корректного ответа
      await user.reload();

      logger.info(`После перезагрузки: paid_cases_bought_today = ${user.paid_cases_bought_today}, last_reset_date = ${user.last_reset_date}`);

      // Используем выбранный шаблон кейса

      // Создаем кейсы
      const cases = [];
      for (let i = 0; i < allowedQuantity; i++) {
        const newCase = await db.Case.create({
          name: caseTemplate.name,
          description: caseTemplate.description || 'Кейс, купленный за деньги',
          template_id: caseTemplate.id,
          user_id: userId,
          is_paid: true,
          purchase_price: CASE_PRICE,
          source: 'purchase',
          received_date: new Date()
        });
        cases.push(newCase);
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
          case_ids: cases.map(c => c.id)
        }
      });

      logger.info(`Пользователь ${userId} купил ${allowedQuantity} кейсов за баланс (${totalPrice}₽)`);

      return res.json({
        success: true,
        message: `Успешно куплено ${allowedQuantity} кейс(ов)`,
        cases: cases.map(c => ({
          id: c.id,
          name: c.name,
          purchase_price: c.purchase_price,
          received_date: c.received_date,
          template_id: c.template_id,
          template_name: caseTemplate.name
        })),
        balance: user.balance,
        paid_cases_bought_today: user.paid_cases_bought_today,
        remaining_cases: MAX_PAID_CASES_PER_DAY - user.paid_cases_bought_today
      });

    } else if (method === 'bank_card') {
      // Покупка через банковскую карту
      try {
        let allowedQuantity = quantity;
        if (currentPaidCases + quantity > MAX_PAID_CASES_PER_DAY) {
          allowedQuantity = MAX_PAID_CASES_PER_DAY - currentPaidCases;
        }

        if (allowedQuantity <= 0) {
          return res.status(400).json({
            message: `Превышен дневной лимит покупки кейсов. Осталось: 0 из ${MAX_PAID_CASES_PER_DAY}`,
            remaining_cases: 0
          });
        }

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
          paymentUrl,
          message: 'Перенаправьте пользователя для оплаты',
          quantity: allowedQuantity,
          total_price: totalPrice,
          case_price: CASE_PRICE
        });
      } catch (error) {
        logger.error('Ошибка создания платежа для покупки кейсов:', error);
        return res.status(500).json({ message: 'Ошибка при создании платежа' });
      }
    } else {
      return res.status(400).json({
        message: 'Неверный метод оплаты. Используйте "balance" или "bank_card"'
      });
    }

  } catch (error) {
    logger.error('Ошибка покупки кейсов:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

async function getCasePurchaseInfo(req, res) {
  try {
    const userId = req.user.id;
    const user = await db.User.findByPk(userId);

    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Проверяем нужно ли сбросить счетчик
    let paidCasesToday = user.paid_cases_bought_today || 0;
    if (!user.last_reset_date || user.last_reset_date < today) {
      paidCasesToday = 0;
    }

    const remainingCases = MAX_PAID_CASES_PER_DAY - paidCasesToday;

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
      max_cases_per_day: MAX_PAID_CASES_PER_DAY,
      paid_cases_bought_today: paidCasesToday,
      remaining_cases: remainingCases,
      can_buy: remainingCases > 0,
      user_balance: user.balance || 0
    });

  } catch (error) {
    logger.error('Ошибка получения информации о покупке кейсов:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  buyCase,
  getCasePurchaseInfo,
  MAX_PAID_CASES_PER_DAY
};
