const db = require('../models');
const { Op } = require('sequelize');

/**
 * Выдача ежедневного кейса пользователю на основе шаблонов
 * @param {string} userId - ID пользователя
 * @param {number} subscriptionTier - уровень подписки пользователя
 */
async function giveDailyCaseToUser(userId, subscriptionTier) {
  const now = new Date();

  // Получаем пользователя, чтобы проверить дату окончания подписки
  const user = await db.User.findByPk(userId);

  // Находим подходящие шаблоны кейсов только для точного уровня подписки пользователя
  const caseTemplates = await db.CaseTemplate.findAll({
    where: {
      type: 'daily',
      min_subscription_tier: subscriptionTier,
      is_active: true
    }
  });

  for (const template of caseTemplates) {
    // Проверяем, есть ли у пользователя уже кейс данного шаблона в инвентаре, который не истёк
    const existingCase = await db.UserInventory.findOne({
      where: {
        user_id: userId,
        case_template_id: template.id,
        item_type: 'case',
        status: 'inventory',
        [Op.or]: [
          { expires_at: null },
          { expires_at: { [Op.gt]: now } }
        ]
      }
    });

    if (!existingCase) {
      // Если у пользователя есть активная подписка, кейс не протухает (expires_at = null)
      // Иначе кейс протухает через cooldown_hours
      const expiresAt = (user && user.subscription_expiry_date && user.subscription_expiry_date > now)
        ? null
        : new Date(now.getTime() + template.cooldown_hours * 3600000);

      // Создаём новый кейс в инвентаре пользователя
      await db.UserInventory.create({
        user_id: userId,
        item_id: null, // Для кейсов item_id не используется
        item_type: 'case',
        case_template_id: template.id,
        source: 'subscription',
        status: 'inventory',
        acquisition_date: now,
        expires_at: expiresAt
      });

      // Создаем уведомление о получении кейса
      await db.Notification.create({
        user_id: userId,
        title: 'Новый кейс!',
        message: `Вы получили ежедневный кейс: ${template.name}`,
        type: 'success',
        category: 'case',
        link: '/inventory',
        importance: 2,
        data: {
          case_template_id: template.id,
          subscription_tier: subscriptionTier
        }
      });
    }
  }
}

/**
 * Добавление кейса в инвентарь пользователя
 * @param {string} userId - ID пользователя
 * @param {string} caseTemplateId - ID шаблона кейса
 * @param {string} source - источник получения кейса ('achievement', 'mission', 'gift', 'event')
 * @param {Date} expiresAt - дата истечения кейса (необязательно)
 * @returns {Object} созданный кейс в инвентаре
 */
async function addCaseToInventory(userId, caseTemplateId, source = 'system', expiresAt = null) {
  const caseTemplate = await db.CaseTemplate.findByPk(caseTemplateId);
  if (!caseTemplate) {
    throw new Error('Шаблон кейса не найден');
  }

  if (!caseTemplate.is_active) {
    throw new Error('Кейс неактивен');
  }

  const inventoryCase = await db.UserInventory.create({
    user_id: userId,
    item_id: null,
    item_type: 'case',
    case_template_id: caseTemplateId,
    source: source,
    status: 'inventory',
    acquisition_date: new Date(),
    expires_at: expiresAt
  });

  // Создаем уведомление
  await db.Notification.create({
    user_id: userId,
    title: 'Новый кейс получен!',
    message: `Вы получили кейс: ${caseTemplate.name}`,
    type: 'success',
    category: 'case',
    link: '/inventory',
    importance: 2,
    data: {
      case_template_id: caseTemplateId,
      source: source,
      inventory_case_id: inventoryCase.id
    }
  });

  return inventoryCase;
}

/**
 * Получение кейсов пользователя из инвентаря
 * @param {string} userId - ID пользователя
 * @param {boolean} includeExpired - включать ли просроченные кейсы
 * @returns {Array} массив кейсов из инвентаря
 */
async function getUserCasesFromInventory(userId, includeExpired = false) {
  const whereCondition = {
    user_id: userId,
    item_type: 'case',
    status: 'inventory'
  };

  if (!includeExpired) {
    whereCondition[Op.or] = [
      { expires_at: null },
      { expires_at: { [Op.gt]: new Date() } }
    ];
  }

  return await db.UserInventory.findAll({
    where: whereCondition,
    include: [{
      model: db.CaseTemplate,
      as: 'case_template'
    }],
    order: [['acquisition_date', 'DESC']]
  });
}

/**
 * Удаление просроченных кейсов из инвентаря
 * @param {string} userId - ID пользователя (необязательно, если не указан - удаляет у всех)
 */
async function removeExpiredCases(userId = null) {
  const whereCondition = {
    item_type: 'case',
    status: 'inventory',
    expires_at: {
      [Op.lt]: new Date()
    }
  };

  if (userId) {
    whereCondition.user_id = userId;
  }

  const expiredCases = await db.UserInventory.findAll({
    where: whereCondition,
    include: [{
      model: db.CaseTemplate,
      as: 'case_template'
    }]
  });

  for (const expiredCase of expiredCases) {
    // Помечаем как использованный вместо удаления для сохранения истории
    expiredCase.status = 'used';
    expiredCase.transaction_date = new Date();
    await expiredCase.save();

    // Уведомляем пользователя об истечении кейса
    await db.Notification.create({
      user_id: expiredCase.user_id,
      title: 'Кейс просрочен',
      message: `Срок действия кейса "${expiredCase.case_template?.name || 'Неизвестный кейс'}" истек`,
      type: 'warning',
      category: 'case',
      importance: 1,
      data: {
        expired_case_id: expiredCase.id,
        case_template_id: expiredCase.case_template_id
      }
    });
  }

  return expiredCases.length;
}

module.exports = {
  giveDailyCaseToUser,
  addCaseToInventory,
  getUserCasesFromInventory,
  removeExpiredCases
};
