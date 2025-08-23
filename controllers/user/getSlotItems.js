const { Item, User } = require('../../models');
const { logger } = require('../../utils/logger');
const { Op } = require('sequelize');

/**
 * Получение предметов для слот-игры
 * Возвращает только специальные предметы слота с изображениями
 */
const getSlotItems = async (req, res) => {
  try {
    // Получаем только предметы слота с origin = 'slot_machine'
    const items = await Item.findAll({
      where: {
        origin: 'slot_machine', // только предметы слота
        is_available: true,
        in_stock: true,
        image_url: {
          [Op.not]: null,
          [Op.ne]: ''
        },
        price: {
          [Op.gt]: 0
        }
      },
      attributes: [
        'id',
        'name',
        'image_url',
        'price',
        'rarity',
        'weapon_type',
        'skin_name',
        'steam_market_hash_name'
      ],
      order: [
        ['rarity', 'ASC'], // сначала дешевые
        ['price', 'ASC']   // потом по цене
      ]
    });

    if (items.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Предметы для слота не найдены. Запустите скрипт add-slot-items.js'
      });
    }

    // Преобразуем в нужный формат
    const slotItems = items.map(item => ({
      id: item.id,
      name: item.name,
      image_url: item.image_url,
      price: parseFloat(item.price) || 0,
      rarity: item.rarity,
      weapon_type: item.weapon_type,
      skin_name: item.skin_name,
      steam_market_hash_name: item.steam_market_hash_name
    }));

    // Группируем предметы по редкости для статистики
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

    slotItems.forEach(item => {
      const rarity = item.rarity || 'consumer';
      if (itemsByRarity[rarity]) {
        itemsByRarity[rarity].push(item);
      }
    });

    logger.info(`Получено ${slotItems.length} предметов для слота`);

    res.json({
      success: true,
      data: {
        items: slotItems,
        total_count: slotItems.length,
        rarity_distribution: Object.fromEntries(
          Object.entries(itemsByRarity).map(([rarity, items]) => [rarity, items.length])
        ),
        message: 'Предметы слота загружены успешно'
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
