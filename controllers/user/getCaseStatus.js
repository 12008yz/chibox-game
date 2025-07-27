const db = require('../../models');
const { logger } = require('../../utils/logger');
const { MAX_PAID_CASES_PER_DAY } = require('./buyCase');

async function getCaseStatus(req, res) {
  try {
    const userId = req.user.id;
    const { caseTemplateId } = req.params;

    // Получаем пользователя
    const user = await db.User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Пользователь не найден' });
    }

    // Получаем шаблон кейса
    const caseTemplate = await db.CaseTemplate.findByPk(caseTemplateId);
    if (!caseTemplate) {
      return res.status(404).json({ success: false, message: 'Кейс не найден' });
    }

    if (!caseTemplate.is_active) {
      return res.status(400).json({ success: false, message: 'Кейс недоступен' });
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Сбрасываем дневные счетчики если новый день
    if (!user.last_reset_date || new Date(user.last_reset_date).setHours(0,0,0,0) < today.getTime()) {
      user.cases_opened_today = 0;
      user.paid_cases_bought_today = 0;
      user.last_reset_date = today;
      await user.save();
    }

    const userSubscriptionTier = user.subscription_tier || 0;
    const subscriptionDaysLeft = user.subscription_days_left || 0;
    const casePrice = parseFloat(caseTemplate.price) || 0;
    const minSubscriptionTier = caseTemplate.min_subscription_tier || 0;

    let status = {
      canOpen: false,
      canBuy: false,
      reason: '',
      nextAvailableTime: null,
      caseType: caseTemplate.type,
      price: casePrice,
      subscriptionRequired: minSubscriptionTier > 0,
      userSubscriptionTier,
      subscriptionDaysLeft,
      minSubscriptionTier
    };

    // Если это платный кейс
    if (casePrice > 0) {
      status.canBuy = true;

      // Проверяем дневной лимит покупок
      const paidCasesToday = user.paid_cases_bought_today || 0;
      if (paidCasesToday >= MAX_PAID_CASES_PER_DAY) {
        status.canBuy = false;
        status.reason = `Достигнут дневной лимит покупки кейсов (${MAX_PAID_CASES_PER_DAY})`;
      }

      // Проверяем баланс
      if ((user.balance || 0) < casePrice && status.canBuy) {
        status.reason = status.reason ? status.reason + '. Недостаточно средств' : 'Недостаточно средств';
      }

      return res.json({ success: true, data: status });
    }

    // Для бесплатных кейсов проверяем подписку и cooldown
    if (caseTemplate.type === 'daily') {
      // Проверяем уровень подписки
      if (userSubscriptionTier < minSubscriptionTier) {
        status.reason = `Требуется подписка уровня ${minSubscriptionTier} или выше`;
        return res.json({ success: true, data: status });
      }

      // Проверяем есть ли активная подписка (дни)
      if (minSubscriptionTier > 0 && subscriptionDaysLeft <= 0) {
        status.reason = 'Подписка истекла';
        return res.json({ success: true, data: status });
      }

      // Проверяем cooldown
      if (user.next_case_available_time && user.next_case_available_time > now) {
        status.reason = 'Кейс еще недоступен';
        status.nextAvailableTime = user.next_case_available_time;
        return res.json({ success: true, data: status });
      }

      // Проверяем дневной лимит
      const maxDailyCases = user.max_daily_cases || 0;
      const casesOpenedToday = user.cases_opened_today || 0;

      if (casesOpenedToday >= maxDailyCases && maxDailyCases > 0) {
        status.reason = 'Достигнут дневной лимит открытия бесплатных кейсов';
        return res.json({ success: true, data: status });
      }

      status.canOpen = true;
      return res.json({ success: true, data: status });
    }

    // Для бонусных и специальных кейсов
    if (caseTemplate.type === 'special') {
      // Проверяем есть ли такой кейс в инвентаре
      const inventoryCase = await db.UserInventory.findOne({
        where: {
          user_id: userId,
          case_template_id: caseTemplateId,
          item_type: 'case',
          status: 'inventory'
        }
      });

      if (inventoryCase) {
        status.canOpen = true;
      } else {
        status.reason = 'Кейс не найден в инвентаре';
      }

      return res.json({ success: true, data: status });
    }

    // По умолчанию кейс недоступен
    status.reason = 'Кейс недоступен';
    return res.json({ success: true, data: status });

  } catch (error) {
    logger.error('Ошибка проверки статуса кейса:', error);
    return res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = { getCaseStatus };
