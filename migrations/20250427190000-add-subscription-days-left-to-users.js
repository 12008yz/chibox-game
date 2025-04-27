'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'subscription_days_left', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Число дней подписки, которые остались у пользователя'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('users', 'subscription_days_left');
  }
};
