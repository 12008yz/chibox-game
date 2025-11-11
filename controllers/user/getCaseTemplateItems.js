const { CaseTemplate, Item, User, CaseItemDrop } = require('../../models');
const { logger } = require('../../utils/logger');
const { calculateModifiedDropWeights, calculateCorrectWeightByPrice } = require('../../utils/dropWeightCalculator');
const { seededShuffle } = require('../../utils/seededShuffle');

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

        // Получаем уже выпавшие предметы для всех пользователей
        let droppedItemIds = [];
        if (user) {
          console.log(`DEBUG: Ищем выпавшие предметы для пользователя ${user.id} в кейсе ${caseTemplateId}`);

          const droppedItems = await CaseItemDrop.findAll({
            where: {
              user_id: user.id,
              case_template_id: caseTemplateId
            },
            attributes: ['item_id', 'dropped_at', 'case_id']
          });

          droppedItemIds = droppedItems.map(drop => drop.item_id);

          console.log(`DEBUG: Найдено выпавших предметов: ${droppedItems.length}`);
          if (droppedItems.length > 0) {
            console.log(`DEBUG: Детали выпавших предметов:`, droppedItems.map(drop => ({
              item_id: drop.item_id,
              dropped_at: drop.dropped_at,
              case_id: drop.case_id
            })));
          }

          logger.info(`Пользователь ${user.id} уже получал из кейса ${caseTemplateId}: ${droppedItemIds.length} предметов`);
        }

        if (user && user.total_drop_bonus_percentage > 0) {
          logger.info(`Расчет модифицированных шансов для пользователя ${user.id}, бонус: ${user.total_drop_bonus_percentage}%`);

          // Рассчитываем модифицированные веса
          const modifiedItems = calculateModifiedDropWeights(itemsWithChances, user.total_drop_bonus_percentage);

          // Для пользователей Статус++ исключаем дубликаты ТОЛЬКО для ежедневного кейса Статус++
          const filteredItems = (user.subscription_tier >= 3 && caseTemplateId === '44444444-4444-4444-4444-444444444444')
            ? modifiedItems.filter(item => !droppedItemIds.includes(item.id))
            : modifiedItems;

          // Рассчитываем общий вес для расчета процентов (только из неисключенных предметов)
          const totalWeight = filteredItems.reduce((sum, item) => sum + (item.modifiedWeight || item.drop_weight || 0), 0);

          // Добавляем информацию о шансах к каждому предмету
          itemsWithChances = modifiedItems.map(item => {
            const isAlreadyDropped = droppedItemIds.includes(item.id);
            // isExcluded только для ежедневного кейса Статус++
            const isExcluded = isAlreadyDropped && user.subscription_tier >= 3 && caseTemplateId === '44444444-4444-4444-4444-444444444444';
            const weight = isExcluded ? 0 : (item.modifiedWeight || item.drop_weight || 0);
            const chance = totalWeight > 0 && !isExcluded ? (weight / totalWeight * 100) : 0;

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
              modified_weight: weight,
              drop_chance_percent: chance < 0.01 && chance > 0 ? parseFloat(chance.toFixed(6)) : Math.round(chance * 100) / 100, // Для малых шансов показываем до 6 знаков
              weight_multiplier: item.weightMultiplier,
              bonus_applied: item.bonusApplied,
              // Добавляем информацию о том, что предмет уже выпадал
              is_already_dropped: isAlreadyDropped,
              is_excluded: isExcluded
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
              console.log(`DEBUG (базовые шансы): Ищем выпавшие предметы для пользователя Статус++ ${user.id} в кейсе ${caseTemplateId}`);

              const droppedItems = await CaseItemDrop.findAll({
                where: {
                  user_id: user.id,
                  case_template_id: caseTemplateId
                },
                attributes: ['item_id', 'dropped_at', 'case_id']
              });

              droppedItemIds = droppedItems.map(drop => drop.item_id);

              console.log(`DEBUG (базовые шансы): Найдено выпавших предметов: ${droppedItems.length}`);
              if (droppedItems.length > 0) {
                console.log(`DEBUG (базовые шансы): Детали выпавших предметов:`, droppedItems.map(drop => ({
                  item_id: drop.item_id,
                  dropped_at: drop.dropped_at,
                  case_id: drop.case_id
                })));
              }

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
        // isExcluded только для ежедневного кейса Статус++
        const isExcluded = isAlreadyDropped && userSubscriptionTier >= 3 && caseTemplateId === '44444444-4444-4444-4444-444444444444';
        const correctWeight = isExcluded ? 0 : calculateCorrectWeightByPrice(price);

        itemsWithCorrectWeights.push({
          ...itemData,
          correctWeight: correctWeight,
          isAlreadyDropped: isAlreadyDropped,
          isExcluded: isExcluded,
          userSubscriptionTier: userSubscriptionTier
        });

        // Добавляем к общему весу только неисключенные предметы
        if (!isExcluded) {
          totalWeight += correctWeight;
        }
      }

      itemsWithChances = itemsWithCorrectWeights.map(item => {
        const weight = item.correctWeight;
        // is_excluded только для ежедневного кейса Статус++ - в остальных кейсах всегда false
        const isExcludedForCase = item.isExcluded && caseTemplateId === '44444444-4444-4444-4444-444444444444';
        const chance = totalWeight > 0 && !isExcludedForCase ? (weight / totalWeight * 100) : 0;

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
          drop_chance_percent: chance < 0.01 && chance > 0 ? parseFloat(chance.toFixed(6)) : Math.round(chance * 100) / 100, // Для малых шансов показываем до 6 знаков
          modified_weight: null,
          weight_multiplier: 1,
          bonus_applied: 0,
          correct_weight: weight, // Добавляем для отладки
          // Добавляем информацию о том, что предмет уже выпадал
          is_already_dropped: item.isAlreadyDropped,
          is_excluded: isExcludedForCase // ВАЖНО: is_excluded теперь true ТОЛЬКО для ежедневного кейса Статус++
        };
      });
    }

    // УБИРАЕМ ДУБЛИКАТЫ для кейса "Статус++" (44444444-4444-4444-4444-444444444444)
    let finalItems = itemsWithChances;
    if (caseTemplateId === '44444444-4444-4444-4444-444444444444') {
      const uniqueItemsMap = new Map();
      itemsWithChances.forEach(item => {
        if (!uniqueItemsMap.has(item.id)) {
          uniqueItemsMap.set(item.id, item);
        }
      });
      finalItems = Array.from(uniqueItemsMap.values());
      console.log(`DEBUG: Убрали дубликаты для кейса Статус++. Было: ${itemsWithChances.length}, стало: ${finalItems.length}`);
    }

    // Перемешиваем предметы используя ID кейса как seed для синхронизации с клиентом
    const shuffledItems = seededShuffle(finalItems, caseTemplateId);

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
        items: shuffledItems,
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
