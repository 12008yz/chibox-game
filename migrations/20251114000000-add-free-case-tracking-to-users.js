'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'free_case_claim_count', {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      allowNull: false,
      comment: 'Количество открытых бесплатных кейсов (1111)'
    });

    await queryInterface.addColumn('users', 'free_case_first_claim_date', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Дата первого открытия бесплатного кейса'
    });

    await queryInterface.addColumn('users', 'free_case_last_claim_date', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Дата последнего открытия бесплатного кейса'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('users', 'free_case_claim_count');
    await queryInterface.removeColumn('users', 'free_case_first_claim_date');
    await queryInterface.removeColumn('users', 'free_case_last_claim_date');
  }
};
