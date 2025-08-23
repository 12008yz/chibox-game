const { Item, User } = require('../../models');
const { logger } = require('../../utils/logger');
const { Op } = require('sequelize');

/**
 * Получение предметов для слот-игры
 * Возвращает ассортимент предметов всех редкостей для отображения в слоте
 */
const getSlotItems = async (req, res) => {
  try {
    // Получаем предметы всех редкостей для разнообразия в слоте
    const items = await Item.findAll({
      where: {
        is_available: true,
        in_stock: true,
        price: {
          [Op.gt]: 0 // Только предметы с ценой больше 0
        }
      },
      attributes: [
        'id',
        'name',
        'image_url',
        'price',
        'rarity',
        'weapon_type',
        'skin_name'
      ],
      order: [
        ['rarity', 'DESC'], // Сначала редкие
        ['price', 'DESC']   // Потом по цене
      ],
      limit: 200 // Достаточно для разнообразия в слоте
    });

    if (items.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Предметы для слота не найдены'
      });
    }

    // Группируем предметы по редкости для баланса
    const itemsByRarity = {
      consumer: [],
      industrial: [],
      milspec: [],
      restricted: [],
      classified: [],
      covert: [],
      contraband: [],
      exotic: []
    };

    items.forEach(item => {
      const rarity = item.rarity || 'consumer';
      if (itemsByRarity[rarity]) {
        itemsByRarity[rarity].push({
          id: item.id,
          name: item.name,
          image_url: item.image_url,
          price: parseFloat(item.price) || 0,
          rarity: item.rarity,
          weapon_type: item.weapon_type,
          skin_name: item.skin_name
        });
      }
    });

    // Создаем сбалансированный набор для слота
    const slotItems = [];

    // Добавляем предметы каждой редкости в нужном количестве
    const rarityLimits = {
      consumer: 30,     // 30 дешевых предметов
      industrial: 25,   // 25 промышленных
      milspec: 20,      // 20 армейских
      restricted: 15,   // 15 запрещенных
      classified: 10,   // 10 засекреченных
      covert: 8,        // 8 секретных
      contraband: 5,    // 5 контрабанды
      exotic: 3         // 3 экзотических
    };

    Object.entries(rarityLimits).forEach(([rarity, limit]) => {
      const rarityItems = itemsByRarity[rarity] || [];
      const itemsToAdd = rarityItems.slice(0, limit);
      slotItems.push(...itemsToAdd);
    });

    // Если предметов все еще мало, добавляем больше дешевых
    if (slotItems.length < 50) {
      const additionalConsumer = itemsByRarity.consumer.slice(30, 80);
      slotItems.push(...additionalConsumer);
    }

    logger.info(`Получено ${slotItems.length} предметов для слота`);

    res.json({
      success: true,
      data: {
        items: slotItems,
        total_count: slotItems.length,
        rarity_distribution: Object.fromEntries(
          Object.entries(itemsByRarity).map(([rarity, items]) => [rarity, items.length])
        )
      }
    });

  } catch (error) {
    logger.error('Ошибка при получении предметов для слота:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = { getSlotItems };
