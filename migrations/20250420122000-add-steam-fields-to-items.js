'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('items', 'steam_classid', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'classid предмета в Steam Inventory'
    });
    await queryInterface.addColumn('items', 'steam_instanceid', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'instanceid предмета в Steam Inventory'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('items', 'steam_classid');
    await queryInterface.removeColumn('items', 'steam_instanceid');
  }
};
