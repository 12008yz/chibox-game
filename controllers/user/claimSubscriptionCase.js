const db = require('../../models');
const { giveDailyCaseToUser } = require('../../services/caseService');
const { getNextDailyCaseTime, formatTimeUntilNextCase } = require('../../utils/cronHelper');
const winston = require('winston');

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

/**
 * Получение ежедневных кейсов подписки
 */
async function claimSubscriptionCase(req, res) {
  try {
    const userId = req.user.id;
    const now = new Date();

    // Получаем пользователя
    const user = await db.User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }

    // Проверяем, есть ли активная подписка
    if (!user.subscription_tier || !user.subscription_expiry_date || user.subscription_expiry_date <= now) {
      return res.status(400).json({
        success: false,
        message: 'У вас нет активной подписки'
      });
    }

    // ОГРАНИЧЕНИЯ НА 24 ЧАСА ОТКЛЮЧЕНЫ
    // Пользователи могут получать кейсы по подписке в любое время

    // Выдаем ежедневные кейсы
    await giveDailyCaseToUser(userId, user.subscription_tier);

    // Устанавливаем время следующего получения кейсов (через 24 часа)
    const nextCaseTime = getNextDailyCaseTime();
    user.next_case_available_time = nextCaseTime;
    await user.save();

    logger.info(`User ${userId} claimed daily subscription cases`);

    // Получаем обновленную информацию о кейсах в инвентаре
    const userCases = await db.UserInventory.findAll({
      where: {
        user_id: userId,
        item_type: 'case',
        status: 'inventory'
      },
      include: [{
        model: db.CaseTemplate,
        as: 'case_template'
      }],
      order: [['acquisition_date', 'DESC']]
    });

    return res.json({
      success: true,
      message: 'Кейсы успешно получены!',
      data: {
        cases_claimed: userCases.filter(c =>
          c.source === 'subscription' &&
          c.acquisition_date >= new Date(now.getTime() - 5 * 60 * 1000) // последние 5 минут
        ).length,
        next_available_time: nextCaseTime,
        user_cases: userCases.map(c => ({
          id: c.id,
          case_template: c.case_template,
          acquisition_date: c.acquisition_date,
          expires_at: c.expires_at,
          source: c.source
        }))
      }
    });

  } catch (error) {
    logger.error('Ошибка при получении кейсов подписки:', error);
    return res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
}

/**
 * Получение статуса доступности кейсов подписки
 */
async function getSubscriptionCaseStatus(req, res) {
  try {
    const userId = req.user.id;
    const now = new Date();

    const user = await db.User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }

    const hasActiveSubscription = user.subscription_tier &&
                                 user.subscription_expiry_date &&
                                 user.subscription_expiry_date > now;

    let canClaim = false;
    let timeRemaining = null;
    let nextAvailableTime = null;

    // Проверяем, есть ли у пользователя неоткрытый подписной кейс в инвентаре
    const subscriptionCasesInInventory = await db.UserInventory.count({
      where: {
        user_id: userId,
        item_type: 'case',
        status: 'inventory',
        source: 'subscription'
      }
    });
    const hasSubscriptionCaseInInventory = subscriptionCasesInInventory > 0;

    if (hasActiveSubscription) {
      if (!user.next_case_available_time || user.next_case_available_time <= now) {
        canClaim = true;
      } else {
        nextAvailableTime = user.next_case_available_time;
        timeRemaining = formatTimeUntilNextCase(user.next_case_available_time);
      }
    }

    return res.json({
      success: true,
      data: {
        has_active_subscription: hasActiveSubscription,
        can_claim: canClaim,
        has_subscription_case_in_inventory: hasSubscriptionCaseInInventory,
        subscription_tier: user.subscription_tier,
        next_available_time: nextAvailableTime,
        time_remaining: timeRemaining,
        subscription_expiry_date: user.subscription_expiry_date
      }
    });

  } catch (error) {
    logger.error('Ошибка при получении статуса кейсов подписки:', error);
    return res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
}

module.exports = {
  claimSubscriptionCase,
  getSubscriptionCaseStatus
};
