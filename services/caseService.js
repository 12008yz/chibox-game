const db = require('../models');
const { Op } = require('sequelize');

/**
 * Выдача ежедневного кейса пользователю на основе шаблонов
 * @param {string} userId - ID пользователя
 * @param {number} subscriptionTier - уровень подписки пользователя
 */
async function giveDailyCaseToUser(userId, subscriptionTier) {
  const now = new Date();

  // Находим подходящие шаблоны кейсов для уровня подписки пользователя
  const caseTemplates = await db.CaseTemplate.findAll({
    where: {
      type: 'daily',
      min_subscription_tier: {
        [Op.lte]: subscriptionTier
      },
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
      // Создаём новый кейс для пользователя
      await db.Case.create({
        user_id: userId,
        template_id: template.id,
        subscription_tier: subscriptionTier,
        source: 'subscription',
        received_date: now,
        expires_at: new Date(now.getTime() + template.cooldown_hours * 3600000)
      });
    }
  }
}

module.exports = {
  giveDailyCaseToUser
};
