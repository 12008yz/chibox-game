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
    // Проверяем, есть ли у пользователя уже неоткрытый кейс данного шаблона, который не истёк
    const existingCase = await db.Case.findOne({
      where: {
        user_id: userId,
        template_id: template.id,
        is_opened: false,
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

      // Создаём новый кейс для пользователя
      await db.Case.create({
        user_id: userId,
        template_id: template.id,
        subscription_tier: subscriptionTier,
        source: 'subscription',
        received_date: now,
        expires_at: expiresAt
      });
    }
  }
}

module.exports = {
  giveDailyCaseToUser
};
