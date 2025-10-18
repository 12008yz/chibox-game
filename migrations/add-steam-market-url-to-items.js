'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('items');

    if (!tableDescription.steam_market_url) {
      await queryInterface.addColumn('items', 'steam_market_url', {
        type: Sequelize.STRING(1024),
        allowNull: true,
        comment: 'Ссылка на Steam Market для проверки цены и категории предмета'
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('items');

    if (tableDescription.steam_market_url) {
      await queryInterface.removeColumn('items', 'steam_market_url');
    }
  }
};
