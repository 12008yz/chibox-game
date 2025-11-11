const db = require('../models');
const { Op } = require('sequelize');

// Добавляем in-memory блокировку для предотвращения race conditions
const claimLocks = new Map();

/**
 * Выдача ежедневного кейса пользователю на основе шаблонов
 * @param {string} userId - ID пользователя
 * @param {number} subscriptionTier - уровень подписки пользователя
 */
async function giveDailyCaseToUser(userId, subscriptionTier) {
  console.log(`[CASE DEBUG] giveDailyCaseToUser called: userId=${userId}, subscriptionTier=${subscriptionTier}`);

  // Проверяем, нет ли уже активного запроса для этого пользователя
  const lockKey = `claim_${userId}`;
  if (claimLocks.has(lockKey)) {
    throw new Error('Уже выполняется получение кейса. Пожалуйста, подождите.');
  }

  // Устанавливаем блокировку
  claimLocks.set(lockKey, Date.now());

  try {
    // Используем транзакцию для атомарности операций
    await db.sequelize.transaction(async (transaction) => {
      const now = new Date();

      // Получаем пользователя с блокировкой для записи
      const user = await db.User.findByPk(userId, {
        lock: transaction.LOCK.UPDATE,
        transaction
      });

      if (!user) {
        throw new Error('Пользователь не найден');
      }

      // Находим подходящие шаблоны кейсов только для точного уровня подписки пользователя
      const caseTemplates = await db.CaseTemplate.findAll({
        where: {
          type: 'daily',
          min_subscription_tier: subscriptionTier,
          is_active: true
        },
        transaction
      });

      console.log(`[CASE DEBUG] Found ${caseTemplates.length} case templates for tier ${subscriptionTier}`);
      caseTemplates.forEach(t => console.log(`[CASE DEBUG] Template: id=${t.id}, name=${t.name}, min_tier=${t.min_subscription_tier}`));

      for (const template of caseTemplates) {
        // Проверяем, есть ли у пользователя уже кейс данного шаблона в инвентаре, который не истёк
        // Используем блокировку для чтения чтобы предотвратить создание дубликатов
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
          },
          lock: transaction.LOCK.SHARE,
          transaction
        });

        if (!existingCase) {
          // Дополнительная проверка - есть ли кейс, созданный в последние 30 секунд
          // Это защищает от случаев, когда предыдущий запрос еще не завершился
          const recentCase = await db.UserInventory.findOne({
            where: {
              user_id: userId,
              case_template_id: template.id,
              item_type: 'case',
              source: 'subscription',
              acquisition_date: {
                [Op.gte]: new Date(now.getTime() - 30 * 1000) // последние 30 секунд
              }
            },
            transaction
          });

          if (recentCase) {
            console.log(`Обнаружен недавно созданный кейс для пользователя ${userId}, шаблон ${template.id}`);
            continue; // Пропускаем создание кейса
          }

          // Если у пользователя есть активная подписка, кейс не протухает (expires_at = null)
          // ИЗМЕНЕНО: Кейс протухает через 10 секунд вместо часов
          const expiresAt = (user && user.subscription_expiry_date && user.subscription_expiry_date > now)
            ? null
            : new Date(now.getTime() + 10 * 1000); // 10 секунд вместо template.cooldown_hours * 3600000

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
          }, { transaction });

          // Уведомление о получении ежедневного кейса убрано - настройки пользователя
        }
      }
    });
  } finally {
    // Убираем блокировку после завершения операции
    claimLocks.delete(lockKey);
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

  // Уведомление о получении кейса убрано - настройки пользователя

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
      category: 'general',
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
