// migrations/[timestamp]-add-buff-fields-to-items.js

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.addColumn('items', 'buff_rarity', { type: Sequelize.STRING }),
      queryInterface.addColumn('items', 'buff_quality', { type: Sequelize.STRING }),
      queryInterface.addColumn('items', 'buff_type', { type: Sequelize.STRING }),
      queryInterface.addColumn('items', 'buff_exterior', { type: Sequelize.STRING }),
      queryInterface.addColumn('items', 'buff_weapon', { type: Sequelize.STRING }),
      queryInterface.addColumn('items', 'buff_category', { type: Sequelize.STRING }),
      queryInterface.addColumn('items', 'buff_tags', { type: Sequelize.JSONB }),
    ]);
  },

  down: async (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.removeColumn('items', 'buff_rarity'),
      queryInterface.removeColumn('items', 'buff_quality'),
      queryInterface.removeColumn('items', 'buff_type'),
      queryInterface.removeColumn('items', 'buff_exterior'),
      queryInterface.removeColumn('items', 'buff_weapon'),
      queryInterface.removeColumn('items', 'buff_category'),
      queryInterface.removeColumn('items', 'buff_tags'),
    ]);
  }
};