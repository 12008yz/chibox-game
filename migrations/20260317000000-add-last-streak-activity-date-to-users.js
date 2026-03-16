'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'last_streak_activity_date', {
      type: Sequelize.DATEONLY,
      allowNull: true,
      comment: 'Последний календарный день, когда учтён визит для ежедневной серии (не логин)'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('users', 'last_streak_activity_date');
  }
};
