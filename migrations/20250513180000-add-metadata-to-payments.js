'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('payments');

    if (!tableDescription.metadata) {
      await queryInterface.addColumn('payments', 'metadata', {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Дополнительные данные платежа (например, tierId)'
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('payments');

    if (tableDescription.metadata) {
      await queryInterface.removeColumn('payments', 'metadata');
    }
  }
};
