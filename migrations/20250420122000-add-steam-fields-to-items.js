'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('items');

    if (!tableDescription.steam_classid) {
      await queryInterface.addColumn('items', 'steam_classid', {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'classid предмета в Steam Inventory'
      });
    }

    if (!tableDescription.steam_instanceid) {
      await queryInterface.addColumn('items', 'steam_instanceid', {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'instanceid предмета в Steam Inventory'
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('items');

    if (tableDescription.steam_classid) {
      await queryInterface.removeColumn('items', 'steam_classid');
    }

    if (tableDescription.steam_instanceid) {
      await queryInterface.removeColumn('items', 'steam_instanceid');
    }
  }
};
