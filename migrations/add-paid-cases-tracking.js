'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('users');

    if (!tableDescription.paid_cases_bought_today) {
      await queryInterface.addColumn('users', 'paid_cases_bought_today', {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false,
        comment: 'Количество покупных кейсов, купленных сегодня'
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('users');

    if (tableDescription.paid_cases_bought_today) {
      await queryInterface.removeColumn('users', 'paid_cases_bought_today');
    }
  }
};
