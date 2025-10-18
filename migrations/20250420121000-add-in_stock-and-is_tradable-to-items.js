'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('items');

    if (!tableDescription.in_stock) {
      await queryInterface.addColumn('items', 'in_stock', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Находится ли предмет на складе (Steam боте/аккаунте для выдачи)'
      });
    }

    if (!tableDescription.is_tradable) {
      await queryInterface.addColumn('items', 'is_tradable', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Можно ли сейчас передать предмет в трейде (учёт блокировки Steam)'
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('items');

    if (tableDescription.in_stock) {
      await queryInterface.removeColumn('items', 'in_stock');
    }

    if (tableDescription.is_tradable) {
      await queryInterface.removeColumn('items', 'is_tradable');
    }
  }
};
