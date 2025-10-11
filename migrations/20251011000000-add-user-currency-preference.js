'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'preferred_currency', {
      type: Sequelize.ENUM('RUB', 'USD', 'EUR', 'GBP', 'CNY'),
      defaultValue: 'RUB',
      allowNull: false,
      comment: 'Предпочитаемая валюта пользователя для отображения цен'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('users', 'preferred_currency');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_users_preferred_currency";');
  }
};
