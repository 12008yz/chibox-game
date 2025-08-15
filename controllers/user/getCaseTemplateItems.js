const { CaseTemplate, Item, User } = require('../../models');
const { logger } = require('../../utils/logger');
const { calculateModifiedDropWeights } = require('../../utils/dropWeightCalculator');

const getCaseTemplateItems = async (req, res) => {
  try {
    const { caseTemplateId } = req.params;

    // Проверяем валидность UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(caseTemplateId)) {
      return res.status(400).json({
        success: false,
        message: 'Неверный формат ID кейс-темплейта'
      });
    }

    // Получаем кейс-темплейт с предметами через связующую таблицу
    const caseTemplate = await CaseTemplate.findByPk(caseTemplateId, {
      include: [{
        model: Item,
        as: 'items',
        through: {
          attributes: [] // Не включаем атрибуты связующей таблицы
        },
        attributes: [
          'id',
          'name',
          'description',
          'image_url',
          'price',
          'rarity',
          'drop_weight',
          'category_id',
          'is_tradable',
          'in_stock'
        ]
      }],
      attributes: ['id', 'name', 'description', 'type', 'is_active']
    });

    if (!caseTemplate) {
      return res.status(404).json({
        success: false,
        message: 'Кейс-темплейт не найден'
      });
    }

    if (!caseTemplate.is_active) {
      return res.status(404).json({
        success: false,
        message: 'Кейс-темплейт недоступен'
      });
    }

    let itemsWithChances = caseTemplate.items || [];
    let userBonusInfo = null;

    // Если пользователь аутентифицирован, рассчитываем модифицированные шансы
    if (req.user && req.user.id) {
      try {
        const user = await User.findByPk(req.user.id, {
          attributes: [
            'id',
            'total_drop_bonus_percentage',
            'achievements_bonus_percentage',
            'level_bonus_percentage',
            'subscription_bonus_percentage'
          ]
        });

        if (user && user.total_drop_bonus_percentage > 0) {
          logger.info(`Расчет модифицированных шансов для пользователя ${user.id}, бонус: ${user.total_drop_bonus_percentage}%`);

          // Рассчитываем модифицированные веса
          const modifiedItems = calculateModifiedDropWeights(itemsWithChances, user.total_drop_bonus_percentage);

          // Рассчитываем общий вес для расчета процентов
          const totalWeight = modifiedItems.reduce((sum, item) => sum + (item.modifiedWeight || item.drop_weight || 0), 0);

          // Добавляем информацию о шансах к каждому предмету
          itemsWithChances = modifiedItems.map(item => {
            const weight = item.modifiedWeight || item.drop_weight || 0;
            const chance = totalWeight > 0 ? (weight / totalWeight * 100) : 0;

            return {
              id: item.id,
              name: item.name,
              description: item.description,
              image_url: item.image_url,
              price: item.price,
              rarity: item.rarity,
              drop_weight: item.drop_weight,
              category_id: item.category_id,
              is_tradable: item.is_tradable,
              in_stock: item.in_stock,
              // Добавляем информацию о модифицированных шансах
              modified_weight: item.modifiedWeight,
              drop_chance_percent: Math.round(chance * 100) / 100, // Округляем до 2 знаков
              weight_multiplier: item.weightMultiplier,
              bonus_applied: item.bonusApplied
            };
          });

          userBonusInfo = {
            total_bonus: user.total_drop_bonus_percentage,
            achievements_bonus: user.achievements_bonus_percentage || 0,
            level_bonus: user.level_bonus_percentage || 0,
            subscription_bonus: user.subscription_bonus_percentage || 0
          };
        }
      } catch (error) {
        logger.error('Ошибка при расчете модифицированных шансов:', error);
        // Продолжаем с базовыми весами при ошибке
      }
    }

    // Если модификация не была применена, рассчитываем базовые шансы
    if (!userBonusInfo) {
      const totalWeight = itemsWithChances.reduce((sum, item) => sum + (parseFloat(item.drop_weight) || 0), 0);

      itemsWithChances = itemsWithChances.map(item => {
        const weight = parseFloat(item.drop_weight) || 0;
        const chance = totalWeight > 0 ? (weight / totalWeight * 100) : 0;

        return {
          ...item.toJSON ? item.toJSON() : item,
          drop_chance_percent: Math.round(chance * 100) / 100,
          modified_weight: null,
          weight_multiplier: 1,
          bonus_applied: 0
        };
      });
    }

    // Возвращаем предметы с рассчитанными шансами
    res.json({
      success: true,
      data: {
        caseTemplate: {
          id: caseTemplate.id,
          name: caseTemplate.name,
          description: caseTemplate.description,
          type: caseTemplate.type
        },
        items: itemsWithChances,
        user_bonus: userBonusInfo
      }
    });

  } catch (error) {
    logger.error('Ошибка при получении предметов кейс-темплейта:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = { getCaseTemplateItems };
