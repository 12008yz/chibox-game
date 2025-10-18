'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('users');

    if (!tableDescription.slots_played_today) {
      await queryInterface.addColumn('users', 'slots_played_today', {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false,
        comment: "Количество спинов в слот-машине за сегодня"
      });
    }

    if (!tableDescription.last_slot_reset_date) {
      await queryInterface.addColumn('users', 'last_slot_reset_date', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата последнего сброса счетчика спинов слот-машины (в 16:00 МСК)"
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('users');

    if (tableDescription.slots_played_today) {
      await queryInterface.removeColumn('users', 'slots_played_today');
    }

    if (tableDescription.last_slot_reset_date) {
      await queryInterface.removeColumn('users', 'last_slot_reset_date');
    }
  }
};
