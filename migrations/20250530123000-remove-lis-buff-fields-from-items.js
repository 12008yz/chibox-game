'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Удаляем поля, связанные с LIS и BUFF
    return Promise.all([
      queryInterface.removeColumn('items', 'lis_id'),
      queryInterface.removeColumn('items', 'lis_rarity'),
      queryInterface.removeColumn('items', 'lis_quality'),
      queryInterface.removeColumn('items', 'lis_type'),
      queryInterface.removeColumn('items', 'lis_exterior'),
      queryInterface.removeColumn('items', 'lis_weapon'),
      queryInterface.removeColumn('items', 'lis_category'),
      queryInterface.removeColumn('items', 'lis_tags'),
      queryInterface.removeColumn('items', 'buff_id'),
      queryInterface.removeColumn('items', 'buff_rarity'),
      queryInterface.removeColumn('items', 'buff_quality'),
      queryInterface.removeColumn('items', 'buff_type'),
      queryInterface.removeColumn('items', 'buff_exterior'),
      queryInterface.removeColumn('items', 'buff_weapon'),
      queryInterface.removeColumn('items', 'buff_category'),
      queryInterface.removeColumn('items', 'buff_tags'),
      // Удаляем индекс по lis_id
      queryInterface.removeIndex('items', ['lis_id'])
    ]);
  },

  down: async (queryInterface, Sequelize) => {
    // Восстанавливаем поля при откате миграции
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
      queryInterface.addIndex('items', ['lis_id']),
      queryInterface.addColumn('items', 'buff_id', {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true
      }),
      queryInterface.addColumn('items', 'buff_rarity', { type: Sequelize.STRING }),
      queryInterface.addColumn('items', 'buff_quality', { type: Sequelize.STRING }),
      queryInterface.addColumn('items', 'buff_type', { type: Sequelize.STRING }),
      queryInterface.addColumn('items', 'buff_exterior', { type: Sequelize.STRING }),
      queryInterface.addColumn('items', 'buff_weapon', { type: Sequelize.STRING }),
      queryInterface.addColumn('items', 'buff_category', { type: Sequelize.STRING }),
      queryInterface.addColumn('items', 'buff_tags', { type: Sequelize.JSONB })
    ]);
  }
};
