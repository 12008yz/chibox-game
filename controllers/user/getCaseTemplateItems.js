const { CaseTemplate, Item, User, CaseItemDrop } = require('../../models');
const { logger } = require('../../utils/logger');
const { calculateModifiedDropWeights } = require('../../utils/dropWeightCalculator');

/**
 * Рассчитать правильный вес предмета на основе его цены
 * @param {number} price - цена предмета
 * @returns {number} правильный вес предмета
 */
function calculateCorrectWeightByPrice(price) {
  price = parseFloat(price) || 0;

  // Система весов на основе цены для создания правильного распределения
  if (price >= 50000) return 0.005;     // 0.5% - легендарные
  if (price >= 30000) return 0.008;     // 0.8% - мифические
  if (price >= 20000) return 0.015;     // 1.5% - эпические
  if (price >= 15000) return 0.025;     // 2.5% - очень редкие
  if (price >= 10000) return 0.04;      // 4% - редкие
  if (price >= 8000) return 0.06;       // 6% - необычные+
  if (price >= 5000) return 0.1;        // 10% - необычные
  if (price >= 3000) return 0.2;        // 20% - обычные+
  if (price >= 1000) return 0.35;       // 35% - обычные
  if (price >= 500) return 0.5;         // 50% - частые
  if (price >= 100) return 0.7;         // 70% - очень частые
  return 1.0;                           // 100% - базовые/дешевые
}

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
            'subscription_bonus_percentage',
            'subscription_tier'
          ]
        });

        // Получаем уже выпавшие предметы для пользователей Статус++ (3 уровень подписки)
        let droppedItemIds = [];
        if (user && user.subscription_tier >= 3) {
          const droppedItems = await CaseItemDrop.findAll({
            where: {
              user_id: user.id,
              case_template_id: caseTemplateId
            },
            attributes: ['item_id']
          });
          droppedItemIds = droppedItems.map(drop => drop.item_id);
          logger.info(`Пользователь Статус++ ${user.id} уже получал из кейса ${caseTemplateId}: ${droppedItemIds.length} предметов`);
        }

        if (user && user.total_drop_bonus_percentage > 0) {
          logger.info(`Расчет модифицированных шансов для пользователя ${user.id}, бонус: ${user.total_drop_bonus_percentage}%`);

          // Рассчитываем модифицированные веса
          const modifiedItems = calculateModifiedDropWeights(itemsWithChances, user.total_drop_bonus_percentage);

          // Рассчитываем общий вес для расчета процентов
          const totalWeight = modifiedItems.reduce((sum, item) => sum + (item.modifiedWeight || item.drop_weight || 0), 0);

          // Добавляем информацию о шансах к каждому предмету
          itemsWithChances = modifiedItems.map(item => {
            const isAlreadyDropped = droppedItemIds.includes(item.id);
            const weight = isAlreadyDropped && user.subscription_tier >= 3 ? 0 : (item.modifiedWeight || item.drop_weight || 0);
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
              bonus_applied: item.bonusApplied,
              // Добавляем информацию о том, что предмет уже выпадал
              is_already_dropped: isAlreadyDropped && user.subscription_tier >= 3,
              is_excluded: isAlreadyDropped && user.subscription_tier >= 3
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

    // Если модификация не была применена, рассчитываем базовые шансы на основе правильных весов
    if (!userBonusInfo) {
      // Получаем информацию о пользователе для определения уже выпавших предметов
      let droppedItemIds = [];
      let userSubscriptionTier = 0;

      if (req.user && req.user.id) {
        try {
          const user = await User.findByPk(req.user.id, {
            attributes: ['id', 'subscription_tier']
          });

          if (user) {
            userSubscriptionTier = user.subscription_tier || 0;

            // Получаем уже выпавшие предметы для пользователей Статус++ (3 уровень подписки)
            if (userSubscriptionTier >= 3) {
              const droppedItems = await CaseItemDrop.findAll({
                where: {
                  user_id: user.id,
                  case_template_id: caseTemplateId
                },
                attributes: ['item_id']
              });
              droppedItemIds = droppedItems.map(drop => drop.item_id);
              logger.info(`Пользователь Статус++ ${user.id} уже получал из кейса ${caseTemplateId}: ${droppedItemIds.length} предметов (базовые шансы)`);
            }
          }
        } catch (error) {
          logger.error('Ошибка при получении информации о пользователе для базовых шансов:', error);
        }
      }

      // Рассчитываем правильные веса на основе цен вместо drop_weight из БД
      const itemsWithCorrectWeights = [];
      let totalWeight = 0;

      for (const item of itemsWithChances) {
        const itemData = item.toJSON ? item.toJSON() : item;
        const price = parseFloat(itemData.price) || 0;
        const isAlreadyDropped = droppedItemIds.includes(itemData.id);
        const correctWeight = isAlreadyDropped && userSubscriptionTier >= 3 ? 0 : calculateCorrectWeightByPrice(price);

        itemsWithCorrectWeights.push({
          ...itemData,
          correctWeight: correctWeight,
          isAlreadyDropped: isAlreadyDropped,
          userSubscriptionTier: userSubscriptionTier
        });
        totalWeight += correctWeight;
      }

      itemsWithChances = itemsWithCorrectWeights.map(item => {
        const weight = item.correctWeight;
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
          drop_chance_percent: Math.round(chance * 100) / 100,
          modified_weight: null,
          weight_multiplier: 1,
          bonus_applied: 0,
          correct_weight: weight, // Добавляем для отладки
          // Добавляем информацию о том, что предмет уже выпадал
          is_already_dropped: item.isAlreadyDropped && item.userSubscriptionTier >= 3,
          is_excluded: item.isAlreadyDropped && item.userSubscriptionTier >= 3
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
