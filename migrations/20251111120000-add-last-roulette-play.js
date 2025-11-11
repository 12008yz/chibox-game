'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable('users');

    // Добавляем поле для времени последней игры в рулетку
    if (!tableDescription.last_roulette_play) {
      await queryInterface.addColumn('users', 'last_roulette_play', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Время последней игры в рулетку'
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable('users');

    if (tableDescription.last_roulette_play) {
      await queryInterface.removeColumn('users', 'last_roulette_play');
    }
  }
};
