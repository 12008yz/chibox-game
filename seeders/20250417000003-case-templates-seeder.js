'use strict';
const { v4: uuidv4 } = require('uuid');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Получим все предметы
    const itemRows = await queryInterface.sequelize.query(
      'SELECT id, name, rarity, price FROM items;',
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    // Сгруппируем предметы по редкости для удобного доступа
    const itemsByRarity = {
      common: [],
      uncommon: [],
      rare: [],
      epic: [],
      legendary: []
    };

    itemRows.forEach(item => {
      if (itemsByRarity[item.rarity]) {
        itemsByRarity[item.rarity].push({ id: item.id, name: item.name, price: parseFloat(item.price) });
      } else {
        itemsByRarity.common.push({ id: item.id, name: item.name, price: parseFloat(item.price) });
      }
    });

    // Сохраним ID для использования в последующих сидерах
    const dailyCaseId = uuidv4();
    const premiumCaseId = uuidv4();
    const eliteCaseId = uuidv4();
    const eventCaseId = uuidv4();

    // Общая функция для создания конфигурации пула предметов
    const createItemPoolConfig = (commonChance, uncommonChance, rareChance, epicChance, legendaryChance) => {
      const itemPoolConfig = {};

      // Добавляем предметы каждой редкости с соответствующими шансами
      const addItemsWithChances = (items, totalChance, rarityName) => {
        if (items.length === 0) return;

        const chancePerItem = totalChance / items.length;
        items.forEach(item => {
          itemPoolConfig[item.id] = {
            id: item.id,
            name: item.name,
            rarity: rarityName,
            probability: chancePerItem,
            price: item.price
          };
        });
      };

      addItemsWithChances(itemsByRarity.common, commonChance, 'common');
      addItemsWithChances(itemsByRarity.uncommon, uncommonChance, 'uncommon');
      addItemsWithChances(itemsByRarity.rare, rareChance, 'rare');
      addItemsWithChances(itemsByRarity.epic, epicChance, 'epic');
      addItemsWithChances(itemsByRarity.legendary, legendaryChance, 'legendary');

      return itemPoolConfig;
    };

    return queryInterface.bulkInsert('case_templates', [
      {
        id: dailyCaseId,
        name: 'Ежедневный кейс',
        description: 'Бесплатный кейс, доступный каждые 24 часа',
        image_url: '/images/cases/daily_case.png',
        animation_url: '/animations/case_open_basic.mp4',
        type: 'daily',
        min_subscription_tier: 0, // Доступен всем
        is_active: true,
        cooldown_hours: 24,
        price: null, // Бесплатный
        item_pool_config: JSON.stringify(createItemPoolConfig(0.75, 0.15, 0.08, 0.015, 0.005)),
        sort_order: 1,
        color_scheme: 'blue',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: premiumCaseId,
        name: 'Премиум кейс',
        description: 'Премиум кейс с повышенным шансом выпадения редких предметов',
        image_url: '/images/cases/premium_case.png',
        animation_url: '/animations/case_open_premium.mp4',
        type: 'premium',
        min_subscription_tier: 1, // Минимум 1 уровень подписки
        is_active: true,
        cooldown_hours: 24,
        price: 100.00, // Стоимость для покупки
        item_pool_config: JSON.stringify(createItemPoolConfig(0.40, 0.30, 0.20, 0.08, 0.02)),
        sort_order: 2,
        color_scheme: 'purple',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: eliteCaseId,
        name: 'Элитный кейс',
        description: 'Элитный кейс с гарантированными редкими предметами',
        image_url: '/images/cases/elite_case.png',
        animation_url: '/animations/case_open_elite.mp4',
        type: 'premium',
        min_subscription_tier: 0, // Доступен всем для покупки
        is_active: true,
        price: 250.00, // Стоимость для покупки
        item_pool_config: JSON.stringify(createItemPoolConfig(0.10, 0.20, 0.40, 0.20, 0.10)),
        sort_order: 3,
        color_scheme: 'gold',
        guaranteed_min_value: 100.00, // Гарантия минимальной стоимости выпадающего предмета
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: eventCaseId,
        name: 'Праздничный кейс',
        description: 'Специальный кейс, доступный во время праздников',
        image_url: '/images/cases/event_case.png',
        animation_url: '/animations/case_open_event.mp4',
        type: 'event',
        min_subscription_tier: 0,
        is_active: false, // Изначально неактивен
        availability_start: new Date(new Date().getFullYear(), 11, 20), // 20 декабря
        availability_end: new Date(new Date().getFullYear(), 0, 10),   // 10 января
        price: 150.00,
        item_pool_config: JSON.stringify(createItemPoolConfig(0.30, 0.25, 0.25, 0.15, 0.05)),
        sort_order: 4,
        color_scheme: 'red',
        created_at: new Date(),
        updated_at: new Date()
      }
    ]);
  },

  down: async (queryInterface, Sequelize) => {
    return queryInterface.bulkDelete('case_templates', null, {});
  }
};
