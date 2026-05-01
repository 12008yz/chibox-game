'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('users');
    if (!table.subscription_streak_start_date) {
      await queryInterface.addColumn('users', 'subscription_streak_start_date', {
        type: Sequelize.DATEONLY,
        allowNull: true,
        comment: 'Первый день (UTC) текущей непрерывной серии активной подписки; null если нет серии'
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('users');
    if (table.subscription_streak_start_date) {
      await queryInterface.removeColumn('users', 'subscription_streak_start_date');
    }
  }
};
