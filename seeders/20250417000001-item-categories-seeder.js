'use strict';
const { v4: uuidv4 } = require('uuid');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    return queryInterface.bulkInsert('item_categories', [
      {
        id: uuidv4(),
        name: 'Оружие',
        description: 'Различные виды оружия',
        icon_url: '/images/categories/weapon.png',
        sort_order: 1,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'Броня',
        description: 'Защитная экипировка',
        icon_url: '/images/categories/armor.png',
        sort_order: 2,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'Косметика',
        description: 'Декоративные предметы',
        icon_url: '/images/categories/cosmetic.png',
        sort_order: 3,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'Валюта',
        description: 'Игровая валюта и бонусы',
        icon_url: '/images/categories/currency.png',
        sort_order: 4,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'Редкости',
        description: 'Коллекционные предметы',
        icon_url: '/images/categories/rare.png',
        sort_order: 5,
        created_at: new Date(),
        updated_at: new Date()
      }
    ]);
  },

  down: async (queryInterface, Sequelize) => {
    return queryInterface.bulkDelete('item_categories', null, {});
  }
};
