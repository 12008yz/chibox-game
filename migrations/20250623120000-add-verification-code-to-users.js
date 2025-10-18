'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('users');

    if (!tableDescription.verification_code) {
      await queryInterface.addColumn('users', 'verification_code', {
        type: Sequelize.STRING(6),
        allowNull: true,
        comment: 'Код подтверждения email (6 цифр)'
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('users');

    if (tableDescription.verification_code) {
      await queryInterface.removeColumn('users', 'verification_code');
    }
  }
};
