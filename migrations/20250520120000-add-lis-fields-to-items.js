// migrations/20250520120000-add-lis-fields-to-items.js
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Добавляем новые поля для работы с LIS-Skins
    return Promise.all([
      queryInterface.addColumn('items', 'lis_id', {
        type: Sequelize.STRING,
        allowNull: true
      }),
      queryInterface.addColumn('items', 'lis_rarity', { type: Sequelize.STRING }),
      queryInterface.addColumn('items', 'lis_quality', { type: Sequelize.STRING }),
      queryInterface.addColumn('items', 'lis_type', { type: Sequelize.STRING }),
      queryInterface.addColumn('items', 'lis_exterior', { type: Sequelize.STRING }),
      queryInterface.addColumn('items', 'lis_weapon', { type: Sequelize.STRING }),
      queryInterface.addColumn('items', 'lis_category', { type: Sequelize.STRING }),
      queryInterface.addColumn('items', 'lis_tags', { type: Sequelize.JSONB }),
      // Добавляем индекс для lis_id
      queryInterface.addIndex('items', ['lis_id'])
    ]);
  },

  down: async (queryInterface, Sequelize) => {
    // Удаляем поля при откате миграции
    return Promise.all([
      queryInterface.removeColumn('items', 'lis_id'),
      queryInterface.removeColumn('items', 'lis_rarity'),
      queryInterface.removeColumn('items', 'lis_quality'),
      queryInterface.removeColumn('items', 'lis_type'),
      queryInterface.removeColumn('items', 'lis_exterior'),
      queryInterface.removeColumn('items', 'lis_weapon'),
      queryInterface.removeColumn('items', 'lis_category'),
      queryInterface.removeColumn('items', 'lis_tags')
    ]);
  }
};
