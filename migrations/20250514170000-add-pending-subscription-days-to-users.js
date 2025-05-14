'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'pending_subscription_days', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Количество бонусных дней подписки, ожидающих активации'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('users', 'pending_subscription_days');
  }
};
