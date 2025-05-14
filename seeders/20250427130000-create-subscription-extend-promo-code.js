'use strict';

const { v4: uuidv4 } = require('uuid');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Создаем промокод с типом 'subscription_extend', добавляющий 3 дня к подписке
    await queryInterface.bulkInsert('promo_codes', [{
      id: uuidv4(),
      code: 'TEST3DAYS',
      description: 'Промокод для тестирования: добавляет 3 дня к подписке',
      type: 'subscription_extend',
      value: 3,
      is_percentage: false,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    }], {});
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('promo_codes', { code: 'TEST3DAYS' }, {});
  }
};
