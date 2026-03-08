'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'is_bot', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Служебный аккаунт бота для фиктивной активности (вход запрещён)'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('users', 'is_bot');
  }
};
