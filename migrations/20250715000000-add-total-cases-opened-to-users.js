'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('users');

    if (!tableDescription.total_cases_opened) {
      await queryInterface.addColumn('users', 'total_cases_opened', {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false,
        comment: 'Общее количество открытых кейсов за всю историю'
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('users');

    if (tableDescription.total_cases_opened) {
      await queryInterface.removeColumn('users', 'total_cases_opened');
    }
  }
};
