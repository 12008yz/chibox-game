'use strict';
const { v4: uuidv4 } = require('uuid');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Сначала получим все категории
    const categoryRows = await queryInterface.sequelize.query(
      'SELECT id, name FROM item_categories;',
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    // Создадим карту категорий по их названиям
    const categoryMap = {};
    categoryRows.forEach(category => {
      categoryMap[category.name] = category.id;
    });

    // Если категории не найдены, создадим дефолтные ID
    const weaponCategoryId = categoryMap['Оружие'] || uuidv4();
    const armorCategoryId = categoryMap['Броня'] || uuidv4();
    const cosmeticCategoryId = categoryMap['Косметика'] || uuidv4();
    const currencyCategoryId = categoryMap['Валюта'] || uuidv4();
    const rareCategoryId = categoryMap['Редкости'] || uuidv4();

    // Создаем массив предметов
    const items = [
      // Оружие
      {
        id: uuidv4(),
        name: 'Стандартный меч',
        description: 'Обычный меч, не имеющий особых свойств',
        image_url: '/images/items/standard_sword.png',
        category_id: weaponCategoryId,
        rarity: 'common',
        value: 10.00,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'Пламенный клинок',
        description: 'Меч, наполненный огненной силой',
        image_url: '/images/items/flame_sword.png',
        category_id: weaponCategoryId,
        rarity: 'rare',
        value: 150.00,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'Легендарный лук',
        description: 'Лук, созданный эльфийскими мастерами',
        image_url: '/images/items/legendary_bow.png',
        category_id: weaponCategoryId,
        rarity: 'legendary',
        value: 500.00,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },

      // Броня
      {
        id: uuidv4(),
        name: 'Кольчуга',
        description: 'Стандартная кольчужная броня',
        image_url: '/images/items/chainmail.png',
        category_id: armorCategoryId,
        rarity: 'common',
        value: 20.00,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'Стальные латы',
        description: 'Прочная броня из закаленной стали',
        image_url: '/images/items/steel_armor.png',
        category_id: armorCategoryId,
        rarity: 'rare',
        value: 200.00,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'Драконья броня',
        description: 'Броня из чешуи древнего дракона',
        image_url: '/images/items/dragon_armor.png',
        category_id: armorCategoryId,
        rarity: 'epic',
        value: 400.00,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },

      // Косметика
      {
        id: uuidv4(),
        name: 'Простая шляпа',
        description: 'Обычная шляпа без особых свойств',
        image_url: '/images/items/simple_hat.png',
        category_id: cosmeticCategoryId,
        rarity: 'common',
        value: 5.00,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'Модный плащ',
        description: 'Стильный плащ с узорами',
        image_url: '/images/items/fancy_cloak.png',
        category_id: cosmeticCategoryId,
        rarity: 'rare',
        value: 100.00,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'Корона короля',
        description: 'Золотая корона с драгоценными камнями',
        image_url: '/images/items/king_crown.png',
        category_id: cosmeticCategoryId,
        rarity: 'legendary',
        value: 1000.00,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },

      // Валюта
      {
        id: uuidv4(),
        name: 'Мешочек монет',
        description: 'Небольшой мешок с монетами',
        image_url: '/images/items/coin_pouch.png',
        category_id: currencyCategoryId,
        rarity: 'common',
        value: 50.00,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'Сундук золота',
        description: 'Сундук, полный золотых монет',
        image_url: '/images/items/gold_chest.png',
        category_id: currencyCategoryId,
        rarity: 'rare',
        value: 250.00,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },

      // Редкости
      {
        id: uuidv4(),
        name: 'Старинная книга',
        description: 'Древняя книга с таинственными письменами',
        image_url: '/images/items/ancient_book.png',
        category_id: rareCategoryId,
        rarity: 'epic',
        value: 350.00,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'Магический кристалл',
        description: 'Кристалл, излучающий странную энергию',
        image_url: '/images/items/magic_crystal.png',
        category_id: rareCategoryId,
        rarity: 'legendary',
        value: 800.00,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      }
    ];

    return queryInterface.bulkInsert('items', items);
  },

  down: async (queryInterface, Sequelize) => {
    return queryInterface.bulkDelete('items', null, {});
  }
};
