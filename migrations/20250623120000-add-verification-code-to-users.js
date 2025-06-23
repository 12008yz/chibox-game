'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'verification_code', {
      type: Sequelize.STRING(6),
      allowNull: true,
      comment: 'Код подтверждения email (6 цифр)'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('users', 'verification_code');
  }
};
