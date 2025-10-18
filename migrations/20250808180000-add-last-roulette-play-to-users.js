'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('users');

    if (!tableDescription.last_roulette_play) {
      await queryInterface.addColumn('users', 'last_roulette_play', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Время последней игры в рулетку'
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('users');

    if (tableDescription.last_roulette_play) {
      await queryInterface.removeColumn('users', 'last_roulette_play');
    }
  }
};
