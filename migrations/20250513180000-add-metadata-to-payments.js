'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('payments', 'metadata', {
      type: Sequelize.JSONB,
      allowNull: true,
      comment: 'Дополнительные данные платежа (например, tierId)'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('payments', 'metadata');
  }
};
