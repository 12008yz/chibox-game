'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('items', 'asset_id', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'ID ассета на CS.Money'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('items', 'asset_id');
  }
};
