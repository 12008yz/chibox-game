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
        attributes: ['id', 'subscription_tier', 'last_reset_date', 'next_case_available_time']
      });

      // Получаем кейсы из инвентаря
      userCases = await db.UserInventory.findAll({
        where: {
          user_id: userId,
          item_type: 'case',
          status: 'inventory',
          [db.Sequelize.Op.or]: [
            { expires_at: null },
            { expires_at: { [db.Sequelize.Op.gt]: new Date() } }
          ]
        },
        include: [{
          model: db.CaseTemplate,
          as: 'case_template',
          attributes: ['id', 'name', 'type', 'color_scheme', 'image_url', 'description', 'price']
        }],
        order: [['acquisition_date', 'DESC']]
      });
    }

    // Разделяем кейсы на категории и добавляем next_available_time для каждого
    const freeCases = caseTemplates.filter(c => !c.price || c.price <= 0).map(c => ({
      ...c.toJSON(),
      next_available_time: user?.next_case_available_time || null
    }));

    const paidCases = caseTemplates.filter(c => c.price && c.price > 0).map(c => ({
      ...c.toJSON(),
      next_available_time: null // Для платных кейсов таймер не нужен
    }));

    logger.info('Получен список кейсов');
    return res.json({
      success: true,
      free_cases: freeCases,
      paid_cases: paidCases,
      user_cases: userCases.map(c => ({
        id: c.id,
        inventory_case_id: c.id,
        name: c.case_template?.name || 'Неизвестный кейс',
        acquisition_date: c.acquisition_date,
        expires_at: c.expires_at,
        case_template: c.case_template,
        source: c.source,
        is_paid: c.source === 'purchase'
      })),
      user_subscription_tier: user?.subscription_tier || 0,
      next_case_available_time: user?.next_case_available_time || null
    });
  } catch (error) {
    logger.error('Ошибка получения кейсов:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  getCases
};
