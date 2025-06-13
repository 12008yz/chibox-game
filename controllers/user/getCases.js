const db = require('../../models');
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

async function getCases(req, res) {
  try {
    const userId = req.user?.id;

    // Получаем все активные шаблоны кейсов
    const caseTemplates = await db.CaseTemplate.findAll({
      where: { is_active: true },
      order: [['sort_order', 'ASC'], ['price', 'ASC']],
      attributes: [
        'id', 'name', 'description', 'image_url', 'animation_url',
        'type', 'min_subscription_tier', 'price', 'color_scheme',
        'guaranteed_min_value', 'cooldown_hours', 'max_opens_per_user'
      ]
    });

    // Если пользователь авторизован, получаем информацию о его кейсах
    let userCases = [];
    let user = null;
    if (userId) {
      user = await db.User.findByPk(userId, {
        attributes: ['id', 'subscription_tier', 'paid_cases_bought_today', 'last_reset_date']
      });

      userCases = await db.Case.findAll({
        where: { user_id: userId, is_opened: false },
        include: [{
          model: db.CaseTemplate,
          as: 'template',
          attributes: ['id', 'name', 'type', 'color_scheme', 'image_url']
        }],
        order: [['received_date', 'DESC']]
      });
    }

    // Разделяем кейсы на категории
    const freeCases = caseTemplates.filter(c => !c.price || c.price <= 0);
    const paidCases = caseTemplates.filter(c => c.price && c.price > 0);

    logger.info('Получен список кейсов');
    return res.json({
      success: true,
      free_cases: freeCases,
      paid_cases: paidCases,
      user_cases: userCases.map(c => ({
        id: c.id,
        name: c.name,
        received_date: c.received_date,
        template: c.template,
        is_paid: c.is_paid
      })),
      user_subscription_tier: user?.subscription_tier || 0
    });
  } catch (error) {
    logger.error('Ошибка получения кейсов:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  getCases
};
